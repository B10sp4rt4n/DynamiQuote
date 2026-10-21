export type MonthlyQuoteKpi = {
  month: string;
  revenue: number;
  grossProfit: number;
  quoteCount: number;
  missingMarginCount: number;
};

export function summarizeQuoteMonths(months: MonthlyQuoteKpi[]) {
  const revenue = months.reduce((sum, month) => sum + month.revenue, 0);
  const grossProfit = months.reduce((sum, month) => sum + month.grossProfit, 0);
  const quoteCount = months.reduce((sum, month) => sum + month.quoteCount, 0);
  const missingMarginCount = months.reduce((sum, month) => sum + month.missingMarginCount, 0);
  return {
    revenue,
    grossProfit,
    quoteCount,
    missingMarginCount,
    // A missing cost is unknown, never a zero cost or a full profit.
    marginPct: missingMarginCount === 0 && revenue !== 0 ? (grossProfit / revenue) * 100 : null,
  };
}
