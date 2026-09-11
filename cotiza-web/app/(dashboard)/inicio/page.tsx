import { InicioShell } from "@/components/inicio/inicio-shell";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getMarginPolicyByTenant } from "@/lib/db/margin-policies";
import { getExpiringProposalsByTenant } from "@/lib/db/proposal-alerts";
import { getProposalKpiSummaryByTenant, getSalesRepRankingByTenant } from "@/lib/db/proposal-kpis";
import {
  getProposalMarginBlockedCountByTenant,
  getProposalOutcomeCountsByTenant,
  getProposalStatusCountsByTenant,
  getProposalSummariesByTenant,
} from "@/lib/db/proposals";
import { getQuoteDashboardSnapshotByTenant } from "@/lib/db/quotes";
import { getAppUsersByTenant, getAppUsersForSuperAdmin, getIssuerProfilesByTenant } from "@/lib/db/settings";
import { getPendingTasksByTenant } from "@/lib/db/tasks";
import { getTenantProfileByTenant } from "@/lib/db/tenants";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay tenants disponibles en Neon para cargar el inicio.
      </section>
    );
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";

  const [
    marginPolicy,
    proposalStatusCounts,
    proposalMarginBlockedCount,
    quoteDashboardSnapshot,
    recentProposals,
    tenantProfile,
    issuerProfiles,
    users,
    overallSummary,
    ranking,
    outcomeCounts,
    pendingTasks,
  ] = await Promise.all([
    getMarginPolicyByTenant(tenant.id),
    getProposalStatusCountsByTenant(tenant.id, tenant.userId, canSeeAll),
    getProposalMarginBlockedCountByTenant(tenant.id, tenant.userId, canSeeAll),
    getQuoteDashboardSnapshotByTenant(tenant.id, tenant.userId, canSeeAll),
    getProposalSummariesByTenant(tenant.id, 6, tenant.userId, canSeeAll),
    getTenantProfileByTenant(tenant.id),
    canSeeAll ? getIssuerProfilesByTenant(tenant.id) : Promise.resolve([]),
    canSeeAll
      ? tenant.isSuperAdmin
        ? getAppUsersForSuperAdmin()
        : getAppUsersByTenant(tenant.id)
      : Promise.resolve([]),
    canSeeAll ? getProposalKpiSummaryByTenant(tenant.id, tenant.userId, canSeeAll) : Promise.resolve(null),
    canSeeAll ? getSalesRepRankingByTenant(tenant.id) : Promise.resolve([]),
    getProposalOutcomeCountsByTenant(tenant.id, tenant.userId, canSeeAll),
    getPendingTasksByTenant(tenant.id, tenant.userId, canSeeAll),
  ]);

  const expiringAlerts = await getExpiringProposalsByTenant(
    tenant.id,
    tenantProfile?.expiryAlertDaysBefore ?? 3,
    tenant.userId,
    canSeeAll,
  );

  return (
    <InicioShell
      canSeeAll={canSeeAll}
      expiringAlerts={expiringAlerts}
      issuerProfiles={issuerProfiles}
      marginPolicy={marginPolicy}
      outcomeCounts={outcomeCounts}
      pendingTasks={pendingTasks}
      proposalMarginBlockedCount={proposalMarginBlockedCount}
      proposalStatusCounts={proposalStatusCounts}
      quoteDashboardSnapshot={quoteDashboardSnapshot}
      ranking={ranking}
      recentProposals={recentProposals}
      overallSummary={overallSummary}
      tenantName={tenant.name}
      users={users}
    />
  );
}
