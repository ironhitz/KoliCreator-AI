import { NextResponse } from "next/server";
import { z } from "zod";
import { paypalRequest, type PayPalOrder } from "@/lib/paypal";
import { allowRequest, writeAudit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const inputSchema = z.object({
  username: z.string().regex(/^[a-z0-9_]{3,30}$/),
  productId: z.string().uuid().optional(),
  tipAmountCents: z.number().int().min(100).max(10000000).optional(),
}).refine((input) => Boolean(input.productId) !== Boolean(input.tipAmountCents), {
  message: "Choose exactly one product or tip amount.",
});

export async function POST(request: Request) {
  let checkoutId: string | undefined;
  try {
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await allowRequest(`checkout:${forwardedFor}`, 10, 60))) {
      return NextResponse.json({ error: "Too many checkout attempts. Try again shortly." }, { status: 429 });
    }
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid checkout details." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin.from("profiles").select("id,username").eq("username", parsed.data.username).maybeSingle();
    if (!profile) return NextResponse.json({ error: "Creator storefront not found." }, { status: 404 });

    let product: { id: string; title: string; price_cents: number; currency: string } | null = null;
    if (parsed.data.productId) {
      const { data } = await admin.from("products").select("id,title,price_cents,currency").eq("id", parsed.data.productId).eq("creator_id", profile.id).eq("is_published", true).maybeSingle();
      if (!data) return NextResponse.json({ error: "This offer is not available." }, { status: 404 });
      product = data;
    }
    const amountCents = product?.price_cents ?? parsed.data.tipAmountCents!;
    const currency = product?.currency ?? "USD";
    checkoutId = crypto.randomUUID();
    const { error: insertError } = await admin.from("checkout_orders").insert({
      id: checkoutId,
      creator_id: profile.id,
      product_id: product?.id ?? null,
      kind: product ? "product" : "tip",
      expected_amount_cents: amountCents,
      currency,
      status: "CREATING",
    });
    if (insertError) throw new Error("Could not start checkout.");

    const amount = (amountCents / 100).toFixed(2);
    const paypalOrder = await paypalRequest<PayPalOrder>("/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": `create-${checkoutId}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: checkoutId,
          custom_id: checkoutId,
          description: product?.title ?? `Support ${profile.username}`,
          amount: { currency_code: currency, value: amount },
        }],
        application_context: {
          brand_name: "KoliCreator",
          user_action: "PAY_NOW",
          return_url: `${new URL(request.url).origin}/checkout/return?checkoutId=${checkoutId}`,
          cancel_url: `${new URL(request.url).origin}/checkout/cancel?checkoutId=${checkoutId}`,
        },
      }),
    });
    const approvalUrl = paypalOrder.links?.find((link) => link.rel === "approve")?.href;
    if (!approvalUrl) throw new Error("PayPal did not return an approval link.");

    const { error: updateError } = await admin.from("checkout_orders").update({ paypal_order_id: paypalOrder.id, status: "CREATED", updated_at: new Date().toISOString() }).eq("id", checkoutId);
    if (updateError) throw new Error("Could not save the PayPal order reference.");
    await writeAudit("paypal.order.created", { checkoutId, paypalOrderId: paypalOrder.id, amountCents, currency });
    return NextResponse.json({ approvalUrl, checkoutId, paypalOrderId: paypalOrder.id });
  } catch (error) {
    if (checkoutId) {
      try {
        await getSupabaseAdmin().from("checkout_orders").update({ status: "FAILED" }).eq("id", checkoutId);
      } catch {
        // Keep the original checkout error when database configuration is unavailable.
      }
    }
    console.error("PayPal order creation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start PayPal checkout." }, { status: 502 });
  }
}