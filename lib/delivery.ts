import { createHash, timingSafeEqual } from "node:crypto";

export function hashDeliveryToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyDeliveryToken(token: string, expectedHash: string) {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const suppliedHash = Buffer.from(hashDeliveryToken(token), "hex");
  const storedHash = Buffer.from(expectedHash, "hex");
  return suppliedHash.length === storedHash.length && timingSafeEqual(suppliedHash, storedHash);
}

export function canDownloadProduct(input: {
  checkoutStatus: string;
  productId: string | null;
  creatorId: string;
  deliveryFilePath: string | null;
  amountCents: number;
  refundedAmountCents: number;
}) {
  return input.checkoutStatus === "CAPTURED"
    && Boolean(input.productId)
    && Boolean(input.deliveryFilePath?.startsWith(`${input.creatorId}/`))
    && input.amountCents > 0
    && input.refundedAmountCents < input.amountCents;
}