import { describe, expect, it } from "vitest";
import { assertQuotePricingCurrency, quoteCurrencyFromMetadata } from "./quote-currency";

describe("explicit imported cost currency", () => {
  it.each(["USD", "MXN"] as const)("recognizes %s and allows the proposal to keep it", currency => {
    const metadata = { source: { kind: "threatdown-pdf", importMode: "items-with-costs",
      pricing: { sourceCurrency: "USD", currency, exchangeRate: currency === "USD" ? 1 : 20 } } };
    expect(quoteCurrencyFromMetadata(metadata)).toBe(currency);
    expect(() => assertQuotePricingCurrency(metadata, currency)).not.toThrow();
    expect(() => assertQuotePricingCurrency(metadata, currency === "USD" ? "MXN" : "USD")).toThrow("cambiar la etiqueta no convierte");
  });
  it("preserves the currency of a manual revision without carrying the old import operation", () => {
    expect(quoteCurrencyFromMetadata({ pricingCurrency: "USD" })).toBe("USD");
  });
  it.each([null, {}, { source: { kind: "threatdown-pdf", importMode: "items-only", currency: "USD" } },
    { source: { kind: "threatdown-pdf", importMode: "items-with-costs", pricing: { sourceCurrency: "USD", currency: "USD", exchangeRate: 20 } } }])(
    "does not invent a currency from legacy or inconsistent metadata %s", metadata => {
      expect(quoteCurrencyFromMetadata(metadata)).toBeUndefined();
      expect(() => assertQuotePricingCurrency(metadata, "MXN")).not.toThrow();
    });
});
