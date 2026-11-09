import { SettingsShell } from "@/components/configuracion/settings-shell";
import Link from "next/link";
import { mercadoLibreEnabled } from "@/lib/integrations/mercadolibre/config";
import { isTenantCapabilityEnabled, THREATDOWN_PDF_IMPORT } from "@/lib/db/tenant-capabilities";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getMarginPolicyByTenant } from "@/lib/db/margin-policies";
import { getAppUsersByTenant, getAppUsersForSuperAdmin, getIssuerProfilesByTenant } from "@/lib/db/settings";
import { getActiveTenants, getTenantProfileByTenant } from "@/lib/db/tenants";

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

  const canSwitchTenant = tenant.isSuperAdmin;
  const canManageUsers = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";

  const [users, issuerProfiles, marginPolicy, tenantOptions, tenantProfile, threatDownImportEnabled, guidedQuotingEnabled, crmWorkspaceEnabled, playbookFieldEnabled] = await Promise.all([
    canManageUsers
      ? tenant.isSuperAdmin
        ? getAppUsersForSuperAdmin()
        : getAppUsersByTenant(tenant.id)
      : Promise.resolve([]),
    getIssuerProfilesByTenant(tenant.id),
    getMarginPolicyByTenant(tenant.id),
    canSwitchTenant ? getActiveTenants() : Promise.resolve([{ id: tenant.id, name: tenant.name, slug: tenant.slug }]),
    getTenantProfileByTenant(tenant.id),
    isTenantCapabilityEnabled(tenant.id, THREATDOWN_PDF_IMPORT),
    isTenantCapabilityEnabled(tenant.id, "cpq_guided_preview"),
    isTenantCapabilityEnabled(tenant.id, "crm_workspace_pilot"),
    isTenantCapabilityEnabled(tenant.id, "quote_playbook_field"),
  ]);

  return (
    <>
    {canManageUsers && tenant.authMode === "clerk" && mercadoLibreEnabled(tenant.id) ?
      <Link href="/configuracion/integraciones/mercadolibre" className="mb-5 block rounded-xl border border-zinc-300 bg-white p-5">
        <span className="font-semibold">Mercado Libre</span>
        <span className="mt-1 block text-sm text-zinc-600">Conectar cuenta y consultar ventas de {tenant.name}</span>
      </Link> : null}
    <SettingsShell
      threatDownImportEnabled={threatDownImportEnabled}
      playbookFieldEnabled={playbookFieldEnabled}
      guidedQuotingEnabled={guidedQuotingEnabled}
      crmWorkspaceEnabled={crmWorkspaceEnabled}
      canSwitchTenant={canSwitchTenant}
      canManageAllTenants={tenant.isSuperAdmin}
      canViewTenantConfig={tenant.isSuperAdmin || tenant.userRole === "owner"}
      canManagePolicy={tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin"}
      canManageUsers={canManageUsers}
      marginPolicy={marginPolicy}
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      issuerProfiles={issuerProfiles}
      tenantOptions={tenantOptions}
      tenantName={tenant.name}
      tenantProfile={tenantProfile}
      users={users}
    />
    </>
  );
}
