"use client";

import { useMemo, useState } from "react";

import { PipelineTable } from "@/components/pipeline/pipeline-table";
import type { OpportunityStage, OpportunityWithStage } from "@/lib/db/opportunities";

// Paleta de estado fija (nunca tematizada) -- ver skill dataviz. good=ganado,
// critical=perdido. No se reutiliza el azul/esmeralda/rosa de Tailwind del
// tablero de abajo porque esos son solo tinte de tarjeta, no un indicador de
// estado real como esta barra.
const STATUS_GOOD = "#0ca30c";
const STATUS_CRITICAL = "#d03b3b";

// Clave sintetica para las oportunidades sin owner_user_id (visibles a todos
// bajo el mismo criterio "ve lo tuyo vs ve todo" del resto de la app) -- se
// tratan como un "vendedor" mas en el selector para que tambien se puedan
// mostrar u ocultar explicitamente.
const UNASSIGNED_KEY = "__unassigned__";

export type PipelineVendor = {
  label: string;
  userId: string;
};

type StageSummary = { amount: number; count: number };
type PipelineSummary = Record<OpportunityStage, StageSummary>;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

// El roster de vendedores (getAppUsersByTenant) solo trae usuarios ACTUALES
// -- pero owner_user_id de una oportunidad vieja puede apuntar a un user_id
// que ya no existe en app_users (ej. un relink de Clerk, mismo tipo de
// deuda ya documentada en CLAUDE.md para created_by_user_id). Si "Todos"
// solo marcara los IDs del roster, esas oportunidades desaparecerian del
// Pipeline sin ningun checkbox que las represente -- silenciosamente, sin
// que nadie pueda volver a mostrarlas. Por eso el default y el boton
// "Todos" se calculan sobre TODOS los owner_user_id que de verdad aparecen
// en los datos, no solo sobre el roster conocido.
function buildEffectiveVendors(opportunities: OpportunityWithStage[], vendors: PipelineVendor[]): PipelineVendor[] {
  const knownIds = new Set(vendors.map((v) => v.userId));
  const orphanedIds = new Set<string>();

  for (const opp of opportunities) {
    if (opp.ownerUserId && !knownIds.has(opp.ownerUserId)) {
      orphanedIds.add(opp.ownerUserId);
    }
  }

  const orphanedVendors: PipelineVendor[] = [...orphanedIds].map((id) => ({
    label: `Vendedor sin cuenta activa (…${id.slice(-6)})`,
    userId: id,
  }));

  return [...vendors, ...orphanedVendors];
}

function computeSummary(opportunities: OpportunityWithStage[]): PipelineSummary {
  const summary: PipelineSummary = {
    lost: { amount: 0, count: 0 },
    open: { amount: 0, count: 0 },
    won: { amount: 0, count: 0 },
  };

  for (const opp of opportunities) {
    summary[opp.stage].count += 1;
    summary[opp.stage].amount += opp.amount;
  }

  return summary;
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
function ClosingRateMeter({ summary }: { summary: PipelineSummary }) {
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
      <div
        aria-label={`${wonPct.toFixed(0)}% del monto decidido fue ganado`}
        className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-zinc-100"
        role="img"
      >
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

// Selector "ver por vendedor" -- solo para quien ya puede ver todo el
// tenant (owner/admin/superadmin). No es un mecanismo de seguridad nuevo:
// el servidor ya solo envia al navegador lo que ese rol tiene autorizado
// ver (getOpportunityPipelineByTenant con canSeeAll=true trae TODO el
// tenant cuando corresponde) -- este control solo filtra en el cliente
// sobre datos que ya llegaron legitimamente, para poder verse a si mismo
// como vendedor, a otro vendedor, a varios juntos, o por separado.
// Salvador, 2026-09-17.
function VendorFilter({
  onChange,
  selectedIds,
  vendors,
  viewerUserId,
}: {
  onChange: (next: Set<string>) => void;
  selectedIds: Set<string>;
  vendors: PipelineVendor[];
  viewerUserId: string | null;
}) {
  const [search, setSearch] = useState("");

  const allIds = useMemo(() => [UNASSIGNED_KEY, ...vendors.map((v) => v.userId)], [vendors]);

  const visibleVendors = useMemo(() => {
    const options: PipelineVendor[] = [{ label: "Sin asignar", userId: UNASSIGNED_KEY }, ...vendors];
    const q = search.trim().toLowerCase();
    if (q.length === 0) return options;
    return options.filter((v) => v.label.toLowerCase().includes(q));
  }, [vendors, search]);

  function toggle(userId: string) {
    const next = new Set(selectedIds);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    onChange(next);
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Ver por vendedor</h2>
          <p className="text-xs text-zinc-500">
            Marca o desmarca para verte a ti mismo, a otro vendedor, a varios juntos, o por separado.
          </p>
        </div>
        <div className="flex gap-2 text-xs font-medium text-zinc-600">
          <button className="rounded-full border border-zinc-300 px-2.5 py-1 hover:bg-zinc-50" onClick={() => onChange(new Set(allIds))} type="button">
            Todos
          </button>
          {viewerUserId ? (
            <button
              className="rounded-full border border-zinc-300 px-2.5 py-1 hover:bg-zinc-50"
              onClick={() => onChange(new Set([viewerUserId]))}
              type="button"
            >
              Solo yo
            </button>
          ) : null}
          <button className="rounded-full border border-zinc-300 px-2.5 py-1 hover:bg-zinc-50" onClick={() => onChange(new Set())} type="button">
            Ninguno
          </button>
        </div>
      </div>

      <input
        className="mt-3 w-full max-w-xs rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-400"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar vendedor..."
        type="search"
        value={search}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {visibleVendors.map((vendor) => (
          <label
            className="flex items-center gap-2 rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700"
            key={vendor.userId}
          >
            <input checked={selectedIds.has(vendor.userId)} onChange={() => toggle(vendor.userId)} type="checkbox" />
            {vendor.label}
            {vendor.userId === viewerUserId ? " (tú)" : ""}
          </label>
        ))}
        {visibleVendors.length === 0 ? <p className="text-sm text-zinc-500">Ningún vendedor coincide con la búsqueda.</p> : null}
      </div>
    </section>
  );
}

export function PipelineDashboard({
  canSeeAll,
  opportunities,
  vendors,
  viewerUserId,
}: {
  canSeeAll: boolean;
  opportunities: OpportunityWithStage[];
  vendors: PipelineVendor[];
  viewerUserId: string | null;
}) {
  const effectiveVendors = useMemo(() => buildEffectiveVendors(opportunities, vendors), [opportunities, vendors]);
  const showVendorFilter = canSeeAll && effectiveVendors.length > 0;

  const [selectedVendorIds, setSelectedVendorIds] = useState<Set<string>>(
    () => new Set([UNASSIGNED_KEY, ...effectiveVendors.map((v) => v.userId)]),
  );

  const filteredOpportunities = useMemo(() => {
    if (!showVendorFilter) return opportunities;
    return opportunities.filter((opp) => selectedVendorIds.has(opp.ownerUserId ?? UNASSIGNED_KEY));
  }, [opportunities, selectedVendorIds, showVendorFilter]);

  const summary = useMemo(() => computeSummary(filteredOpportunities), [filteredOpportunities]);

  return (
    <div className="space-y-6">
      {showVendorFilter ? (
        <VendorFilter onChange={setSelectedVendorIds} selectedIds={selectedVendorIds} vendors={effectiveVendors} viewerUserId={viewerUserId} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile accentClassName="border-blue-200 bg-blue-50" amount={summary.open.amount} count={summary.open.count} label="Abiertas" />
        <StatTile accentClassName="border-emerald-200 bg-emerald-50" amount={summary.won.amount} count={summary.won.count} label="Ganadas" />
        <StatTile accentClassName="border-rose-200 bg-rose-50" amount={summary.lost.amount} count={summary.lost.count} label="Perdidas" />
      </div>

      <ClosingRateMeter summary={summary} />

      {filteredOpportunities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <p className="text-sm text-zinc-500">
            {opportunities.length === 0 ? "Aún no hay oportunidades registradas." : "Ningún vendedor seleccionado tiene oportunidades."}
          </p>
        </div>
      ) : (
        <PipelineTable opportunities={filteredOpportunities} />
      )}
    </div>
  );
}
