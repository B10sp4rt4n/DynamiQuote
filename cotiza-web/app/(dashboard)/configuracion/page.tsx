import { SettingsShell } from "@/components/configuracion/settings-shell";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getMarginPolicyByTenant } from "@/lib/db/margin-policies";
import {
  getProposalMarginBlockedCountByTenant,
  getProposalStatusCountsByTenant,
  getProposalSummariesByTenant,
} from "@/lib/db/proposals";
import { getQuoteDashboardSnapshotByTenant } from "@/lib/db/quotes";
import { getAppUsersByTenant, getAppUsersForSuperAdmin, getIssuerProfilesByTenant } from "@/lib/db/settings";
import { getActiveTenants } from "@/lib/db/tenants";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay tenants disponibles en Neon para cargar la configuracion.
      </section>
    );
  }

  const canSwitchTenant = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";

  const [
    users,
    issuerProfiles,
    marginPolicy,
    tenantOptions,
    proposalStatusCounts,
    proposalMarginBlockedCount,
    quoteDashboardSnapshot,
    recentProposals,
  ] = await Promise.all([
    tenant.isSuperAdmin ? getAppUsersForSuperAdmin() : getAppUsersByTenant(tenant.id),
    getIssuerProfilesByTenant(tenant.id),
    getMarginPolicyByTenant(tenant.id),
    canSwitchTenant ? getActiveTenants() : Promise.resolve([{ id: tenant.id, name: tenant.name, slug: tenant.slug }]),
    getProposalStatusCountsByTenant(tenant.id),
    getProposalMarginBlockedCountByTenant(tenant.id),
    getQuoteDashboardSnapshotByTenant(tenant.id),
    getProposalSummariesByTenant(tenant.id, 6),
  ]);

  return (
    <SettingsShell
      canSwitchTenant={canSwitchTenant}
      canManageAllTenants={tenant.isSuperAdmin}
      canViewControl={tenant.isSuperAdmin || tenant.userRole === "owner"}
      canViewTenantConfig={tenant.isSuperAdmin || tenant.userRole === "owner"}
      canManagePolicy={tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin"}
      marginPolicy={marginPolicy}
      proposalMarginBlockedCount={proposalMarginBlockedCount}
      proposalStatusCounts={proposalStatusCounts}
      quoteDashboardSnapshot={quoteDashboardSnapshot}
      recentProposals={recentProposals}
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      issuerProfiles={issuerProfiles}
      tenantOptions={tenantOptions}
      tenantName={tenant.name}
      users={users}
    />
  );
}
