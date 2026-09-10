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
      COUNT(DISTINCT p.proposal_id) AS total,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.status = 'draft') AS draft,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.status = 'sent') AS sent,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.status = 'in_review') AS in_review,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.status = 'approved') AS approved,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.status = 'rejected') AS rejected,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.status = 'expired') AS expired,
      SUM(COALESCE(pi.subtotal_price, 0)) AS proposed_amount,
      SUM(CASE WHEN p.status = 'approved' THEN COALESCE(pi.subtotal_price, 0) ELSE 0 END) AS approved_amount,
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
