import { z } from "zod";
import { normalizeQuoteInput, QuoteInputError, roundQuoteMoney } from "./quote-input";

export const threatDownQuoteSchema = z.object({
  quoteNumber: z.string().regex(/^Q-\d+$/),
  currency: z.literal("USD"),
  expiresOn: z.iso.date(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  termMonths: z.number().int().positive().max(120),
  preliminary: z.boolean(),
  licenseTo: z.string().trim().min(1).max(300),
  netTotal: z.number().finite().min(0).max(99_999_999.99),
  lines: z.array(z.object({
    sku: z.string().trim().min(1).max(120), description: z.string().trim().min(1).max(4000),
    quantity: z.number().finite().int().positive().max(99_999_999),
    costUnit: z.number().finite().min(0).max(99_999_999.99),
    netTotal: z.number().finite().min(0).max(99_999_999.99),
  })).min(1).max(200),
});
export type ThreatDownQuote = z.infer<typeof threatDownQuoteSchema>;

function date(value: string | undefined) {
  const match = value?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new QuoteInputError("No se pudo reconocer una fecha de la cotización.");
  const result = `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  if (!z.iso.date().safeParse(result).success) throw new QuoteInputError("La cotización contiene una fecha inválida.");
  return result;
}

export function validateThreatDownTotals(quote: ThreatDownQuote) {
  const parsed = threatDownQuoteSchema.safeParse(quote);
  if (!parsed.success) throw new QuoteInputError("La lectura de la cotización está incompleta.");
  if (new Set(quote.lines.map((l) => l.sku)).size !== quote.lines.length) throw new QuoteInputError("Hay SKU repetidos. Revisa este formato antes de importar.");
  if (quote.lines.some((l) => Math.abs(roundQuoteMoney(l.quantity * l.costUnit) - l.netTotal) > 0.011)) {
    throw new QuoteInputError("El costo unitario no concuerda con el importe de una partida. Revisa el PDF.");
  }
  if (Math.abs(roundQuoteMoney(quote.lines.reduce((sum, l) => sum + l.netTotal, 0)) - quote.netTotal) > 0.011) {
    throw new QuoteInputError("La suma de partidas no coincide con el subtotal del proveedor. No se importó ninguna partida.");
  }
  if (quote.startsOn > quote.endsOn) throw new QuoteInputError("Las fechas de suscripción no son coherentes.");
}

// Rows are reconstructed by PDF coordinates. Match complete table rows, never MSRP.
export function parseThreatDownQuote(text: string): ThreatDownQuote {
  if (!/ThreatDown Limited/.test(text) || !/PURCHASE SUMMARY/.test(text) || !/NET UNIT/.test(text)) {
    throw new QuoteInputError("Este PDF no tiene el formato de cotización ThreatDown admitido.");
  }
  const before = text.split(/PURCHASE SUMMARY/)[0];
  const table = text.split(/PURCHASE SUMMARY/)[1]?.split(/Terms and Conditions/)[0] ?? "";
  const money = "([\\d,]+\\.\\d{2})";
  const row = new RegExp(`^([A-Z][A-Z0-9-]{3,119})\\s+(.+?)\\s+(\\d+)\\s+USD\\s+${money}\\s+[\\d.]+\\s+USD\\s+${money}\\s+[\\d.]+\\s+USD\\s+${money}\\s+USD\\s+${money}\\s*$`);
  const lines: ThreatDownQuote["lines"] = [];
  for (const line of table.split("\n")) {
    const m = line.trim().match(row);
    if (m) lines.push({ sku: m[1], description: m[2], quantity: Number(m[3]),
      costUnit: Number(m[6].replaceAll(",", "")), netTotal: Number(m[7].replaceAll(",", "")) });
    else if (/^\S+\s+ThreatDown\b/.test(line.trim())) {
      throw new QuoteInputError("No se pudo leer una partida completa. Revisa el formato del PDF.");
    } else if (lines.length && (line.trim().startsWith("(") || (lines.at(-1)!.description.includes("(") && !lines.at(-1)!.description.endsWith(")")))) {
      if (!line.trim() || /USD|Subtotal|Tax|Total|PRODUCT/.test(line)) continue;
      lines.at(-1)!.description += ` ${line.trim()}`;
    }
  }
  const total = table.match(/Subtotal\s+USD\s+([\d,]+\.\d{2})/);
  const license = before?.split(/LICENSE TO:\s*\(If Applicable\)/)[1]?.trim().split("\n")[0]?.trim().split(/\s{3,}/).at(-1);
  const quote = threatDownQuoteSchema.safeParse({
    quoteNumber: text.match(/Quote #:\s*(Q-\d+)/)?.[1], currency: "USD",
    expiresOn: date(text.match(/Expires On:\s*(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1]),
    startsOn: date(text.match(/Subscription Start Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1]),
    endsOn: date(text.match(/Subscription End Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1]),
    termMonths: Number(text.match(/Subscription Term:\s*(\d+)/)?.[1]),
    preliminary: /Quotation\s*-\s*Preliminary/.test(text),
    licenseTo: license,
    netTotal: total ? Number(total[1].replaceAll(",", "")) : NaN, lines,
  });
  if (!quote.success) throw new QuoteInputError("Faltan partidas o datos comerciales. Revisa el PDF antes de importar.");
  validateThreatDownTotals(quote.data);
  return quote.data;
}

export function priceThreatDownQuote(quote: ThreatDownQuote, exchangeRate: number, marginPct: number) {
  validateThreatDownTotals(quote);
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0 || exchangeRate > 1000 ||
      !Number.isFinite(marginPct) || marginPct < 0 || marginPct >= 100) {
    throw new QuoteInputError("Indica un tipo de cambio positivo y un margen entre 0 y menos de 100%.");
  }
  return normalizeQuoteInput(quote.lines.map((l) => {
    const costUnit = roundQuoteMoney(l.costUnit * exchangeRate);
    return { sku: l.sku, description: l.description, quantity: l.quantity, costUnit,
      priceUnit: roundQuoteMoney(costUnit / (1 - marginPct / 100)), lineType: l.sku.startsWith("MPSNC") ? "service" : "product" };
  }));
}
