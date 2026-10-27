import { z } from "zod";

const money = z.number().finite().nonnegative().max(1e9).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001, "Usa hasta dos decimales");
const line = z.object({ sku: z.string().trim().min(1), quantity: z.number().int().positive().max(1e6), costUnit: money, priceUnit: money });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s);
const simulationSchema = z.object({
  currency: z.literal("MXN"), term: z.string().trim().min(1).max(100),
  source: z.string().trim().min(1).max(300), asOf: day,
  minMarginPct: z.number().finite().min(0).max(100).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001),
  fixed: z.array(line).max(200), alternatives: z.array(line.extend({ name: z.string().trim().min(1).max(100) })).min(1).max(5),
});
export const guidedQuoteSchema = simulationSchema.extend({ validUntil: day })
  .refine(v => v.validUntil >= v.asOf, "La referencia de precios está vencida");

/** Preview only. A source reference is a user declaration, not manufacturer verification or authorization. */
export function previewGuidedQuote(input: unknown) {
  return calculate(guidedQuoteSchema.parse(input));
}

/** Hypothetical saved-price simulation; no assertion that the prices are current. */
export function previewSavedQuote(input: unknown) {
  return calculate({ ...simulationSchema.parse(input), validUntil: null });
}

function calculate(data: z.infer<typeof simulationSchema> & { validUntil: string | null }) {
  const sum = (items: z.infer<typeof line>[], field: "costUnit" | "priceUnit") => {
    const cents = items.reduce((total, item) => total + Math.round(item[field] * 100) * item.quantity, 0);
    if (!Number.isSafeInteger(cents)) throw new Error("Importe fuera de rango");
    return cents;
  };
  return data.alternatives.map(alternative => {
    const items = [...data.fixed, alternative];
    const cost = sum(items, "costUnit"), revenue = sum(items, "priceUnit"), profit = revenue - cost;
    if (revenue <= 0) throw new Error("La venta debe ser mayor que cero");
    // Compare before rounding the display. This result never grants an exception.
    return { name: alternative.name, sku: alternative.sku, quantity: alternative.quantity,
      totalCost: cost / 100, totalRevenue: revenue / 100, profit: profit / 100,
      marginPct: profit / revenue * 100,
      belowMinimum: BigInt(profit) * BigInt(10000) < BigInt(revenue) * BigInt(Math.round(data.minMarginPct * 100)),
      source: data.source, validUntil: data.validUntil, term: data.term, currency: data.currency };
  });
}
