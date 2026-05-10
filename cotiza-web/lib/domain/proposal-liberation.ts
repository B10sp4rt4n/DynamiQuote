export type ProposalLiberationItemInput = {
  costUnit: number;
  priceUnit: number;
  quantity: number;
};

export type ProposalLiberationPolicy = {
  highPreapprovalMarginPct: number;
  maxMarginPct: number;
  minMarginPct: number;
  ownerRequired: true;
  requireObserverApproval: boolean;
  tenantId: string;
};

export type ProposalLiberationBand = "below_min" | "standard" | "elevated" | "high_preapproval";

export type ProposalReleaseMode = "blocked" | "standard" | "informative";

export type ProposalLiberationEvaluation = {
  averageMarginPct: number;
  canAuthorizeFinal: boolean;
  canShareInformative: boolean;
  grossProfit: number;
  highPreapprovalMarginPct: number;
  marginBand: ProposalLiberationBand;
  maxMarginPct: number;
  minMarginPct: number;
  ownerRequired: true;
  releaseMode: ProposalReleaseMode;
  requireObserverApproval: boolean;
  summary: string;
  tenantId: string;
  totalCost: number;
  totalRevenue: number;
};

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundMargin(value: number): number {
  return Math.round(value * 100) / 100;
}

export function evaluateProposalLiberation(
  policy: ProposalLiberationPolicy,
  items: ProposalLiberationItemInput[],
): ProposalLiberationEvaluation {
  const totalCost = roundCurrency(items.reduce((sum, item) => sum + item.quantity * item.costUnit, 0));
  const totalRevenue = roundCurrency(items.reduce((sum, item) => sum + item.quantity * item.priceUnit, 0));
  const grossProfit = roundCurrency(totalRevenue - totalCost);
  const averageMarginPct = totalRevenue > 0 ? roundMargin((grossProfit / totalRevenue) * 100) : 0;

  const marginBand: ProposalLiberationBand =
    averageMarginPct < policy.minMarginPct
      ? "below_min"
      : averageMarginPct < policy.maxMarginPct
        ? "standard"
        : averageMarginPct < policy.highPreapprovalMarginPct
          ? "elevated"
          : "high_preapproval";

  const releaseMode: ProposalReleaseMode =
    averageMarginPct < policy.minMarginPct
      ? "blocked"
      : averageMarginPct >= policy.highPreapprovalMarginPct
        ? "informative"
        : "standard";

  const summary =
    releaseMode === "blocked"
      ? `Margen promedio ${averageMarginPct.toFixed(2)}% por debajo del minimo ${policy.minMarginPct.toFixed(2)}%`
      : releaseMode === "informative"
        ? `Margen promedio ${averageMarginPct.toFixed(2)}% habilita preaprobacion informativa`
        : `Margen promedio ${averageMarginPct.toFixed(2)}% dentro de politica`;

  return {
    averageMarginPct,
    canAuthorizeFinal: releaseMode !== "blocked",
    canShareInformative: releaseMode === "informative",
    grossProfit,
    highPreapprovalMarginPct: policy.highPreapprovalMarginPct,
    marginBand,
    maxMarginPct: policy.maxMarginPct,
    minMarginPct: policy.minMarginPct,
    ownerRequired: true,
    releaseMode,
    requireObserverApproval: policy.requireObserverApproval,
    summary,
    tenantId: policy.tenantId,
    totalCost,
    totalRevenue,
  };
}