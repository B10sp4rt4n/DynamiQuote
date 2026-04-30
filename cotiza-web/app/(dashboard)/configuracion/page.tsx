import { SettingsShell } from "@/components/configuracion/settings-shell";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getAppUsersByTenant, getIssuerProfilesByTenant } from "@/lib/db/settings";

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

  const [users, issuerProfiles] = await Promise.all([
    getAppUsersByTenant(tenant.id),
    getIssuerProfilesByTenant(tenant.id),
  ]);

  return (
    <SettingsShell issuerProfiles={issuerProfiles} tenantName={tenant.name} users={users} />
  );
}
