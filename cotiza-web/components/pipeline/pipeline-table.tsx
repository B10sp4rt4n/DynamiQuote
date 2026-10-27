"use client";

import Link from "next/link";
import { OpportunityAmount } from "./opportunity-amount";
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
export type PipelineCloseFilter = "all" | "calculable" | "undated" | "review";

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

function formatDate(iso: string | null, timeZone = "UTC"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone }).format(
    new Date(iso),
  );
}


export function PipelineTable({
  canChooseOptions = false,
  closeFilter,
  onCloseFilterChange,
  onSearchChange,
  onStageFilterChange,
  opportunities,
  search,
  stageFilter,
}: {
  canChooseOptions?: boolean;
  closeFilter: PipelineCloseFilter;
  onCloseFilterChange: (next: PipelineCloseFilter) => void;
  onSearchChange: (next: string) => void;
  onStageFilterChange: (next: PipelineStageFilter) => void;
  opportunities: OpportunityWithStage[];
  search: string;
  stageFilter: PipelineStageFilter;
}) {
  const filtered = useMemo(() => {
    const byStage = stageFilter === "all" ? opportunities : opportunities.filter((opp) => opp.stage === stageFilter);
    const byClose = byStage.filter((opp) => {
      if (closeFilter === "all") return true;
      if (opp.stage === "open") return false;
      if (closeFilter === "calculable") return opp.lifetimeDays !== null;
      if (closeFilter === "undated") return opp.closedAt === null;
      return opp.closedAt !== null && opp.lifetimeDays === null;
    });
    const q = search.trim().toLowerCase();
    if (q.length === 0) return byClose;
    return byClose.filter(
      (opp) =>
        opp.title.toLowerCase().includes(q) ||
        opp.opportunityNumber.toLowerCase().includes(q) ||
        (opp.clientCompany ?? "").toLowerCase().includes(q),
    );
  }, [opportunities, stageFilter, closeFilter, search]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white" id={PIPELINE_TABLE_ANCHOR_ID}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
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
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            Cierre:
            <select
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
              onChange={(event) => onCloseFilterChange(event.target.value as PipelineCloseFilter)}
              value={closeFilter}
            >
              <option value="all">Todos</option>
              <option value="calculable">Con duración calculable</option>
              <option value="undated">Sin fecha de cierre</option>
              <option value="review">Fechas por revisar</option>
            </select>
          </label>
          <input
            aria-label="Buscar título, folio o cliente"
            className="w-56 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar título, folio o cliente..."
            type="search"
            value={search}
          />
        </div>
        <span aria-live="polite" className="text-xs text-zinc-500">
          {filtered.length} {filtered.length === 1 ? "oportunidad" : "oportunidades"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500">
          {search.trim().length > 0 ? "Ningún título, folio o cliente coincide con la búsqueda." : "Sin oportunidades para este filtro."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs text-zinc-500">
                <th className="px-4 py-2 font-medium">Título</th>
                <th className="px-4 py-2 font-medium">Folio</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Monto</th>
                <th className="px-4 py-2 font-medium">Inicio</th>
                <th className="px-4 py-2 font-medium">Cierre real</th>
                <th className="px-4 py-2 font-medium">Tiempo de vida</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Cierre esperado</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((opp) => (
                <tr key={opp.opportunityId}>
                  <td className="max-w-[220px] px-4 py-2.5 font-medium text-zinc-900"><span className="block truncate">{opp.title}</span>
                    {opp.intakePending && opp.intakeQuoteId ? <Link className="mt-1 inline-block rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950 hover:underline"
                      href={`/cotizaciones?quoteId=${encodeURIComponent(opp.intakeQuoteId)}`}>Completar datos de oportunidad</Link> : null}</td>
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
                  <td className="px-4 py-2.5 text-zinc-700"><OpportunityAmount amount={opp.amount} options={opp.commercialOptions} opportunityId={opp.opportunityId} canChoose={canChooseOptions} stage={opp.stage} /></td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">{formatDate(opp.createdAt, "America/Mexico_City")}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">
                    {opp.stage === "open" ? "Pendiente" : opp.closedAt ? formatDate(opp.closedAt, "America/Mexico_City") : "Sin fecha registrada"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-zinc-700">
                    {opp.lifetimeDays === null ? "Sin duración calculable" : `${opp.lifetimeDays} días${opp.stage === "open" ? " abierta" : " al cierre"}`}
                  </td>
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
      <p className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">
        Inicio de la oportunidad original; las versiones no reinician el reloj. Fechas en horario de Ciudad de México.
        Las abiertas cuentan días completos de 24 horas; las cerradas, días de calendario hasta el cierre.
        Los cierres sin fecha registrada no tienen duración calculable.
      </p>
    </div>
  );
}
