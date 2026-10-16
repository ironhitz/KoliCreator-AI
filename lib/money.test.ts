import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("formats the currency using the requested locale", () => {
    expect(formatMoney(123456, "EUR", "de-DE")).toContain("1.234,56");
    expect(formatMoney(123456, "EUR", "de-DE")).toContain("€");
  });

  it("falls back to a valid USD amount for invalid currency codes", () => {
    expect(formatMoney(1234, "not-a-currency")).toContain("$12.34");
  });
});