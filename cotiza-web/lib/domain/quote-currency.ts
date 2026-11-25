export type QuoteCurrency = "USD" | "MXN";

// Only explicit pricing metadata has a currency. Legacy quotes keep their
// existing behavior; a PDF's source currency alone never labels manual prices.
export function quoteCurrencyFromMetadata(metadata: unknown): QuoteCurrency | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = metadata as Record<string, unknown>;
  if (value.pricingCurrency === "USD" || value.pricingCurrency === "MXN") return value.pricingCurrency;
  if (!value.source || typeof value.source !== "object") return undefined;
  const source = value.source as Record<string, unknown>;
  if (source.kind !== "threatdown-pdf" || source.importMode !== "items-with-costs"
    || !source.pricing || typeof source.pricing !== "object") return undefined;
  const pricing = source.pricing as Record<string, unknown>;
  if (pricing.sourceCurrency !== "USD") return undefined;
  if (pricing.currency === "USD" && pricing.exchangeRate === 1) return "USD";
  if (pricing.currency === "MXN" && typeof pricing.exchangeRate === "number"
    && Number.isFinite(pricing.exchangeRate) && pricing.exchangeRate > 0 && pricing.exchangeRate <= 10_000) return "MXN";
  return undefined;
}

export function assertQuotePricingCurrency(metadata: unknown, requested: string) {
  const currency = quoteCurrencyFromMetadata(metadata);
  if (currency && requested !== currency) {
    throw new Error(`Los importes de esta cotización están en ${currency}. Para cambiar de moneda, vuelve a importar el PDF eligiendo la moneda y el tipo de cambio; cambiar la etiqueta no convierte los importes.`);
  }
}
