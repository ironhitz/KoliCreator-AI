import { NextResponse } from "next/server";
import { paypalRequest } from "@/lib/paypal";
import { writeAudit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type WebhookEvent = {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: { value?: string; currency_code?: string };
    supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } };
  };
};

export async function POST(request: Request) {
  const event = await request.json().catch(() => null) as WebhookEvent | null;
  const headers = request.headers;
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!event?.id || !event.event_type || !webhookId) return NextResponse.json({ error: "Invalid webhook configuration or event." }, { status: 400 });

  try {
    const verification = await paypalRequest<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: event,
      }),
    });
    if (verification.verification_status !== "SUCCESS") return NextResponse.json({ error: "Webhook signature verification failed." }, { status: 401 });

    const admin = getSupabaseAdmin();
    const { data: existingEvent } = await admin.from("paypal_webhook_events").select("event_id").eq("event_id", event.id).maybeSingle();
    if (existingEvent) return NextResponse.json({ received: true, duplicate: true });

    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      const { data: checkout } = await admin.from("checkout_orders").select("*").eq("paypal_order_id", orderId).maybeSingle();
      const resource = event.resource;
      if (!checkout || resource?.status !== "COMPLETED" || !resource.amount || Math.round(Number(resource.amount.value) * 100) !== checkout.expected_amount_cents || resource.amount.currency_code !== checkout.currency) {
        await writeAudit("paypal.webhook.mismatch", { eventId: event.id, eventType: event.event_type, orderId });
        return NextResponse.json({ error: "Webhook capture did not match a known checkout." }, { status: 409 });
      }
      const { error } = await admin.from("payment_transactions").upsert({
        checkout_id: checkout.id,
        creator_id: checkout.creator_id,
        product_id: checkout.product_id,
        paypal_order_id: checkout.paypal_order_id,
        paypal_capture_id: resource.id,
        amount_cents: checkout.expected_amount_cents,
        currency: checkout.currency,
        status: "COMPLETED",
        source: "paypal_sandbox",
        captured_at: new Date().toISOString(),
      }, { onConflict: "paypal_capture_id", ignoreDuplicates: true });
      if (error) throw new Error("Could not record webhook capture.");
      await admin.from("checkout_orders").update({ status: "CAPTURED", captured_at: new Date().toISOString() }).eq("id", checkout.id);
    } else if (event.event_type === "PAYMENT.CAPTURE.REFUNDED" || event.event_type === "PAYMENT.REFUND.COMPLETED") {
      const captureId = event.resource?.supplementary_data?.related_ids?.capture_id ?? event.resource?.id;
      const refundAmountCents = Math.round(Number(event.resource?.amount?.value) * 100);
      const currency = event.resource?.amount?.currency_code;
      if (event.resource?.status !== "COMPLETED" || !captureId || !Number.isSafeInteger(refundAmountCents) || refundAmountCents <= 0) {
        return NextResponse.json({ error: "Invalid completed refund event." }, { status: 400 });
      }
      const { data: transaction } = await admin.from("payment_transactions").select("id,amount_cents,refunded_amount_cents,currency").eq("paypal_capture_id", captureId).maybeSingle();
      if (!transaction || currency !== transaction.currency || refundAmountCents > transaction.amount_cents - transaction.refunded_amount_cents) {
        await writeAudit("paypal.refund.mismatch", { eventId: event.id, captureId, refundAmountCents, currency });
        return NextResponse.json({ error: "Refund does not match a refundable capture." }, { status: 409 });
      }
      const { error: refundError } = await admin.from("payment_refunds").insert({ transaction_id: transaction.id, paypal_refund_id: event.id, amount_cents: refundAmountCents, currency });
      if (refundError && refundError.code !== "23505") throw new Error("Could not record refund event.");
      const { data: refunds, error: refundsError } = await admin.from("payment_refunds").select("amount_cents").eq("transaction_id", transaction.id);
      if (refundsError) throw new Error("Could not total verified refunds.");
      const refundedCents = (refunds ?? []).reduce((total, refund) => total + refund.amount_cents, 0);
      const { error: updateError } = await admin.from("payment_transactions").update({ refunded_amount_cents: refundedCents, status: refundedCents >= transaction.amount_cents ? "REFUNDED" : "PARTIALLY_REFUNDED" }).eq("id", transaction.id);
      if (updateError) throw new Error("Could not update verified transaction refund state.");
    }

    const { error: eventError } = await admin.from("paypal_webhook_events").insert({ event_id: event.id, event_type: event.event_type });
    if (eventError && eventError.code !== "23505") throw new Error("Could not record webhook event.");
    await writeAudit("paypal.webhook.processed", { eventId: event.id, eventType: event.event_type });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("PayPal webhook processing failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook processing failed." }, { status: 502 });
  }
}