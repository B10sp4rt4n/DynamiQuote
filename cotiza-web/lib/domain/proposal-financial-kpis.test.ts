import { describe, expect, it } from "vitest";
import { fillProposalFinancialMonths, summarizeProposalFinancials, type ProposalFinancialMonth } from "./proposal-financial-kpis";

const point = (values: Partial<ProposalFinancialMonth>): ProposalFinancialMonth => ({
  period: "2026-01-01T00:00:00.000Z", proposedAmount: 0, approvedAmount: 0,
  proposedProfit: 0, approvedProfit: 0, proposedMarginPct: 0, approvedMarginPct: 0,
  wonAmount: 0, wonProfit: 0, wonMarginPct: 0, ...values,
});

describe("won proposal financial period", () => {
  it("uses won revenue and its costs, not generated or approved amounts", () => {
    const result = summarizeProposalFinancials([
      point({ proposedAmount: 1000000, proposedProfit: 500000, approvedAmount: 200000, approvedProfit: 90000, wonAmount: 100, wonProfit: 50 }),
      point({ period: "2026-02-01T00:00:00.000Z", proposedAmount: 900000, proposedProfit: 90000, wonAmount: 900, wonProfit: 90 }),
    ]);
    expect(result).toMatchObject({ revenue: 1000, profit: 140, averageMonthlyRevenue: 500 });
    expect(result.marginPct).toBeCloseTo(14);
  });

  it("does not treat approval alone as won revenue", () => {
    expect(summarizeProposalFinancials([point({ proposedAmount: 5000, approvedAmount: 5000, approvedProfit: 1000 })])).toMatchObject({ revenue: 0, profit: 0, marginPct: null });
  });

  it("includes missing calendar months in the average across a year boundary", () => {
    const input = [point({ period: "2026-01-01T00:00:00.000Z", wonAmount: 300 }), point({ period: "2025-11-01T00:00:00.000Z", wonAmount: 600 })];
    const months = fillProposalFinancialMonths(input);
    expect(months.map((row) => row.period.slice(0, 7))).toEqual(["2025-11", "2025-12", "2026-01"]);
    expect(months[1].wonAmount).toBe(0);
    expect(summarizeProposalFinancials(months).averageMonthlyRevenue).toBe(300);
    expect(input[0].period).toBe("2026-01-01T00:00:00.000Z");
  });

  it("keeps negative won margins and avoids division by zero", () => {
    expect(summarizeProposalFinancials([point({ wonAmount: 100, wonProfit: -25 })]).marginPct).toBe(-25);
    expect(fillProposalFinancialMonths([])).toEqual([]);
    expect(summarizeProposalFinancials([])).toMatchObject({ revenue: 0, profit: 0, marginPct: null, averageMonthlyRevenue: 0 });
  });
});
