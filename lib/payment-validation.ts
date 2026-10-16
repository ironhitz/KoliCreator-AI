import type { PayPalOrder } from "@/lib/paypal";

type CaptureExpectation = { paypalOrderId: string; checkoutId: string; amountCents: number; currency: string };
type CaptureValidation =
  | { ok: true; captureId: string; capturedCents: number; currency: string }
  | { ok: false; error: string };

function amountToCents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function validatePayPalCapture(order: PayPalOrder, expected: CaptureExpectation): CaptureValidation {
  const purchaseUnit = order.purchase_units?.[0];
  const capture = purchaseUnit?.payments?.captures?.[0];
  if (order.id !== expected.paypalOrderId || purchaseUnit?.custom_id !== expected.checkoutId || order.status !== "COMPLETED" || capture?.status !== "COMPLETED") {
    return { ok: false, error: "PayPal has not confirmed a completed capture." };
  }
  const capturedCents = amountToCents(capture.amount.value);
  if (capturedCents === null || capturedCents !== expected.amountCents || capture.amount.currency_code !== expected.currency) {
    return { ok: false, error: "Captured amount does not match the offer." };
  }
  return { ok: true, captureId: capture.id, capturedCents, currency: capture.amount.currency_code };
}