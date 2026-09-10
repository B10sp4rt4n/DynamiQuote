import { SettingsShell } from "@/components/configuracion/settings-shell";
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

  const [users, issuerProfiles, marginPolicy, tenantOptions, tenantProfile] = await Promise.all([
    canManageUsers
      ? tenant.isSuperAdmin
        ? getAppUsersForSuperAdmin()
        : getAppUsersByTenant(tenant.id)
      : Promise.resolve([]),
    getIssuerProfilesByTenant(tenant.id),
    getMarginPolicyByTenant(tenant.id),
    canSwitchTenant ? getActiveTenants() : Promise.resolve([{ id: tenant.id, name: tenant.name, slug: tenant.slug }]),
    getTenantProfileByTenant(tenant.id),
  ]);

  return (
    <SettingsShell
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
  );
}
