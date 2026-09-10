import { ProposalKpisShell } from "@/components/propuestas/proposal-kpis-shell";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  getProposalAmountTimelineByTenant,
  getProposalKpiSummaryByTenant,
  getProposalStatusTimelineByTenant,
  getSalesRepRankingByTenant,
} from "@/lib/db/proposal-kpis";

export const dynamic = "force-dynamic";

export default async function ProposalKpisPage() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay tenants disponibles en Neon para cargar KPIs.
      </section>
    );
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";

  const [summary, statusTimeline, amountTimeline, ranking] = await Promise.all([
    getProposalKpiSummaryByTenant(tenant.id, tenant.userId, canSeeAll),
    getProposalStatusTimelineByTenant(tenant.id, tenant.userId, canSeeAll),
    getProposalAmountTimelineByTenant(tenant.id, tenant.userId, canSeeAll),
    canSeeAll ? getSalesRepRankingByTenant(tenant.id) : Promise.resolve([]),
  ]);

  return (
    <ProposalKpisShell
      amountTimeline={amountTimeline}
      canSeeAll={canSeeAll}
      ranking={ranking}
      statusTimeline={statusTimeline}
      summary={summary}
      tenantName={tenant.name}
    />
  );
}
