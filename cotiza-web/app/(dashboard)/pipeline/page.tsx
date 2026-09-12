import Link from "next/link";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getOpportunityPipelineByTenant, type OpportunityStage, type OpportunityWithStage } from "@/lib/db/opportunities";

export const dynamic = "force-dynamic";

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

const COLUMNS: Array<{ stage: OpportunityStage; label: string; className: string }> = [
  { className: "border-blue-200 bg-blue-50", label: "Abiertas", stage: "open" },
  { className: "border-emerald-200 bg-emerald-50", label: "Ganadas", stage: "won" },
  { className: "border-rose-200 bg-rose-50", label: "Perdidas", stage: "lost" },
];

function OpportunityCard({ opportunity }: { opportunity: OpportunityWithStage }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <p className="text-sm font-medium text-zinc-900">{opportunity.title}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{opportunity.opportunityNumber}</p>
      {opportunity.clientId ? (
        <Link className="mt-1 block text-xs font-medium text-zinc-600 hover:underline" href={`/clientes/${opportunity.clientId}`}>
          {opportunity.clientCompany ?? "Ver cliente"}
        </Link>
      ) : (
        <p className="mt-1 text-xs text-zinc-400">Sin cliente</p>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        {formatCurrency(opportunity.estimatedValue)}
        {opportunity.expectedCloseDate ? ` · cierre ${formatDate(opportunity.expectedCloseDate)}` : ""}
      </p>
    </div>
  );
}

export default async function PipelinePage() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay contexto de tenant disponible.
      </section>
    );
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const opportunities = await getOpportunityPipelineByTenant(tenant.id, tenant.userId, canSeeAll);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Pipeline</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Todas las oportunidades del tenant, agrupadas por su desenlace real (ganada/perdida según el outcome de sus propuestas).
        </p>
      </div>

      {opportunities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <p className="text-sm text-zinc-500">Aún no hay oportunidades registradas.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((column) => {
            const items = opportunities.filter((opp) => opp.stage === column.stage);
            return (
              <div className={`rounded-xl border p-3 ${column.className}`} key={column.stage}>
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-zinc-900">{column.label}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-600">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="px-1 text-sm text-zinc-500">Sin oportunidades.</p>
                  ) : (
                    items.map((opp) => <OpportunityCard key={opp.opportunityId} opportunity={opp} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
