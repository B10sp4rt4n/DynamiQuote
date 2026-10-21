export type ProposalFinancialMonth = {
  wonAmount: number;
  wonProfit: number;
  wonMarginPct: number;
  period: string;
  proposedAmount: number;
  approvedAmount: number;
  proposedProfit: number;
  approvedProfit: number;
  proposedMarginPct: number;
  approvedMarginPct: number;
};

// Fill calendar gaps so a month without proposals remains visible and counts
// in the monthly average. Labels and grouping both use UTC month boundaries.
export function fillProposalFinancialMonths(points: ProposalFinancialMonth[]): ProposalFinancialMonth[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.period.localeCompare(b.period));
  const byMonth = new Map(sorted.map((point) => [point.period.slice(0, 7), point]));
  const cursor = new Date(`${sorted[0].period.slice(0, 7)}-01T00:00:00.000Z`);
  const end = sorted[sorted.length - 1].period.slice(0, 7);
  const result: ProposalFinancialMonth[] = [];
  while (cursor.toISOString().slice(0, 7) <= end) {
    const period = cursor.toISOString();
    result.push(byMonth.get(period.slice(0, 7)) ?? {
      period, wonAmount: 0, wonProfit: 0, wonMarginPct: 0, proposedAmount: 0, approvedAmount: 0, proposedProfit: 0,
      approvedProfit: 0, proposedMarginPct: 0, approvedMarginPct: 0,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

export function summarizeProposalFinancials(points: ProposalFinancialMonth[]) {
  const revenue = points.reduce((sum, point) => sum + point.wonAmount, 0);
  const profit = points.reduce((sum, point) => sum + point.wonProfit, 0);
  return {
    revenue,
    profit,
    approvedRevenue: points.reduce((sum, point) => sum + point.approvedAmount, 0),
    approvedProfit: points.reduce((sum, point) => sum + point.approvedProfit, 0),
    marginPct: revenue !== 0 ? profit / revenue * 100 : null,
    averageMonthlyRevenue: points.length > 0 ? revenue / points.length : 0,
  };
}
