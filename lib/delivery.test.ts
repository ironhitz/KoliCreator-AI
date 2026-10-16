import { describe, expect, it } from "vitest";
import { canDownloadProduct, hashDeliveryToken, verifyDeliveryToken } from "./delivery";

const validPurchase = {
  checkoutStatus: "CAPTURED",
  productId: "product-1",
  creatorId: "creator-1",
  deliveryFilePath: "creator-1/private-file.pdf",
  amountCents: 1200,
  refundedAmountCents: 0,
};

describe("digital delivery access", () => {
  it("verifies a matching token hash and rejects invalid hashes or tokens", () => {
    const token = "buyer-download-secret";
    const hash = hashDeliveryToken(token);
    expect(verifyDeliveryToken(token, hash)).toBe(true);
    expect(verifyDeliveryToken("wrong-token", hash)).toBe(false);
    expect(verifyDeliveryToken(token, "not-a-hash")).toBe(false);
  });

  it("allows a verified, non-refunded product purchase", () => {
    expect(canDownloadProduct(validPurchase)).toBe(true);
  });

  it.each([
    ["uncaptured", { ...validPurchase, checkoutStatus: "CREATED" }],
    ["tips", { ...validPurchase, productId: null }],
    ["fully refunded", { ...validPurchase, refundedAmountCents: 1200 }],
    ["missing file", { ...validPurchase, deliveryFilePath: null }],
    ["another creator's file", { ...validPurchase, deliveryFilePath: "other-creator/private-file.pdf" }],
  ])("blocks %s", (_reason, input) => {
    expect(canDownloadProduct(input as typeof validPurchase)).toBe(false);
  });

  it("keeps a partially refunded purchase eligible", () => {
    expect(canDownloadProduct({ ...validPurchase, refundedAmountCents: 100 })).toBe(true);
  });
});