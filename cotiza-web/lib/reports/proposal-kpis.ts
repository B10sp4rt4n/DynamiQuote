import "server-only";

import type { TenantContext } from "@/lib/auth/tenant-context";
import {
  getProposalKpiSummaryByTenant,
  getProposalMarginTimelineByTenant,
  getProposalOutcomeTimelineByTenant,
  getProposalStatusTimelineByTenant,
  getSalesRepRankingByTenant,
} from "@/lib/db/proposal-kpis";

// La pantalla y el PDF comparten consultas y alcance de acceso.
export async function getProposalKpiReportData(tenant: TenantContext) {
  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const [summary, statusTimeline, marginTimeline, outcomeTimeline, ranking] = await Promise.all([
    getProposalKpiSummaryByTenant(tenant.id, tenant.userId, canSeeAll),
    getProposalStatusTimelineByTenant(tenant.id, tenant.userId, canSeeAll),
    getProposalMarginTimelineByTenant(tenant.id, tenant.userId, canSeeAll),
    getProposalOutcomeTimelineByTenant(tenant.id, tenant.userId, canSeeAll),
    canSeeAll ? getSalesRepRankingByTenant(tenant.id) : Promise.resolve([]),
  ]);
  return { canSeeAll, summary, statusTimeline, marginTimeline, outcomeTimeline, ranking, tenantName: tenant.name };
}

export type ProposalKpiReportData = Awaited<ReturnType<typeof getProposalKpiReportData>>;
