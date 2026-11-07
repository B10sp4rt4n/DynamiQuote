import { getOpportunityPipelineByTenant } from "@/lib/db/opportunities";
import { QuoteShell } from "@/components/cotizador/quote-shell";
import { isTenantCapabilityEnabled, THREATDOWN_PDF_IMPORT } from "@/lib/db/tenant-capabilities";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getQuoteGroupsSummaryByTenant, getQuoteVersionSummaryByTenant } from "@/lib/db/quotes";

export const dynamic = "force-dynamic";

export default async function QuotesPage({ searchParams }: {
  searchParams: Promise<{ quoteId?: string | string[]; opportunityId?: string | string[] }>;
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
  const [items, threatDownImportEnabled, requestedQuote, guidedQuotingEnabled, playbookFieldEnabled] = await Promise.all([
    getQuoteGroupsSummaryByTenant(tenant.id, 12, tenant.userId, canSeeAll),
    isTenantCapabilityEnabled(tenant.id, THREATDOWN_PDF_IMPORT),
    quoteId ? getQuoteVersionSummaryByTenant(tenant.id, quoteId, tenant.userId, canSeeAll) : null,
    isTenantCapabilityEnabled(tenant.id, "cpq_guided_preview"),
    isTenantCapabilityEnabled(tenant.id, "quote_playbook_field"),
  ]);
  const requestedOpportunityId = typeof query.opportunityId === "string" ? query.opportunityId : null;
  const available = requestedOpportunityId ? await getOpportunityPipelineByTenant(tenant.id, tenant.userId, canSeeAll) : [];
  const selected = available.find(o=>o.opportunityId === requestedOpportunityId && o.stage === "open" && o.clientId && (canSeeAll || o.ownerUserId === tenant.userId));
  if (requestedOpportunityId && !selected) return <section className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-950">Oportunidad no disponible para tu sesión. Regresa a Oportunidades y selecciona un negocio abierto.</section>;
  const initialOpportunity = selected && selected.clientId ? { opportunityId: selected.opportunityId, title: selected.title, clientId: selected.clientId, company: selected.clientCompany ?? "" } : undefined;

  return (
    <QuoteShell
      key={`${tenant.id}:${tenant.userId}:${initialOpportunity?.opportunityId ?? "default"}`}
      initialOpportunity={initialOpportunity}
      playbookFieldEnabled={playbookFieldEnabled}
      guidedQuotingEnabled={guidedQuotingEnabled}
      threatDownImportEnabled={threatDownImportEnabled}
      items={items}
      requestedQuote={requestedQuote}
      tenantName={tenant.name}
    />
  );
}
