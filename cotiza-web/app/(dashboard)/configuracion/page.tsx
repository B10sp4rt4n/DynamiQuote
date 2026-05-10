import { SettingsShell } from "@/components/configuracion/settings-shell";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getMarginPolicyByTenant } from "@/lib/db/margin-policies";
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

  const [users, issuerProfiles, marginPolicy, tenantOptions] = await Promise.all([
    tenant.isSuperAdmin ? getAppUsersForSuperAdmin() : getAppUsersByTenant(tenant.id),
    getIssuerProfilesByTenant(tenant.id),
    getMarginPolicyByTenant(tenant.id),
    getActiveTenants(),
  ]);

  return (
    <SettingsShell
      canManageAllTenants={tenant.isSuperAdmin}
      canManagePolicy={tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin"}
      marginPolicy={marginPolicy}
      issuerProfiles={issuerProfiles}
      tenantOptions={tenantOptions}
      tenantName={tenant.name}
      users={users}
    />
  );
}
