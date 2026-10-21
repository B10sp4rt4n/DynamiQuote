import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

// Convierte de forma segura cualquier tipo numerico que pueda regresar una
// consulta $queryRaw (Decimal, bigint por COUNT/SUM, string, number) a number.
function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthsAgo(months: number): Date {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export type ProposalStatusTimelinePoint = {
  approved: number;
  draft: number;
  expired: number;
  inReview: number;
  period: string;
  rejected: number;
  sent: number;
};

// Serie de tiempo (por mes) de cuantas propuestas caen en cada estatus,
// segun su fecha de creacion. Respeta el mismo scope "ve solo lo tuyo vs ve
// todo" ya usado en getProposalStatusCountsByTenant.
export async function getProposalStatusTimelineByTenant(
  tenantId: string,
  viewerUserId: string | null = null,
  canSeeAll = true,
  months = 6,
): Promise<ProposalStatusTimelinePoint[]> {
  const scopeFilter = canSeeAll
    ? Prisma.empty
    : Prisma.sql`AND (created_by_user_id = ${viewerUserId} OR created_by_user_id IS NULL)`;

  const rows = await prisma.$queryRaw<
    Array<{
      approved: bigint;
      draft: bigint;
      expired: bigint;
      in_review: bigint;
      period: Date;
      rejected: bigint;
      sent: bigint;
    }>
  >(Prisma.sql`
    SELECT
      date_trunc('month', created_at) AS period,
      COUNT(*) FILTER (WHERE status = 'draft') AS draft,
      COUNT(*) FILTER (WHERE status = 'sent') AS sent,
      COUNT(*) FILTER (WHERE status = 'in_review') AS in_review,
      COUNT(*) FILTER (WHERE status = 'approved') AS approved,
      COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
      COUNT(*) FILTER (WHERE status = 'expired') AS expired
    FROM proposals
    WHERE tenant_id = ${tenantId}
      AND created_at >= ${monthsAgo(months)}
      ${scopeFilter}
    GROUP BY period
    ORDER BY period ASC
  `);

  return rows.map((row) => ({
    approved: toNumber(row.approved),
    draft: toNumber(row.draft),
    expired: toNumber(row.expired),
    inReview: toNumber(row.in_review),
    period: row.period.toISOString(),
    rejected: toNumber(row.rejected),
    sent: toNumber(row.sent),
  }));
}

export type ProposalAmountTimelinePoint = {
  approvedAmount: number;
  period: string;
  proposedAmount: number;
};

// Serie de tiempo (por mes) de monto propuesto vs monto aprobado.
export async function getProposalAmountTimelineByTenant(
  tenantId: string,
  viewerUserId: string | null = null,
  canSeeAll = true,
  months = 6,
): Promise<ProposalAmountTimelinePoint[]> {
  const scopeFilter = canSeeAll
    ? Prisma.empty
    : Prisma.sql`AND (p.created_by_user_id = ${viewerUserId} OR p.created_by_user_id IS NULL)`;

  const rows = await prisma.$queryRaw<
    Array<{
      approved_amount: Prisma.Decimal | null;
      period: Date;
      proposed_amount: Prisma.Decimal | null;
    }>
  >(Prisma.sql`
    SELECT
      date_trunc('month', p.created_at) AS period,
      SUM(COALESCE(pi.subtotal_price, 0)) AS proposed_amount,
      SUM(CASE WHEN p.status = 'approved' THEN COALESCE(pi.subtotal_price, 0) ELSE 0 END) AS approved_amount
    FROM proposals p
    LEFT JOIN proposal_items pi ON pi.proposal_id = p.proposal_id AND pi.status != 'deleted'
    WHERE p.tenant_id = ${tenantId}
      AND p.created_at >= ${monthsAgo(months)}
      ${scopeFilter}
    GROUP BY period
    ORDER BY period ASC
  `);

  return rows.map((row) => ({
    approvedAmount: toNumber(row.approved_amount),
    period: row.period.toISOString(),
    proposedAmount: toNumber(row.proposed_amount),
  }));
}

export type ProposalKpiSummary = {
  undatedOutcomeCount: number;
  undatedWonCount: number;
  undatedLostCount: number;
  undatedWonAmount: number;
  undatedWonProfit: number;
  undatedLostAmount: number;
  wonAmount: number;
  wonProfit: number;
  approvedAmount: number;
  approvedCount: number;
  avgMarginPct: number;
  conversionRatePct: number;
  draftCount: number;
  expiredCount: number;
  inReviewCount: number;
  pendingActionCount: number;
  proposedAmount: number;
  rejectedCount: number;
  sentCount: number;
  totalCount: number;
};

// Tarjetas de numero (KPIs de un solo valor): totales, monto, tasa de
// conversion y margen promedio, en el scope del viewer (vendedor: solo lo
// suyo; admin/owner/superadmin: todo el tenant).
export async function getProposalKpiSummaryByTenant(
  tenantId: string,
  viewerUserId: string | null = null,
  canSeeAll = true,
): Promise<ProposalKpiSummary> {
  const scopeFilter = canSeeAll
    ? Prisma.empty
    : Prisma.sql`AND (p.created_by_user_id = ${viewerUserId} OR p.created_by_user_id IS NULL)`;

  const rows = await prisma.$queryRaw<
    Array<{
      undated_outcome_count: bigint;
      undated_won_count: bigint;
      undated_lost_count: bigint;
      undated_won_amount: Prisma.Decimal | null;
      undated_won_cost: Prisma.Decimal | null;
      undated_lost_amount: Prisma.Decimal | null;
      won_amount: Prisma.Decimal | null;
      won_cost: Prisma.Decimal | null;
      approved: bigint;
      approved_amount: Prisma.Decimal | null;
      draft: bigint;
      expired: bigint;
      in_review: bigint;
      proposed_amount: Prisma.Decimal | null;
      rejected: bigint;
      sent: bigint;
      total: bigint;
      total_cost: Prisma.Decimal | null;
    }>
  >(Prisma.sql`
    SELECT
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.outcome IN ('won', 'lost') AND p.outcome_at IS NULL) AS undated_outcome_count,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.outcome = 'won' AND p.outcome_at IS NULL) AS undated_won_count,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.outcome = 'lost' AND p.outcome_at IS NULL) AS undated_lost_count,
      SUM(CASE WHEN p.outcome = 'won' AND p.outcome_at IS NULL THEN COALESCE(pi.subtotal_price, 0) ELSE 0 END) AS undated_won_amount,
      SUM(CASE WHEN p.outcome = 'won' AND p.outcome_at IS NULL THEN COALESCE(pi.subtotal_cost, 0) ELSE 0 END) AS undated_won_cost,
      SUM(CASE WHEN p.outcome = 'lost' AND p.outcome_at IS NULL THEN COALESCE(pi.subtotal_price, 0) ELSE 0 END) AS undated_lost_amount,
      COUNT(DISTINCT p.proposal_id) AS total,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.status = 'draft') AS draft,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.status = 'sent') AS sent,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.status = 'in_review') AS in_review,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.status = 'approved') AS approved,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.status = 'rejected') AS rejected,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.status = 'expired') AS expired,
      SUM(COALESCE(pi.subtotal_price, 0)) AS proposed_amount,
      SUM(CASE WHEN p.status = 'approved' THEN COALESCE(pi.subtotal_price, 0) ELSE 0 END) AS approved_amount,
      SUM(CASE WHEN p.outcome = 'won' THEN COALESCE(pi.subtotal_price, 0) ELSE 0 END) AS won_amount,
      SUM(CASE WHEN p.outcome = 'won' THEN COALESCE(pi.subtotal_cost, 0) ELSE 0 END) AS won_cost,
      SUM(COALESCE(pi.subtotal_cost, 0)) AS total_cost
    FROM proposals p
    LEFT JOIN proposal_items pi ON pi.proposal_id = p.proposal_id AND pi.status != 'deleted'
    WHERE p.tenant_id = ${tenantId}
      ${scopeFilter}
  `);

  const row = rows[0];
  const totalCount = toNumber(row?.total);
  const draftCount = toNumber(row?.draft);
  const sentCount = toNumber(row?.sent);
  const inReviewCount = toNumber(row?.in_review);
  const approvedCount = toNumber(row?.approved);
  const rejectedCount = toNumber(row?.rejected);
  const expiredCount = toNumber(row?.expired);
  const proposedAmount = toNumber(row?.proposed_amount);
  const totalCost = toNumber(row?.total_cost);
  const nonDraftCount = totalCount - draftCount;

  return {
    undatedOutcomeCount: toNumber(row?.undated_outcome_count),
    undatedWonCount: toNumber(row?.undated_won_count),
    undatedLostCount: toNumber(row?.undated_lost_count),
    undatedWonAmount: toNumber(row?.undated_won_amount),
    undatedWonProfit: toNumber(row?.undated_won_amount) - toNumber(row?.undated_won_cost),
    undatedLostAmount: toNumber(row?.undated_lost_amount),
    wonAmount: toNumber(row?.won_amount),
    wonProfit: toNumber(row?.won_amount) - toNumber(row?.won_cost),
    approvedAmount: toNumber(row?.approved_amount),
    approvedCount,
    avgMarginPct: proposedAmount > 0 ? ((proposedAmount - totalCost) / proposedAmount) * 100 : 0,
    conversionRatePct: nonDraftCount > 0 ? (approvedCount / nonDraftCount) * 100 : 0,
    draftCount,
    expiredCount,
    inReviewCount,
    pendingActionCount: draftCount + sentCount + inReviewCount,
    proposedAmount,
    rejectedCount,
    sentCount,
    totalCount,
  };
}

export type SalesRepRankingRow = {
  approvedAmount: number;
  approvedCount: number;
  conversionRatePct: number;
  displayName: string;
  proposedAmount: number;
  totalCount: number;
  userId: string;
};

// Ranking por vendedor -- solo admin/owner/superadmin. Excluye a proposito
// las propuestas sin created_by_user_id (huerfanas, ~95% de las anteriores
// a agosto 2026): atribuirlas a alguien seria un dato inventado, no
// recuperado. Ver CLAUDE.md "Deuda de datos conocida".
export async function getSalesRepRankingByTenant(tenantId: string): Promise<SalesRepRankingRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      alias: string | null;
      approved: bigint;
      approved_amount: Prisma.Decimal | null;
      first_name: string | null;
      last_name: string | null;
      proposed_amount: Prisma.Decimal | null;
      total: bigint;
      user_id: string;
    }>
  >(Prisma.sql`
    SELECT
      p.created_by_user_id AS user_id,
      au.first_name,
      au.last_name,
      au.alias,
      COUNT(DISTINCT p.proposal_id) AS total,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.status = 'approved') AS approved,
      SUM(COALESCE(pi.subtotal_price, 0)) AS proposed_amount,
      SUM(CASE WHEN p.status = 'approved' THEN COALESCE(pi.subtotal_price, 0) ELSE 0 END) AS approved_amount
    FROM proposals p
    LEFT JOIN proposal_items pi ON pi.proposal_id = p.proposal_id AND pi.status != 'deleted'
    LEFT JOIN app_users au ON au.user_id = p.created_by_user_id
    WHERE p.tenant_id = ${tenantId}
      AND p.created_by_user_id IS NOT NULL
    GROUP BY p.created_by_user_id, au.first_name, au.last_name, au.alias
    ORDER BY approved_amount DESC NULLS LAST
  `);

  return rows.map((row) => {
    const totalCount = toNumber(row.total);
    const approvedCount = toNumber(row.approved);
    const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();

    return {
      approvedAmount: toNumber(row.approved_amount),
      approvedCount,
      conversionRatePct: totalCount > 0 ? (approvedCount / totalCount) * 100 : 0,
      displayName: fullName || row.alias || "Sin asignar",
      proposedAmount: toNumber(row.proposed_amount),
      totalCount,
      userId: row.user_id,
    };
  });
}

export type ProposalMarginTimelinePoint = {
  wonAmount: number;
  wonProfit: number;
  wonMarginPct: number;
  approvedAmount: number;
  approvedMarginPct: number;
  approvedProfit: number;
  period: string;
  proposedAmount: number;
  proposedMarginPct: number;
  proposedProfit: number;
};

// Activity stays in its creation month. Won revenue/costs use the observed
// commercial decision month in Mexico City, including old proposals won now.
// Unknown historical dates remain only in historical totals.
export async function getProposalMarginTimelineByTenant(
  tenantId: string,
  viewerUserId: string | null = null,
  canSeeAll = true,
  months = 6,
): Promise<ProposalMarginTimelinePoint[]> {
  const scopeFilter = canSeeAll
    ? Prisma.empty
    : Prisma.sql`AND (p.created_by_user_id = ${viewerUserId} OR p.created_by_user_id IS NULL)`;

  const rows = await prisma.$queryRaw<
    Array<{
      won_amount: Prisma.Decimal | null;
      won_cost: Prisma.Decimal | null;
      approved_amount: Prisma.Decimal | null;
      approved_cost: Prisma.Decimal | null;
      period: Date;
      proposed_amount: Prisma.Decimal | null;
      proposed_cost: Prisma.Decimal | null;
    }>
  >(Prisma.sql`
    WITH scoped AS (
      SELECT p.proposal_id, p.created_at, p.outcome_at, p.outcome, p.status,
        SUM(COALESCE(pi.subtotal_price, 0)) AS amount,
        SUM(COALESCE(pi.subtotal_cost, 0)) AS cost
      FROM proposals p
      LEFT JOIN proposal_items pi ON pi.proposal_id = p.proposal_id AND pi.status != 'deleted'
      WHERE p.tenant_id = ${tenantId} ${scopeFilter}
      GROUP BY p.proposal_id
    ), activity AS (
      SELECT date_trunc('month', created_at) AS period,
        amount AS proposed_amount, cost AS proposed_cost,
        CASE WHEN status = 'approved' THEN amount ELSE 0 END AS approved_amount,
        CASE WHEN status = 'approved' THEN cost ELSE 0 END AS approved_cost,
        0 AS won_amount, 0 AS won_cost
      FROM scoped WHERE created_at >= ${monthsAgo(months)}
      UNION ALL
      SELECT date_trunc('month', outcome_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City'),
        0, 0, 0, 0, amount, cost
      FROM scoped
      WHERE outcome = 'won' AND outcome_at >=
        ((date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')
          - ${months} * interval '1 month') AT TIME ZONE 'America/Mexico_City' AT TIME ZONE 'UTC')
    )
    SELECT period, SUM(won_amount) AS won_amount, SUM(won_cost) AS won_cost,
      SUM(proposed_amount) AS proposed_amount, SUM(proposed_cost) AS proposed_cost,
      SUM(approved_amount) AS approved_amount, SUM(approved_cost) AS approved_cost
    FROM activity GROUP BY period ORDER BY period ASC
  `);

  return rows.map((row) => {
    const wonAmount = toNumber(row.won_amount);
    const wonProfit = wonAmount - toNumber(row.won_cost);
    const proposedAmount = toNumber(row.proposed_amount);
    const proposedCost = toNumber(row.proposed_cost);
    const approvedAmount = toNumber(row.approved_amount);
    const approvedCost = toNumber(row.approved_cost);
    const proposedProfit = proposedAmount - proposedCost;
    const approvedProfit = approvedAmount - approvedCost;

    return {
      wonAmount,
      wonProfit,
      wonMarginPct: wonAmount !== 0 ? wonProfit / wonAmount * 100 : 0,
      approvedAmount,
      approvedMarginPct: approvedAmount > 0 ? (approvedProfit / approvedAmount) * 100 : 0,
      approvedProfit,
      period: row.period.toISOString(),
      proposedAmount,
      proposedMarginPct: proposedAmount > 0 ? (proposedProfit / proposedAmount) * 100 : 0,
      proposedProfit,
    };
  });
}

export type ProposalOutcomeTimelinePoint = {
  lostAmount: number;
  lostCount: number;
  period: string;
  wonAmount: number;
  wonCount: number;
};

// Commercial decisions are grouped by their recorded date (Mexico City).
// Creation activity still supplies zero-decision months. Discarded versions
// and historical decisions without a date never manufacture monthly closes.
export async function getProposalOutcomeTimelineByTenant(
  tenantId: string,
  viewerUserId: string | null = null,
  canSeeAll = true,
  months = 6,
): Promise<ProposalOutcomeTimelinePoint[]> {
  const scopeFilter = canSeeAll
    ? Prisma.empty
    : Prisma.sql`AND (p.created_by_user_id = ${viewerUserId} OR p.created_by_user_id IS NULL)`;

  const rows = await prisma.$queryRaw<
    Array<{
      lost_amount: Prisma.Decimal | null;
      lost_count: bigint;
      period: Date;
      won_amount: Prisma.Decimal | null;
      won_count: bigint;
    }>
  >(Prisma.sql`
    WITH scoped AS (
      SELECT p.proposal_id, p.created_at, p.outcome_at, p.outcome,
        SUM(COALESCE(pi.subtotal_price, 0)) AS amount
      FROM proposals p
      LEFT JOIN proposal_items pi ON pi.proposal_id = p.proposal_id AND pi.status != 'deleted'
      WHERE p.tenant_id = ${tenantId} ${scopeFilter}
      GROUP BY p.proposal_id
    ), decisions AS (
      SELECT date_trunc('month', created_at) AS period,
        0 AS won_count, 0 AS lost_count, 0 AS won_amount, 0 AS lost_amount
      FROM scoped WHERE created_at >= ${monthsAgo(months)}
      UNION ALL
      SELECT date_trunc('month', outcome_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City'),
        CASE WHEN outcome = 'won' THEN 1 ELSE 0 END,
        CASE WHEN outcome = 'lost' THEN 1 ELSE 0 END,
        CASE WHEN outcome = 'won' THEN amount ELSE 0 END,
        CASE WHEN outcome = 'lost' THEN amount ELSE 0 END
      FROM scoped WHERE outcome IN ('won', 'lost') AND outcome_at >=
        ((date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')
          - ${months} * interval '1 month') AT TIME ZONE 'America/Mexico_City' AT TIME ZONE 'UTC')
    )
    SELECT period, SUM(won_count) AS won_count, SUM(lost_count) AS lost_count,
      SUM(won_amount) AS won_amount, SUM(lost_amount) AS lost_amount
    FROM decisions GROUP BY period ORDER BY period ASC
  `);

  return rows.map((row) => ({
    lostAmount: toNumber(row.lost_amount),
    lostCount: toNumber(row.lost_count),
    period: row.period.toISOString(),
    wonAmount: toNumber(row.won_amount),
    wonCount: toNumber(row.won_count),
  }));
}
