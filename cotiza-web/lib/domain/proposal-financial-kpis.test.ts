import { describe, expect, it } from "vitest";
import { fillProposalFinancialMonths, summarizeProposalFinancials, type ProposalFinancialMonth } from "./proposal-financial-kpis";

const point = (values: Partial<ProposalFinancialMonth>): ProposalFinancialMonth => ({
  period: "2026-01-01T00:00:00.000Z", proposedAmount: 0, approvedAmount: 0,
  proposedProfit: 0, approvedProfit: 0, proposedMarginPct: 0, approvedMarginPct: 0, ...values,
});

describe("proposal financial period", () => {
  it("weights margins by revenue and does not add approved revenue twice", () => {
    const result = summarizeProposalFinancials([
      point({ proposedAmount: 100, proposedProfit: 50, proposedMarginPct: 50, approvedAmount: 100, approvedProfit: 50 }),
      point({ period: "2026-02-01T00:00:00.000Z", proposedAmount: 900, proposedProfit: 90, proposedMarginPct: 10 }),
    ]);
    expect(result).toMatchObject({ revenue: 1000, profit: 140, approvedRevenue: 100, approvedProfit: 50, averageMonthlyRevenue: 500 });
    expect(result.marginPct).toBeCloseTo(14);
  });

  it("includes missing calendar months in the average across a year boundary", () => {
    const input = [point({ period: "2026-01-01T00:00:00.000Z", proposedAmount: 300 }), point({ period: "2025-11-01T00:00:00.000Z", proposedAmount: 600 })];
    const months = fillProposalFinancialMonths(input);
    expect(months.map((row) => row.period.slice(0, 7))).toEqual(["2025-11", "2025-12", "2026-01"]);
    expect(months[1].proposedAmount).toBe(0);
    expect(summarizeProposalFinancials(months).averageMonthlyRevenue).toBe(300);
    expect(input[0].period).toBe("2026-01-01T00:00:00.000Z");
  });

  it("keeps negative margins and avoids division by zero for an empty period", () => {
    expect(summarizeProposalFinancials([point({ proposedAmount: 100, proposedProfit: -25 })]).marginPct).toBe(-25);
    expect(fillProposalFinancialMonths([])).toEqual([]);
    expect(summarizeProposalFinancials([])).toMatchObject({ revenue: 0, profit: 0, marginPct: null, averageMonthlyRevenue: 0 });
  });
});
