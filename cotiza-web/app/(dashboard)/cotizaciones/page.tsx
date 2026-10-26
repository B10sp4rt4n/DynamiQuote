import { QuoteShell } from "@/components/cotizador/quote-shell";
import { isTenantCapabilityEnabled, THREATDOWN_PDF_IMPORT } from "@/lib/db/tenant-capabilities";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getQuoteGroupsSummaryByTenant, getQuoteVersionSummaryByTenant } from "@/lib/db/quotes";
import { getActiveTenants } from "@/lib/db/tenants";

export const dynamic = "force-dynamic";

export default async function QuotesPage({ searchParams }: {
  searchParams: Promise<{ quoteId?: string | string[] }>;
}) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay tenants disponibles en Neon para cargar cotizaciones.
      </section>
    );
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const query = await searchParams;
  const quoteId = typeof query.quoteId === "string" ? query.quoteId : null;
  const [items, threatDownImportEnabled, requestedQuote] = await Promise.all([
    getQuoteGroupsSummaryByTenant(tenant.id, 12, tenant.userId, canSeeAll),
    isTenantCapabilityEnabled(tenant.id, THREATDOWN_PDF_IMPORT),
    quoteId ? getQuoteVersionSummaryByTenant(tenant.id, quoteId, tenant.userId, canSeeAll) : null,
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
      requestedQuote={requestedQuote}
      tenantName={tenant.name}
      tenantOptions={tenantOptions}
    />
  );
}
