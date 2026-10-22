import { z } from "zod";

export const MAX_QUOTE_AMOUNT = 99_999_999.99;
export const quoteInputIdSchema = z.string().trim().min(1).max(200);
export const quoteInputLineSchema = z.object({
  sku: z.string().trim().max(120).default(""),
  description: z.string().trim().min(1).max(4000),
  quantity: z.number().finite().int().positive().max(99_999_999),
  costUnit: z.number().finite().min(0).max(MAX_QUOTE_AMOUNT),
  priceUnit: z.number().finite().min(0).max(MAX_QUOTE_AMOUNT),
  lineType: z.enum(["product", "service"]).default("product"),
  serviceOrigin: z.string().trim().max(200).default(""),
});
export type QuoteInputLine = z.infer<typeof quoteInputLineSchema>;
export type QuoteInputSource = { kind: "template" | "excel" | "threatdown-pdf"; id?: string; revision?: string;
  commercial?: {
    currency: "USD"; targetCurrency: "MXN"; exchangeRate: number; marginPct: number;
    expiresOn: string; startsOn: string; endsOn: string; termMonths: number; preliminary: boolean;
    netTotal: number; reviewedBy: string | null;
    lines: Array<{ sku: string; quantity: number; costUnit: number; netTotal: number }>;
  };
};

export class QuoteInputError extends Error {
  constructor(message: string, public readonly status = 422) { super(message); }
}

export const roundQuoteMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// Shared by templates and Excel; adapters provide data, this contract prices it.
// V1 follows the editor's integer quantities. Reject decimals instead of rounding.
export function normalizeQuoteInput(lines: unknown) {
  const parsed = z.array(quoteInputLineSchema).min(1).max(2000).safeParse(lines);
  if (!parsed.success) throw new QuoteInputError("Revisa las partidas: descripción, cantidades enteras positivas y valores numéricos válidos.");
  const normalized = parsed.data.map((line) => {
    const costUnit = roundQuoteMoney(line.costUnit);
    const priceUnit = roundQuoteMoney(line.priceUnit);
    const marginPct = priceUnit > 0 ? roundQuoteMoney((priceUnit - costUnit) / priceUnit * 100) : 0;
    if (marginPct < -999.99 || marginPct > 999.99) throw new QuoteInputError("El margen de una partida excede el rango permitido.");
    return { ...line, costUnit, priceUnit, marginPct };
  });
  const totalCost = roundQuoteMoney(normalized.reduce((n, l) => n + l.quantity * l.costUnit, 0));
  const totalRevenue = roundQuoteMoney(normalized.reduce((n, l) => n + l.quantity * l.priceUnit, 0));
  const grossProfit = roundQuoteMoney(totalRevenue - totalCost);
  const avgMargin = totalRevenue > 0 ? roundQuoteMoney(grossProfit / totalRevenue * 100) : 0;
  if (totalCost > MAX_QUOTE_AMOUNT || totalRevenue > MAX_QUOTE_AMOUNT || Math.abs(grossProfit) > MAX_QUOTE_AMOUNT || Math.abs(avgMargin) > 999.99) {
    throw new QuoteInputError("Los totales exceden el máximo permitido de la cotización.");
  }
  return { lines: normalized, totals: { totalCost, totalRevenue, grossProfit, avgMargin } };
}
