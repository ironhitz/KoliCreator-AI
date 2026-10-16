import { NextResponse } from "next/server";
import { z } from "zod";
import { paypalRequest, type PayPalOrder } from "@/lib/paypal";
import { allowRequest, writeAudit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { validatePayPalCapture } from "@/lib/payment-validation";

const inputSchema = z.object({ checkoutId: z.string().uuid(), paypalOrderId: z.string().min(8).max(40) });

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment reference." }, { status: 400 });
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await allowRequest(`capture:${forwardedFor}`, 20, 60))) return NextResponse.json({ error: "Too many capture attempts. Try again shortly." }, { status: 429 });
  const admin = getSupabaseAdmin();
  const { data: checkout } = await admin.from("checkout_orders").select("*").eq("id", parsed.data.checkoutId).maybeSingle();
  if (!checkout || checkout.paypal_order_id !== parsed.data.paypalOrderId) {
    return NextResponse.json({ error: "This PayPal order does not match the checkout." }, { status: 404 });
  }

  if (checkout.status === "CAPTURED") {
    const { data: existing } = await admin.from("payment_transactions").select("paypal_capture_id,amount_cents,currency,status,captured_at").eq("checkout_id", checkout.id).maybeSingle();
    if (existing) return NextResponse.json({ status: existing.status, transaction: existing, alreadyCaptured: true });
  }
  if (!["CREATED", "APPROVED"].includes(checkout.status)) {
    return NextResponse.json({ error: "This checkout cannot be captured." }, { status: 409 });
  }

  try {
    const order = await paypalRequest<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(checkout.paypal_order_id)}/capture`, {
      method: "POST",
      headers: { "PayPal-Request-Id": `capture-${checkout.id}` },
      body: "{}",
    });
    const validation = validatePayPalCapture(order, {
      paypalOrderId: checkout.paypal_order_id,
      checkoutId: checkout.id,
      amountCents: checkout.expected_amount_cents,
      currency: checkout.currency,
    });
    if (!validation.ok) {
      if (validation.error === "Captured amount does not match the offer.") {
        await writeAudit("paypal.capture.mismatch", { checkoutId: checkout.id, expectedCents: checkout.expected_amount_cents, currency: checkout.currency });
      }
      return NextResponse.json({ error: validation.error }, { status: 409 });
    }
    const { captureId, capturedCents, currency } = validation;
    const capturedAt = new Date().toISOString();
    const { error: transactionError } = await admin.from("payment_transactions").upsert({
      checkout_id: checkout.id,
      creator_id: checkout.creator_id,
      product_id: checkout.product_id,
      paypal_order_id: order.id,
      paypal_capture_id: captureId,
      amount_cents: capturedCents,
      currency,
      status: "COMPLETED",
      source: "paypal_sandbox",
      captured_at: capturedAt,
    }, { onConflict: "paypal_capture_id", ignoreDuplicates: true });
    if (transactionError) throw new Error("Could not record the verified payment.");
    const { error: checkoutError } = await admin.from("checkout_orders").update({ status: "CAPTURED", captured_at: capturedAt, updated_at: capturedAt }).eq("id", checkout.id);
    if (checkoutError) throw new Error("Could not update checkout status.");
    await writeAudit("paypal.capture.completed", { checkoutId: checkout.id, paypalOrderId: order.id, paypalCaptureId: captureId, amountCents: capturedCents });
    return NextResponse.json({ status: "COMPLETED", transaction: { amount_cents: capturedCents, currency, captured_at: capturedAt } });
  } catch (error) {
    console.error("PayPal capture failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to verify PayPal payment." }, { status: 502 });
  }
}