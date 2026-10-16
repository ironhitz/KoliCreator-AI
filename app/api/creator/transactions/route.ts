import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/auth";
import { allowRequest } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const querySchema = z.object({
  period: z.enum(["30d", "90d", "all"]).default("30d"),
  product: z.union([z.literal("all"), z.literal("tips"), z.string().uuid()]).default("all"),
  page: z.coerce.number().int().min(0).max(10000).default(0),
});

const pageSize = 25;
type AggregateRow = { product_id: string | null; currency: string; capture_count: number | string; gross_cents: number | string; refunded_cents: number | string; refunded_capture_count: number | string };

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to view transactions." }, { status: 401 });
  if (!(await allowRequest(`transactions:${user.id}`, 60, 60))) {
    return NextResponse.json({ error: "Too many transaction requests. Try again shortly." }, { status: 429 });
  }

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ period: params.get("period"), product: params.get("product"), page: params.get("page") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid transaction filters." }, { status: 400 });
  const { period, product, page } = parsed.data;
  const from = period === "all" ? null : new Date(Date.now() - Number(period.replace("d", "")) * 86400000).toISOString();
  const productId = product !== "all" && product !== "tips" ? product : null;
  const tipsOnly = product === "tips";
  const admin = getSupabaseAdmin();

  try {
    let rowsQuery = admin.from("payment_transactions")
      .select("id,product_id,amount_cents,refunded_amount_cents,currency,source,status,captured_at,paypal_capture_id", { count: "exact" })
      .eq("creator_id", user.id)
      .in("status", ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"])
      .order("captured_at", { ascending: false });
    if (from) rowsQuery = rowsQuery.gte("captured_at", from);
    if (productId) rowsQuery = rowsQuery.eq("product_id", productId);
    if (tipsOnly) rowsQuery = rowsQuery.is("product_id", null);

    const [{ data: rows, count, error: rowsError }, { data: summary, error: summaryError }, { data: productSummary, error: productSummaryError }] = await Promise.all([
      rowsQuery.range(page * pageSize, page * pageSize + pageSize - 1),
      admin.rpc("creator_transaction_summary", {
        p_creator_id: user.id,
        p_from: from,
        p_product_id: productId,
        p_tips_only: tipsOnly,
      }),
      admin.rpc("creator_transaction_summary", { p_creator_id: user.id, p_from: null, p_product_id: null, p_tips_only: false }),
    ]);
    if (rowsError || summaryError || productSummaryError) throw new Error("Could not load transaction analytics.");
    const normalizeSummary = (values: AggregateRow[] | null) => (values ?? []).map((row) => ({
      ...row,
      capture_count: Number(row.capture_count),
      gross_cents: Number(row.gross_cents),
      refunded_cents: Number(row.refunded_cents),
      refunded_capture_count: Number(row.refunded_capture_count),
    }));
    return NextResponse.json({ rows: rows ?? [], totalCount: count ?? 0, page, pageSize, summary: normalizeSummary(summary), productSummary: normalizeSummary(productSummary) });
  } catch (error) {
    console.error("Transaction analytics failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load transaction analytics." }, { status: 503 });
  }
}