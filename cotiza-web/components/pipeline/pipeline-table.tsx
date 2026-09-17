"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { OpportunityStage, OpportunityWithStage } from "@/lib/db/opportunities";

const STAGE_LABELS: Record<OpportunityStage, string> = {
  lost: "Perdida",
  open: "Abierta",
  won: "Ganada",
};

const STAGE_BADGE_CLASSES: Record<OpportunityStage, string> = {
  lost: "bg-rose-50 text-rose-700",
  open: "bg-blue-50 text-blue-700",
  won: "bg-emerald-50 text-emerald-700",
};

export type PipelineStageFilter = OpportunityStage | "all";

const FILTER_OPTIONS: Array<{ value: PipelineStageFilter; label: string }> = [
  { label: "Todas", value: "all" },
  { label: "Abiertas", value: "open" },
  { label: "Ganadas", value: "won" },
  { label: "Perdidas", value: "lost" },
];

// Id de anclaje para que las tarjetas de arriba (StatTile en
// pipeline-dashboard.tsx) puedan hacer scroll directo a la tabla al hacer
// click, ademas de fijar el filtro.
export const PIPELINE_TABLE_ANCHOR_ID = "pipeline-table";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

export function PipelineTable({
  onStageFilterChange,
  opportunities,
  stageFilter,
}: {
  onStageFilterChange: (next: PipelineStageFilter) => void;
  opportunities: OpportunityWithStage[];
  stageFilter: PipelineStageFilter;
}) {
  const filtered = useMemo(
    () => (stageFilter === "all" ? opportunities : opportunities.filter((opp) => opp.stage === stageFilter)),
    [opportunities, stageFilter],
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white" id={PIPELINE_TABLE_ANCHOR_ID}>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          Estado:
          <select
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
            onChange={(event) => onStageFilterChange(event.target.value as PipelineStageFilter)}
            value={stageFilter}
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-zinc-500">
          {filtered.length} {filtered.length === 1 ? "oportunidad" : "oportunidades"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500">Sin oportunidades para este filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs text-zinc-500">
                <th className="px-4 py-2 font-medium">Título</th>
                <th className="px-4 py-2 font-medium">Folio</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Monto</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Cierre esperado</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((opp) => (
                <tr key={opp.opportunityId}>
                  <td className="max-w-[220px] truncate px-4 py-2.5 font-medium text-zinc-900">{opp.title}</td>
                  <td className="px-4 py-2.5 text-zinc-500">{opp.opportunityNumber}</td>
                  <td className="px-4 py-2.5">
                    {opp.clientId ? (
                      <Link className="font-medium text-zinc-600 hover:underline" href={`/clientes/${opp.clientId}`}>
                        {opp.clientCompany ?? "Ver cliente"}
                      </Link>
                    ) : (
                      <span className="text-zinc-400">Sin cliente</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-700">{formatCurrency(opp.amount)}</td>
                  <td className="hidden px-4 py-2.5 text-zinc-500 sm:table-cell">
                    {formatDate(opp.expectedCloseDate)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_BADGE_CLASSES[opp.stage]}`}
                    >
                      {STAGE_LABELS[opp.stage]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
