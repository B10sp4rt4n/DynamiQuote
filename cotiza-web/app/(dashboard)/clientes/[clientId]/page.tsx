import Link from "next/link";

import { ClientTasksPanel } from "@/components/clientes/client-tasks-panel";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { listClientContactsForTenant } from "@/lib/db/client-contacts";
import { getClientByIdForTenant } from "@/lib/db/clients";
import { listInteractionLogsForTenant } from "@/lib/db/interaction-logs";
import { getOpportunitiesByClientForTenant, type OpportunityStage } from "@/lib/db/opportunities";
import { getClientProposalHistoryByTenant, type ClientProposalHistoryItem } from "@/lib/db/proposals";
import { getQuoteGroupsByClientForTenant } from "@/lib/db/quotes";
import { getPendingTasksByClientForTenant } from "@/lib/db/tasks";
import type { ProposalStatus } from "@/lib/validations/proposals";

export const dynamic = "force-dynamic";

type ClientDetailPageProps = {
  params: Promise<{ clientId: string }>;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  approved: "Aprobada",
  draft: "Borrador",
  expired: "Vencida",
  in_review: "En revisión",
  rejected: "Rechazada",
  sent: "Enviada",
};

const PROPOSAL_STATUS_CLASSES: Record<ProposalStatus, string> = {
  approved: "bg-emerald-100 text-emerald-800",
  draft: "bg-zinc-100 text-zinc-700",
  expired: "bg-zinc-200 text-zinc-600",
  in_review: "bg-amber-100 text-amber-800",
  rejected: "bg-rose-100 text-rose-800",
  sent: "bg-blue-100 text-blue-800",
};

const OUTCOME_LABELS: Record<NonNullable<ClientProposalHistoryItem["outcome"]>, string> = {
  discarded: "Descartada",
  lost: "Perdida",
  won: "Ganada",
};

const OUTCOME_CLASSES: Record<NonNullable<ClientProposalHistoryItem["outcome"]>, string> = {
  discarded: "bg-zinc-100 text-zinc-500",
  lost: "bg-rose-100 text-rose-800",
  won: "bg-emerald-100 text-emerald-800",
};

const STAGE_LABELS: Record<OpportunityStage, string> = {
  lost: "Perdida",
  open: "Abierta",
  won: "Ganada",
};

const STAGE_CLASSES: Record<OpportunityStage, string> = {
  lost: "bg-rose-100 text-rose-800",
  open: "bg-blue-100 text-blue-800",
  won: "bg-emerald-100 text-emerald-800",
};

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay contexto de tenant disponible.
      </section>
    );
  }

  const { clientId } = await params;
  const client = await getClientByIdForTenant(clientId, tenant.id);

  if (!client) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        Cliente no encontrado.
      </section>
    );
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";

  const [contacts, opportunities, quoteGroups, proposals, tasks, interactions] = await Promise.all([
    listClientContactsForTenant(tenant.id, clientId),
    getOpportunitiesByClientForTenant(tenant.id, clientId),
    getQuoteGroupsByClientForTenant(tenant.id, clientId, tenant.userId, canSeeAll),
    getClientProposalHistoryByTenant(tenant.id, clientId, tenant.userId, canSeeAll),
    getPendingTasksByClientForTenant(tenant.id, clientId, tenant.userId, canSeeAll),
    listInteractionLogsForTenant(tenant.id, clientId),
  ]);

  return (
    <div className="space-y-4">
      <Link className="text-sm font-medium text-zinc-600 hover:text-zinc-900" href="/configuracion/clientes">
        ← Volver a Clientes
      </Link>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{client.company}</h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  client.active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {client.active ? "Activo" : "Inactivo"}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {client.industry ?? "Sin industria"}
              {client.rfc ? ` · RFC ${client.rfc}` : ""}
            </p>
            {client.address ? <p className="mt-1 text-sm text-zinc-500">{client.address}</p> : null}
          </div>
          <div className="text-right text-sm text-zinc-600">
            <p className="font-medium text-zinc-900">{client.contactName ?? "Sin contacto principal"}</p>
            {client.contactTitle ? <p className="text-zinc-500">{client.contactTitle}</p> : null}
            {client.contactEmail ? <p className="text-zinc-500">{client.contactEmail}</p> : null}
            {client.contactPhone ? <p className="text-zinc-500">{client.contactPhone}</p> : null}
          </div>
        </div>
      </section>

      {contacts.length > 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Otros contactos</h2>
          <ul className="mt-2 space-y-1">
            {contacts.map((contact) => (
              <li className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-700" key={contact.contactId}>
                <span className="font-medium text-zinc-900">
                  {contact.firstName}
                  {contact.lastName ? ` ${contact.lastName}` : ""}
                </span>
                {contact.title ? ` — ${contact.title}` : ""}
                {contact.email ? ` · ${contact.email}` : ""}
                {contact.phone ? ` · ${contact.phone}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Oportunidades ({opportunities.length})</h2>
        {opportunities.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Sin oportunidades registradas.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100">
            {opportunities.map((opp) => (
              <li className="flex items-center justify-between gap-3 py-2 text-sm" key={opp.opportunityId}>
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">
                    {opp.opportunityNumber} — {opp.title}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatCurrency(opp.estimatedValue)}
                    {opp.expectedCloseDate ? ` · cierre esperado ${formatDate(opp.expectedCloseDate)}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_CLASSES[opp.stage]}`}>
                  {STAGE_LABELS[opp.stage]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Cotizaciones ({quoteGroups.length})</h2>
        {quoteGroups.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Sin cotizaciones registradas.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100">
            {quoteGroups.map((quote) => (
              <li className="flex items-center justify-between gap-3 py-2 text-sm" key={quote.quoteGroupId}>
                <div className="min-w-0">
                  <Link
                    className="truncate font-medium text-zinc-900 hover:underline"
                    href={`/cotizaciones?quoteId=${quote.quoteId}`}
                  >
                    {quote.quoteGroupId} · v{quote.version}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {formatCurrency(quote.totalRevenue)}
                    {quote.avgMargin !== null ? ` · margen ${quote.avgMargin.toFixed(1)}%` : ""}
                    {" · "}
                    {formatDate(quote.createdAt)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                  {quote.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Propuestas ({proposals.length})</h2>
        {proposals.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Sin propuestas registradas.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100">
            {proposals.map((proposal) => (
              <li className="flex items-center justify-between gap-3 py-2 text-sm" key={proposal.proposalId}>
                <div className="min-w-0">
                  <Link
                    className="truncate font-medium text-zinc-900 hover:underline"
                    href={`/propuestas/${proposal.proposalId}`}
                  >
                    {proposal.proposalNumber}
                  </Link>
                  <p className="text-xs text-zinc-500">{formatDate(proposal.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {proposal.outcome ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${OUTCOME_CLASSES[proposal.outcome]}`}>
                      {OUTCOME_LABELS[proposal.outcome]}
                    </span>
                  ) : null}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PROPOSAL_STATUS_CLASSES[proposal.status]}`}>
                    {PROPOSAL_STATUS_LABELS[proposal.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Tareas pendientes</h2>
        <div className="mt-2">
          <ClientTasksPanel tasks={tasks} />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Bitácora</h2>
        {interactions.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Sin notas registradas.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {interactions.map((interaction) => (
              <li className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-700" key={interaction.interactionId}>
                <p className="whitespace-pre-wrap text-zinc-900">{interaction.note}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {formatDate(interaction.createdAt)}
                  {interaction.authorDisplayName ? ` · ${interaction.authorDisplayName}` : ""}
                  {interaction.opportunityNumber ? ` · ${interaction.opportunityNumber}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
