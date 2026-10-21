import { describe, expect, it } from "vitest";
import { summarizeQuoteMonths, type MonthlyQuoteKpi } from "./quote-kpis";

const month = (values: Partial<MonthlyQuoteKpi>): MonthlyQuoteKpi => ({
  month: "2026-01", revenue: 0, grossProfit: 0, quoteCount: 0, missingMarginCount: 0, ...values,
});

describe("monthly quote KPIs", () => {
  it("weights the margin by revenue, instead of averaging percentages", () => {
    const result = summarizeQuoteMonths([
      month({ revenue: 100, grossProfit: 50, quoteCount: 1 }),
      month({ month: "2026-02", revenue: 900, grossProfit: 90, quoteCount: 2 }),
    ]);
    expect(result).toMatchObject({ revenue: 1000, grossProfit: 140, quoteCount: 3 });
    expect(result.marginPct).toBeCloseTo(14);
  });

  it("preserves losses and avoids division by zero", () => {
    expect(summarizeQuoteMonths([month({ revenue: 100, grossProfit: -25 })]).marginPct).toBe(-25);
    expect(summarizeQuoteMonths([])).toMatchObject({ revenue: 0, grossProfit: 0, marginPct: null });
  });

  it("does not advertise a complete margin when some costs are unknown", () => {
    expect(summarizeQuoteMonths([
      month({ revenue: 100, grossProfit: 20, quoteCount: 1 }),
      month({ revenue: 400, quoteCount: 1, missingMarginCount: 1 }),
    ])).toMatchObject({ revenue: 500, grossProfit: 20, marginPct: null, missingMarginCount: 1 });
  });
});
