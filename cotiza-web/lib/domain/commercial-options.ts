import { z } from "zod";
export const optionSetSchema = z.object({
  version: z.literal(1), id: z.string().min(1), canonicalOpportunityId: z.string().min(1),
  memberOpportunityIds: z.array(z.string().min(1)).min(1), placeholderQuoteIds: z.array(z.string()).default([]),
  selectedOptionId: z.string().nullable(),
  options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), ordinal: z.number().int().positive(), quoteIds: z.array(z.string()).min(1) })).min(2).max(10),
  configuredBy: z.string().min(1), configuredAt: z.string(),
}).refine(s => s.memberOpportunityIds.includes(s.canonicalOpportunityId)
  && new Set(s.options.map(o => o.id)).size === s.options.length
  && new Set(s.options.flatMap(o => o.quoteIds)).size === s.options.flatMap(o => o.quoteIds).length
  && (s.selectedOptionId === null || s.options.some(o => o.id === s.selectedOptionId)), "Configuración de opciones inválida");
export type CommercialOptionSet = z.infer<typeof optionSetSchema>;
export type OptionQuote = { quoteId: string; parentQuoteId: string | null; opportunityId: string | null; clientId: string | null; revenue: number; createdAt: string };
export type OptionLabel = { optionId: string; ordinal: number; label: string; revision: number };
export function labelOptionQuote(set: CommercialOptionSet, quoteId: string, quotes: OptionQuote[]): OptionLabel | null {
  const visited = new Set<string>(); let current: string | null = quoteId, revision = 1;
  while (current && !visited.has(current)) {
    visited.add(current);
    const option = set.options.find(o => o.quoteIds.includes(current!));
    if (option) return { optionId: option.id, ordinal: option.ordinal, label: option.label, revision };
    current = quotes.find(q => q.quoteId === current)?.parentQuoteId ?? null; revision++;
  }
  return null;
}
export type CommercialOptionsSummary = {
  reviewRequired?: boolean;
  setId: string; optionCount: number; selectedOptionId: string | null; minimum: number; maximum: number;
  options: { id: string; label: string; amount: number; quoteId: string }[];
};
export function summarizeOptions(set: CommercialOptionSet, quotes: OptionQuote[]): CommercialOptionsSummary {
  const options = set.options.map(option => {
    const matches = quotes.filter(q => labelOptionQuote(set,q.quoteId,quotes)?.optionId === option.id)
      .sort((a,b) => b.createdAt.localeCompare(a.createdAt) || a.quoteId.localeCompare(b.quoteId));
    if (!matches.length) throw new Error("Falta una cotización de la opción");
    return { id: option.id, label: option.label, amount: matches[0].revenue, quoteId: matches[0].quoteId };
  });
  return { setId: set.id, optionCount: options.length, selectedOptionId: set.selectedOptionId,
    minimum: Math.min(...options.map(o => o.amount)), maximum: Math.max(...options.map(o => o.amount)), options };
}

export function isOptionPlaceholder(metadata: unknown, quoteId: string): boolean {
  const parsed=optionSetSchema.safeParse((metadata as Record<string,unknown>|null)?.commercialOptionsSet);
  return parsed.success && parsed.data.placeholderQuoteIds.includes(quoteId);
}
