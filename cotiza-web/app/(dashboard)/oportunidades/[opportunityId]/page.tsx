import { LoomContextPanel } from "@/components/integraciones/loom-context-panel";
import { loomPilotVisible } from "@/lib/integrations/loom/availability";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getBusinessWorkspace } from "@/lib/db/opportunity-workspace";
import { isDigestorFiscalEnabledForTenant } from "@/lib/integrations/digestor-fiscal";
import { CommercialFlow } from "@/components/commercial/commercial-flow";
import { BusinessFollowUp } from "@/components/commercial/business-follow-up";
import { QuoteOpportunityPanel } from "@/components/cotizador/quote-opportunity-panel";
import { OpportunityReview } from "@/components/pipeline/opportunity-review";
import { OpportunityAmount } from "@/components/pipeline/opportunity-amount";
import { DISPOSITION_LABELS } from "@/lib/domain/opportunity-disposition";
import { businessAmountCurrency, businessDocumentSummary, getBusinessFollowUp, proposalStatusLabel, proposalBillingLabel, businessBillingSection, isProposalAuthorized } from "@/lib/domain/business-follow-up";

export const dynamic = "force-dynamic";

function closeDate(value: string | null) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Fecha de cierre sin registrar";
  return new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export default async function BusinessPage({ params }: { params: Promise<{ opportunityId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) notFound();
  const { opportunityId } = await params;
  const canSeeAll = tenant.isSuperAdmin || ["owner", "admin"].includes(tenant.userRole);
  const workspace = await getBusinessWorkspace(tenant.id, opportunityId, { userId: tenant.userId, canSeeAll });
  if (!workspace) notFound();
  const { opportunity: opportunity, quotes, proposals, tasks, optionLabels, ownerName } = workspace;
  if (opportunity.opportunityId !== opportunityId) redirect(`/oportunidades/${encodeURIComponent(opportunity.opportunityId)}`);
  const showLoom = await loomPilotVisible(tenant);
  const billingEnabled = isDigestorFiscalEnabledForTenant(tenant.id);
  const context = { opportunityId: opportunity.opportunityId, opportunityNumber: opportunity.opportunityNumber, title: opportunity.title, stage: opportunity.stage,
    quoteId: quotes[0]?.quote_id, proposalId: proposals[0]?.proposal_id };
  const documents = businessDocumentSummary(quotes, proposals);
  const currency = businessAmountCurrency(proposals, opportunity.stage);
  const followUp = getBusinessFollowUp({ opportunityId, stage: opportunity.stage, clientId: opportunity.clientId, quotes, proposals,
    billingEnabled, alternativesNeedReview: opportunity.commercialOptions?.reviewRequired });
  const closed = ["won", "lost", "no_decision"].includes(opportunity.stage);
  const badge = opportunity.stage === "won" ? "bg-emerald-100 text-emerald-900" : opportunity.stage === "lost" ? "bg-rose-100 text-rose-900" : opportunity.stage === "paused" ? "bg-amber-100 text-amber-900" : "bg-zinc-100 text-zinc-800";

  return <div className="space-y-4 text-zinc-900">
    <Link className="inline-flex min-h-11 items-center text-sm text-blue-800 underline" href="/pipeline">← Todas las oportunidades</Link>
    <header id="resumen-negocio" className="scroll-mt-24 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span>{opportunity.opportunityNumber}</span><span className={`rounded-full px-3 py-1 ${badge}`}>{DISPOSITION_LABELS[opportunity.stage]}</span></div>
          <h1 className="mt-2 break-words text-2xl font-semibold">{opportunity.title}</h1>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div><dt className="text-zinc-500">Cliente</dt><dd className="font-medium">{opportunity.clientCompany ?? "Sin cliente asociado"}</dd></div>
            <div><dt className="text-zinc-500">Responsable</dt><dd>{ownerName ?? (opportunity.ownerUserId === tenant.userId ? tenant.userDisplayName : null) ?? "Sin responsable identificado en el directorio"}</dd></div>
            {closed ? <div><dt className="text-zinc-500">Cierre registrado</dt><dd>{closeDate(opportunity.closedAt)}</dd></div> : null}
          </dl>
        </div>
        <div className="min-w-0 rounded-lg bg-zinc-50 p-3 lg:max-w-sm">
          <p className="text-xs text-zinc-600">{opportunity.stage === "won" ? "Importe del cierre" : "Importe del negocio"}</p>
          <div className="mt-1 break-words text-lg font-semibold">{opportunity.amountUnestimated ? "Por estimar" : <OpportunityAmount opportunityId={opportunity.opportunityId} amount={opportunity.amount} options={opportunity.commercialOptions} stage={opportunity.stage} currency={currency.currency} showCurrency unknownCurrencyLabel={currency.label} multipleCurrencies={currency.mixed} />}</div>
          <OpportunityReview opportunity={opportunity} canManage={canSeeAll || opportunity.ownerUserId === tenant.userId} currency={currency.currency} showCurrency unknownCurrencyLabel={currency.label} multipleCurrencies={currency.mixed} />
        </div>
      </div>
    </header>
    {showLoom ? <LoomContextPanel key={tenant.id + ":" + tenant.userId + ":" + opportunity.opportunityId} tenantId={tenant.id} targetId={opportunity.opportunityId} kind="opportunity" /> : null}
    <BusinessFollowUp stage={opportunity.stage} action={followUp} />
    <CommercialFlow current={1} context={context} hideContext summaries={[DISPOSITION_LABELS[opportunity.stage], documents.quotes, documents.proposals]}
      completed={[opportunity.stage === "won", quotes.length > 0, proposals.some(row => row.outcome === "won" && isProposalAuthorized(row))]}
      billing={businessBillingSection(proposals, billingEnabled, opportunityId, opportunity.commercialOptions?.reviewRequired)} />
    <details id="datos-oportunidad" open={opportunity.stage === "open" && opportunity.intakePending} className="scroll-mt-24 rounded-xl border border-zinc-200 bg-white p-4">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">Datos comerciales{opportunity.intakePending ? " · datos por completar" : ""}</summary>
      <QuoteOpportunityPanel opportunityId={opportunity.opportunityId} />
    </details>
    <section className="scroll-mt-24 rounded-xl border border-zinc-200 bg-white p-5" id="propuestas">
      <h2 className="text-xl font-semibold">Propuestas vinculadas ({proposals.length})</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{proposals.map(proposal => {
        const outcome = proposal.outcome === "won" ? "Ganada" : proposal.outcome === "lost" ? "Perdida" : proposal.outcome === "discarded" ? "Descartada" : "Sin desenlace registrado";
        return <Link key={proposal.proposal_id} className="min-h-11 rounded-lg border border-zinc-300 p-4 hover:border-blue-600" href={`/propuestas/${encodeURIComponent(proposal.proposal_id)}`}>
          <strong className="block">{proposal.formal_proposals[0]?.proposal_number ?? "Propuesta sin folio formal"}</strong>
          <span className="mt-1 block text-sm">Estado: {proposalStatusLabel(proposal)} · Resultado: {outcome}</span>
          <span className="block text-sm">Envío: {proposal.formal_proposals[0]?.sent_at ? "Registrado" : "Sin envío registrado"}</span>
          {proposal.outcome === "won" ? <span className="mt-2 block text-sm font-medium text-emerald-800">{proposalBillingLabel(proposal)}</span> : null}
        </Link>;
      })}</div>
      {!proposals.length ? <p className="mt-3 text-zinc-600">Sin propuestas vinculadas en esta vista.</p> : null}
    </section>
    <section className="scroll-mt-24 rounded-xl border border-zinc-200 bg-white p-5" id="cotizaciones">
      <h2 className="text-xl font-semibold">Cotizaciones y revisiones ({quotes.length})</h2>
      <p className="mt-1 text-sm text-zinc-600">Las alternativas pertenecen al mismo negocio y conservan sus revisiones.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{quotes.map(quote => <Link key={quote.quote_id} className="min-h-11 rounded-lg border border-zinc-300 p-4 hover:border-blue-600" href={`/cotizaciones?quoteId=${encodeURIComponent(quote.quote_id)}`}>
        <span className="block text-sm font-semibold text-blue-800">{optionLabels[quote.quote_id] ? `Opción ${optionLabels[quote.quote_id]!.ordinal} · ${optionLabels[quote.quote_id]!.label}` : ""}</span>
        <strong className="block break-words">{quote.proposal_name || "Cotización"}</strong>
        <span className="text-sm">{quote.quote_group_id ?? "Sin folio"} · Revisión {quote.version ?? 1} · {quote.status ?? "Sin estado"}</span>
      </Link>)}</div>
      {!quotes.length ? <p className="mt-3 text-zinc-600">Sin cotizaciones vinculadas en esta vista.</p> : null}
    </section>
    <section className="rounded-xl border border-zinc-200 bg-white p-5" id="pendientes">
      <h2 className="text-xl font-semibold">Tareas abiertas ({tasks.length})</h2>
      {tasks.length ? <ul className="mt-3 space-y-3">{tasks.map(task => <li key={task.task_id} className="rounded-lg border border-zinc-200 p-3"><p className="whitespace-pre-wrap break-words">{task.description}</p><p className="mt-1 text-sm text-zinc-600">Fecha: {task.due_date.toISOString().slice(0, 10)}</p></li>)}</ul> : <p className="mt-3 text-zinc-600">Sin tareas abiertas vinculadas a esta oportunidad.</p>}
    </section>
  </div>;
}
