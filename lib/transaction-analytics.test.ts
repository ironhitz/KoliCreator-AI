import { describe, expect, it } from "vitest";
import { sumTransactionCurrencies, type TransactionAggregate } from "./transaction-analytics";

describe("sumTransactionCurrencies", () => {
  it("totals each currency separately and keeps tips distinct", () => {
    const rows: TransactionAggregate[] = [
      { product_id: "product-a", currency: "USD", capture_count: 2, gross_cents: 3000, refunded_cents: 500, refunded_capture_count: 1 },
      { product_id: null, currency: "USD", capture_count: 1, gross_cents: 500, refunded_cents: 0, refunded_capture_count: 0 },
      { product_id: "product-b", currency: "EUR", capture_count: 1, gross_cents: 900, refunded_cents: 200, refunded_capture_count: 1 },
    ];

    expect(sumTransactionCurrencies(rows)).toEqual(new Map([
      ["USD", { grossCents: 3500, refundedCents: 500, tipsCents: 500 }],
      ["EUR", { grossCents: 900, refundedCents: 200, tipsCents: 0 }],
    ]));
  });
});