import { describe, expect, it } from "vitest";

import {
  normalizeQuotePanelState,
  normalizeQuoteSort,
  resolveSelectedQuoteId,
} from "@/lib/domain/quote-list-state";

describe("quote-list-state", () => {
  it("normaliza orden invalido a date_desc", () => {
    expect(normalizeQuoteSort("revenue_desc")).toBe("revenue_desc");
    expect(normalizeQuoteSort("foo")).toBe("date_desc");
  });

  it("interpreta panel=open como true y el resto como false", () => {
    expect(normalizeQuotePanelState("open")).toBe(true);
    expect(normalizeQuotePanelState("closed")).toBe(false);
    expect(normalizeQuotePanelState(null)).toBe(false);
  });

  it("resuelve quoteId solo si existe y si no usa el primero", () => {
    const items = [{ quoteId: "q-1" }, { quoteId: "q-9" }];

    expect(resolveSelectedQuoteId(items, "q-9")).toBe("q-9");
    expect(resolveSelectedQuoteId(items, "missing")).toBe("q-1");
    expect(resolveSelectedQuoteId([], "missing")).toBeNull();
  });
});