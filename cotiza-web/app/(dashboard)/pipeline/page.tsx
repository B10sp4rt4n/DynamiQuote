import Link from "next/link";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  getOpportunityPipelineByTenant,
  getOpportunityPipelineSummaryByTenant,
  type OpportunityPipelineSummary,
  type OpportunityStage,
  type OpportunityWithStage,
} from "@/lib/db/opportunities";

export const dynamic = "force-dynamic";

// Paleta de estado fija (nunca tematizada) -- ver skill dataviz. good=ganado,
// critical=perdido. No se reutiliza el azul/esmeralda/rosa de Tailwind del
// tablero de abajo porque esos son solo tinte de tarjeta, no un indicador de
// estado real como esta barra.
const STATUS_GOOD = "#0ca30c";
const STATUS_CRITICAL = "#d03b3b";

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

function StatTile({
  accentClassName,
  amount,
  count,
  label,
}: {
  accentClassName: string;
  amount: number;
  count: number;
  label: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accentClassName}`}>
      <p className="text-xs font-medium text-zinc-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{count}</p>
      <p className="mt-0.5 text-sm text-zinc-600">{formatCurrency(amount)}</p>
    </div>
  );
}

// Tasa de cierre ponderada por monto (no por cantidad de tratos) -- decision
// confirmada con el usuario. Un pie de 2 rebanadas es un anti-patron
// documentado por el skill dataviz para "una proporcion contra un limite";
// se usa un Meter en su lugar, con la paleta de estado fija y ambos extremos
// etiquetados directamente (el color nunca es la unica señal).
function ClosingRateMeter({ summary }: { summary: OpportunityPipelineSummary }) {
  const decidedTotal = summary.won.amount + summary.lost.amount;

  if (decidedTotal <= 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-sm font-semibold text-zinc-900">Tasa de cierre por monto</p>
        <p className="mt-2 text-sm text-zinc-500">Aún no hay monto ganado ni perdido para calcular una tasa de cierre.</p>
      </div>
    );
  }

  const wonPct = (summary.won.amount / decidedTotal) * 100;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-900">Tasa de cierre por monto</p>
        <p className="text-sm font-semibold text-zinc-900">{wonPct.toFixed(0)}% ganado</p>
      </div>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-zinc-100" role="img" aria-label={`${wonPct.toFixed(0)}% del monto decidido fue ganado`}>
        <div style={{ backgroundColor: STATUS_GOOD, width: `${wonPct}%` }} />
        <div className="w-0.5 shrink-0 bg-white" />
        <div style={{ backgroundColor: STATUS_CRITICAL, width: `${100 - wonPct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-zinc-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS_GOOD }} />
          Ganado: {formatCurrency(summary.won.amount)} ({summary.won.count})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS_CRITICAL }} />
          Perdido: {formatCurrency(summary.lost.amount)} ({summary.lost.count})
        </span>
      </div>
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
  const [opportunities, summary] = await Promise.all([
    getOpportunityPipelineByTenant(tenant.id, tenant.userId, canSeeAll),
    getOpportunityPipelineSummaryByTenant(tenant.id, tenant.userId, canSeeAll),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Pipeline</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Todas las oportunidades del tenant, agrupadas por su desenlace real (ganada/perdida según el outcome de sus propuestas).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile accentClassName="border-blue-200 bg-blue-50" amount={summary.open.amount} count={summary.open.count} label="Abiertas" />
        <StatTile accentClassName="border-emerald-200 bg-emerald-50" amount={summary.won.amount} count={summary.won.count} label="Ganadas" />
        <StatTile accentClassName="border-rose-200 bg-rose-50" amount={summary.lost.amount} count={summary.lost.count} label="Perdidas" />
      </div>

      <ClosingRateMeter summary={summary} />

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
