export type TransactionAggregate = {
  product_id: string | null;
  currency: string;
  capture_count: number;
  gross_cents: number;
  refunded_cents: number;
  refunded_capture_count: number;
};

export type CurrencyTotals = { grossCents: number; refundedCents: number; tipsCents: number };

export function sumTransactionCurrencies(rows: TransactionAggregate[]) {
  return rows.reduce((totals, row) => {
    const total = totals.get(row.currency) ?? { grossCents: 0, refundedCents: 0, tipsCents: 0 };
    total.grossCents += row.gross_cents;
    total.refundedCents += row.refunded_cents;
    if (row.product_id === null) total.tipsCents += row.gross_cents;
    totals.set(row.currency, total);
    return totals;
  }, new Map<string, CurrencyTotals>());
}