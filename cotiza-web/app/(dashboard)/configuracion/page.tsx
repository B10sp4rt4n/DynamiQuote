import { SettingsShell } from "@/components/configuracion/settings-shell";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
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

  const [users, issuerProfiles, tenantOptions] = await Promise.all([
    tenant.isSuperAdmin ? getAppUsersForSuperAdmin() : getAppUsersByTenant(tenant.id),
    getIssuerProfilesByTenant(tenant.id),
    tenant.isSuperAdmin ? getActiveTenants() : Promise.resolve([]),
  ]);

  return (
    <SettingsShell
      canManageAllTenants={tenant.isSuperAdmin}
      issuerProfiles={issuerProfiles}
      tenantOptions={tenantOptions}
      tenantName={tenant.name}
      users={users}
    />
  );
}
