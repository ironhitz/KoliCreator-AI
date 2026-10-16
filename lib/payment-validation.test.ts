import { describe, expect, it } from "vitest";
import { validatePayPalCapture } from "./payment-validation";
import type { PayPalOrder } from "./paypal";

const expected = { paypalOrderId: "ORDER-12345678", checkoutId: "checkout-1", amountCents: 1299, currency: "USD" };
const validOrder: PayPalOrder = {
  id: "ORDER-12345678",
  status: "COMPLETED",
  purchase_units: [{
    custom_id: "checkout-1",
    payments: { captures: [{ id: "CAPTURE-12345678", status: "COMPLETED", amount: { value: "12.99", currency_code: "USD" } }] },
  }],
};

describe("validatePayPalCapture", () => {
  it("accepts a completed capture with the expected order, checkout, amount, and currency", () => {
    expect(validatePayPalCapture(validOrder, expected)).toEqual({ ok: true, captureId: "CAPTURE-12345678", capturedCents: 1299, currency: "USD" });
  });

  it.each([
    ["order mismatch", { ...validOrder, id: "ORDER-87654321" }],
    ["checkout mismatch", { ...validOrder, purchase_units: [{ ...validOrder.purchase_units?.[0], custom_id: "another-checkout" }] }],
    ["incomplete order", { ...validOrder, status: "APPROVED" }],
    ["incomplete capture", { ...validOrder, purchase_units: [{ ...validOrder.purchase_units?.[0], payments: { captures: [{ ...validOrder.purchase_units?.[0]?.payments?.captures?.[0], status: "PENDING" }] } }] }],
  ])("rejects %s", (_name, order) => {
    expect(validatePayPalCapture(order as PayPalOrder, expected)).toMatchObject({ ok: false, error: "PayPal has not confirmed a completed capture." });
  });

  it.each([
    ["wrong amount", { ...validOrder, purchase_units: [{ ...validOrder.purchase_units?.[0], payments: { captures: [{ ...validOrder.purchase_units?.[0]?.payments?.captures?.[0], amount: { value: "13.00", currency_code: "USD" } }] } }] }],
    ["unsupported precision", { ...validOrder, purchase_units: [{ ...validOrder.purchase_units?.[0], payments: { captures: [{ ...validOrder.purchase_units?.[0]?.payments?.captures?.[0], amount: { value: "12.999", currency_code: "USD" } }] } }] }],
    ["wrong currency", { ...validOrder, purchase_units: [{ ...validOrder.purchase_units?.[0], payments: { captures: [{ ...validOrder.purchase_units?.[0]?.payments?.captures?.[0], amount: { value: "12.99", currency_code: "EUR" } }] } }] }],
  ])("rejects %s", (_name, order) => {
    expect(validatePayPalCapture(order as PayPalOrder, expected)).toMatchObject({ ok: false, error: "Captured amount does not match the offer." });
  });
});