export type QuoteSort = "date_desc" | "date_asc" | "client_asc" | "revenue_desc";

export const quoteSorts: QuoteSort[] = ["date_desc", "date_asc", "client_asc", "revenue_desc"];

export function normalizeQuoteSort(value: string | null | undefined): QuoteSort {
  return quoteSorts.includes(value as QuoteSort) ? (value as QuoteSort) : "date_desc";
}

export function normalizeQuotePanelState(value: string | null | undefined): boolean {
  return value === "open";
}

export function resolveSelectedQuoteId<T extends { quoteId: string }>(
  items: T[],
  quoteId: string | null | undefined,
): string | null {
  if (quoteId && items.some((item) => item.quoteId === quoteId)) {
    return quoteId;
  }

  return items[0]?.quoteId ?? null;
}