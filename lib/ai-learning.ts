import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const aggregateValueSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/),
]);

const aggregateSchema = z.object({
  month_start: z.string(),
  product_id: z.string().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  transaction_count: aggregateValueSchema,
  gross_cents: aggregateValueSchema,
  net_cents: aggregateValueSchema,
  refund_count: aggregateValueSchema,
});

const productSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  kind: z.string(),
  price_cents: z.number().int(),
  currency: z.string(),
  is_published: z.boolean(),
});

function safeInteger(value: number | string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("AI learning aggregate is outside the safe integer range.");
  }
  return parsed;
}

export async function getVerifiedCreatorLearningContext(creatorId: string) {
  const supabase = getSupabaseAdmin();
  const [aggregateResult, productResult] = await Promise.all([
    supabase.rpc("creator_ai_learning_context", { p_creator_id: creatorId }),
    supabase
      .from("products")
      .select("id,title,description,kind,price_cents,currency,is_published")
      .eq("creator_id", creatorId)
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  if (aggregateResult.error) throw new Error("Could not read verified sales history.");
  if (productResult.error) throw new Error("Could not read creator product history.");

  const aggregates = z.array(aggregateSchema).parse(aggregateResult.data);
  const products = z.array(productSchema).parse(productResult.data ?? []);
  const productNames = new Map(products.map((product) => [product.id, product.title]));
  const months = new Map<string, { month: string; currency: string; transactionCount: number; grossCents: number; netCents: number; refundCount: number }>();
  const productPerformance = new Map<string, { productId: string | null; currency: string; transactionCount: number; grossCents: number; netCents: number; refundCount: number }>();

  for (const row of aggregates) {
    const count = safeInteger(row.transaction_count);
    const gross = safeInteger(row.gross_cents);
    const net = safeInteger(row.net_cents);
    const refunds = safeInteger(row.refund_count);
    const month = row.month_start.slice(0, 7);
    const monthKey = `${month}:${row.currency}`;
    const monthSummary = months.get(monthKey) ?? { month, currency: row.currency, transactionCount: 0, grossCents: 0, netCents: 0, refundCount: 0 };
    monthSummary.transactionCount = safeInteger(monthSummary.transactionCount + count);
    monthSummary.grossCents = safeInteger(monthSummary.grossCents + gross);
    monthSummary.netCents = safeInteger(monthSummary.netCents + net);
    monthSummary.refundCount = safeInteger(monthSummary.refundCount + refunds);
    months.set(monthKey, monthSummary);

    const productKey = `${row.product_id ?? "tip"}:${row.currency}`;
    const productSummary = productPerformance.get(productKey) ?? { productId: row.product_id, currency: row.currency, transactionCount: 0, grossCents: 0, netCents: 0, refundCount: 0 };
    productSummary.transactionCount = safeInteger(productSummary.transactionCount + count);
    productSummary.grossCents = safeInteger(productSummary.grossCents + gross);
    productSummary.netCents = safeInteger(productSummary.netCents + net);
    productSummary.refundCount = safeInteger(productSummary.refundCount + refunds);
    productPerformance.set(productKey, productSummary);
  }

  const currencies = new Set(aggregates.map((row) => row.currency));
  const currentMonth = new Date();
  for (let offset = 5; offset >= 0; offset -= 1) {
    const month = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - offset, 1))
      .toISOString()
      .slice(0, 7);
    for (const currency of currencies) {
      const key = `${month}:${currency}`;
      if (!months.has(key)) {
        months.set(key, { month, currency, transactionCount: 0, grossCents: 0, netCents: 0, refundCount: 0 });
      }
    }
  }

  return {
    reportingWindow: "Six calendar months, including the current month",
    monthlyPerformance: [...months.entries()]
      .map(([, summary]) => summary)
      .sort((first, second) => first.month.localeCompare(second.month) || first.currency.localeCompare(second.currency)),
    verifiedTransactionCount: [...productPerformance.values()].reduce((total, summary) => safeInteger(total + summary.transactionCount), 0),
    productPerformance: [...productPerformance.values()].map(({ productId, currency, ...summary }) => ({
      product: productId === null ? "Creator tips" : productNames.get(productId) ?? "Removed offer",
      currency,
      ...summary,
    })),
    catalog: products.map((product) => ({
      title: product.title,
      description: product.description.slice(0, 500),
      kind: product.kind,
      priceCents: product.price_cents,
      currency: product.currency,
      published: product.is_published,
    })),
  };
}
