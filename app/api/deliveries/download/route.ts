import { NextResponse } from "next/server";
import { z } from "zod";
import { allowRequest } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canDownloadProduct, verifyDeliveryToken } from "@/lib/delivery";

const inputSchema = z.object({
  checkoutId: z.string().uuid(),
  deliveryToken: z.string().min(40).max(64),
});

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid delivery request." }, { status: 400 });
  if (!(await allowRequest(`delivery:${parsed.data.checkoutId}`, 10, 60))) {
    return NextResponse.json({ error: "Too many download requests. Try again shortly." }, { status: 429 });
  }

  const admin = getSupabaseAdmin();
  const [{ data: access }, { data: checkout }] = await Promise.all([
    admin.from("product_delivery_access").select("token_hash,expires_at").eq("checkout_id", parsed.data.checkoutId).maybeSingle(),
    admin.from("checkout_orders").select("id,creator_id,product_id,status").eq("id", parsed.data.checkoutId).maybeSingle(),
  ]);
  if (!access || !checkout || !checkout.product_id || access.expires_at <= new Date().toISOString()) {
    return NextResponse.json({ error: "This download link is unavailable or expired." }, { status: 404 });
  }

  if (!verifyDeliveryToken(parsed.data.deliveryToken, access.token_hash)) {
    return NextResponse.json({ error: "This download link is invalid." }, { status: 403 });
  }
  if (checkout.status !== "CAPTURED") {
    return NextResponse.json({ error: "Payment has not been verified yet." }, { status: 409 });
  }

  const [{ data: transaction }, { data: product }] = await Promise.all([
    admin.from("payment_transactions").select("amount_cents,refunded_amount_cents,status").eq("checkout_id", checkout.id).maybeSingle(),
    admin.from("products").select("delivery_file_path").eq("id", checkout.product_id).eq("creator_id", checkout.creator_id).maybeSingle(),
  ]);
  if (!transaction || !product || !canDownloadProduct({
    checkoutStatus: checkout.status,
    productId: checkout.product_id,
    creatorId: checkout.creator_id,
    deliveryFilePath: product.delivery_file_path,
    amountCents: transaction.amount_cents,
    refundedAmountCents: transaction.refunded_amount_cents,
  })) {
    return NextResponse.json({ error: "This purchase is not eligible for a download." }, { status: 409 });
  }

  const fileName = product.delivery_file_path.split("/").pop() ?? "download";
  const { data: signedFile, error } = await admin.storage.from("product-deliveries").createSignedUrl(product.delivery_file_path, 120, { download: fileName });
  if (error || !signedFile) return NextResponse.json({ error: "Could not prepare the product download." }, { status: 503 });
  return NextResponse.json(
    { downloadUrl: signedFile.signedUrl, expiresInSeconds: 120 },
    { headers: { "Cache-Control": "no-store" } },
  );
}