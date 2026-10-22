import { QuoteShell } from "@/components/cotizador/quote-shell";
import { isTenantCapabilityEnabled, THREATDOWN_PDF_IMPORT } from "@/lib/db/tenant-capabilities";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getQuoteGroupsSummaryByTenant } from "@/lib/db/quotes";
import { getActiveTenants } from "@/lib/db/tenants";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay tenants disponibles en Neon para cargar cotizaciones.
      </section>
    );
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const [items, threatDownImportEnabled] = await Promise.all([
    getQuoteGroupsSummaryByTenant(tenant.id, 12, tenant.userId, canSeeAll),
    isTenantCapabilityEnabled(tenant.id, THREATDOWN_PDF_IMPORT),
  ]);
  const canSwitchTenant = tenant.isSuperAdmin;
  const tenantOptions = canSwitchTenant
    ? await getActiveTenants()
    : [{ id: tenant.id, name: tenant.name, slug: tenant.slug }];

  return (
    <QuoteShell
      threatDownImportEnabled={threatDownImportEnabled}
      canSwitchTenant={canSwitchTenant}
      currentTenantSlug={tenant.slug}
      items={items}
      tenantName={tenant.name}
      tenantOptions={tenantOptions}
    />
  );
}
