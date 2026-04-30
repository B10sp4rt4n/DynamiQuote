import { QuoteShell } from "@/components/cotizador/quote-shell";
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

  const items = await getQuoteGroupsSummaryByTenant(tenant.id);
  const tenantOptions = await getActiveTenants();

  return (
    <QuoteShell
      currentTenantSlug={tenant.slug}
      items={items}
      tenantName={tenant.name}
      tenantOptions={tenantOptions}
    />
  );
}
