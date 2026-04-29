import { PackagesShell } from "@/components/paquetes/packages-shell";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getPackagesSummaryByTenant } from "@/lib/db/packages";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay tenants disponibles en Neon para cargar los paquetes.
      </section>
    );
  }

  const packages = await getPackagesSummaryByTenant(tenant.id);

  return <PackagesShell initialPackages={packages} tenantName={tenant.name} />;
}
