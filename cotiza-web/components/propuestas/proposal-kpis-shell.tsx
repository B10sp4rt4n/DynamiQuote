"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DownloadKpiReportButton } from "@/components/propuestas/download-kpi-report-button";

import { fillProposalFinancialMonths, summarizeProposalFinancials } from "@/lib/domain/proposal-financial-kpis";

import type {
  ProposalAmountTimelinePoint,
  ProposalKpiSummary,
  ProposalMarginTimelinePoint,
  ProposalOutcomeTimelinePoint,
  ProposalStatusTimelinePoint,
  SalesRepRankingRow,
} from "@/lib/db/proposal-kpis";

type ProposalKpisShellProps = {
  canSeeAll: boolean;
  marginTimeline: ProposalMarginTimelinePoint[];
  outcomeTimeline: ProposalOutcomeTimelinePoint[];
  ranking: SalesRepRankingRow[];
  statusTimeline: ProposalStatusTimelinePoint[];
  summary: ProposalKpiSummary;
  tenantName: string;
};

// Paleta categorica validada (ver skill de dataviz): orden fijo, pasa
// separacion CVD y contraste en modo claro para los 6 estatus del ciclo de
// vida de una propuesta. No reordenar sin volver a correr el validador.
const STATUS_COLORS = {
  draft: "#2a78d6",
  sent: "#eb6834",
  inReview: "#1baf7a",
  expired: "#eda100",
  approved: "#008300",
  rejected: "#e34948",
} as const;

const STATUS_LABELS: Record<keyof typeof STATUS_COLORS, string> = {
  draft: "Borrador",
  sent: "Enviada",
  inReview: "En revisión",
  expired: "Vencida",
  approved: "Aprobada",
  rejected: "Rechazada",
};

const AMOUNT_COLORS = {
  proposed: "#2a78d6",
  approved: "#008300",
} as const;

// Paleta de estado fija (nunca tematizada, ver skill dataviz) -- ganado y
// perdido son desenlaces de estado, no categorias arbitrarias, por eso usan
// good/critical en vez de la paleta categorica de arriba. Mismos hex que la
// barra de tasa de cierre del Pipeline (components/pipeline/pipeline-dashboard.tsx).
const OUTCOME_COLORS = {
  won: "#0ca30c",
  lost: "#d03b3b",
} as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    currency: "MXN",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    currency: "MXN",
    maximumFractionDigits: 1,
    notation: "compact",
    style: "currency",
  }).format(value);
}

// date_trunc('month', ...) en Postgres entrega el 1 del mes a medianoche UTC
// -- sin fijar timeZone: "UTC" aqui, cualquier visitante en un huso detras de
// UTC (México entero, UTC-6) lo ve como las 6pm del ULTIMO DIA DEL MES
// ANTERIOR y la etiqueta sale corrida un mes hacia atras (sep -> "ago").
// Afectaba a las tres graficas de esta pagina por igual. Detectado
// 2026-10-01: "llega a agosto, y septiembre ya se termino" -- septiembre si
// tenia datos, solo salia etiquetado como agosto.
function formatPeriodLabel(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: "UTC", year: "2-digit" }).format(new Date(iso));
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="flex min-h-[104px] flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-zinc-900">{value}</p>
    </article>
  );
}

function StatusTimelineChart({ data }: { data: ProposalStatusTimelinePoint[] }) {
  if (data.length === 0) {
    return <EmptyChartState />;
  }

  const chartData = data.map((point) => ({
    ...point,
    periodLabel: formatPeriodLabel(point.period),
  }));

  return (
    <ResponsiveContainer height={280} width="100%">
      <BarChart barCategoryGap={12} data={chartData}>
        <CartesianGrid stroke="#e4e4e7" vertical={false} />
        <XAxis dataKey="periodLabel" tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e4e4e7" }} />
        <YAxis allowDecimals={false} tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: "#fafafa" }} />
        <Legend
          formatter={(value: string) => STATUS_LABELS[value as keyof typeof STATUS_COLORS] ?? value}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Bar barSize={24} dataKey="draft" fill={STATUS_COLORS.draft} name="draft" stackId="status" />
        <Bar barSize={24} dataKey="sent" fill={STATUS_COLORS.sent} name="sent" stackId="status" />
        <Bar barSize={24} dataKey="inReview" fill={STATUS_COLORS.inReview} name="inReview" stackId="status" />
        <Bar barSize={24} dataKey="expired" fill={STATUS_COLORS.expired} name="expired" stackId="status" />
        <Bar barSize={24} dataKey="approved" fill={STATUS_COLORS.approved} name="approved" stackId="status" />
        <Bar
          barSize={24}
          dataKey="rejected"
          fill={STATUS_COLORS.rejected}
          name="rejected"
          radius={[4, 4, 0, 0]}
          stackId="status"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function AmountTimelineChart({ data }: { data: ProposalAmountTimelinePoint[] }) {
  if (data.length === 0) {
    return <EmptyChartState />;
  }

  const chartData = data.map((point) => ({
    ...point,
    periodLabel: formatPeriodLabel(point.period),
  }));

  return (
    <ResponsiveContainer height={280} width="100%">
      <BarChart data={chartData} barCategoryGap="22%">
        <CartesianGrid stroke="#e4e4e7" vertical={false} />
        <XAxis dataKey="periodLabel" tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e4e4e7" }} />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickFormatter={(value: number) => formatCompactCurrency(value)}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="proposedAmount" fill={AMOUNT_COLORS.proposed} name="Monto propuesto" radius={[4, 4, 0, 0]} />
        <Bar dataKey="approvedAmount" fill={AMOUNT_COLORS.approved} name="Monto aprobado" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

type FinancialChartPoint = {
  periodLabel: string;
  wonAmount: number;
  wonProfit: number;
  wonMarginPct: number;
};

type OutcomeChartPoint = {
  periodLabel: string;
  wonAmount: number;
  lostAmount: number;
};

function UndatedChartNote({ visible }: { visible: boolean }) {
  return visible ? <p className="mt-1 text-xs text-zinc-600">
    «Sin fecha» reúne cierres históricos sin fecha registrada; no corresponde a un mes.
  </p> : null;
}

// Columnas y tendencia en porcentaje comparten el margen ponderado del periodo.
function MarginTimelineChart({ data, averageMarginPct, trend = false }: {
  data: FinancialChartPoint[];
  averageMarginPct: number | null;
  trend?: boolean;
}) {
  if (data.length === 0) {
    return <EmptyChartState />;
  }

  const chartData = data.map((point) => ({
    ...point,
    wonMarginPct: point.wonAmount !== 0 ? point.wonMarginPct : null,
  }));
  const Chart = trend ? LineChart : BarChart;

  return (
    <>
      {averageMarginPct !== null ? (
        <p className="mb-2 flex items-center gap-2 text-xs text-zinc-600">
          <span aria-hidden="true" className="inline-block w-6 border-t-2 border-dashed border-zinc-700" />
          Promedio ponderado del periodo: {formatPercent(averageMarginPct)}
        </p>
      ) : null}
      <ResponsiveContainer height={280} width="100%">
        <Chart data={chartData}>
          <CartesianGrid stroke="#e4e4e7" vertical={false} />
          <XAxis axisLine={{ stroke: "#e4e4e7" }} dataKey="periodLabel" tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} />
          <YAxis
            axisLine={false}
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickFormatter={(value: number) => formatPercent(value)}
            tickLine={false}
          />
          <Tooltip formatter={(value) => formatPercent(Number(value))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {averageMarginPct !== null ? (
            <ReferenceLine y={averageMarginPct} stroke="#3f3f46" strokeDasharray="6 4" strokeWidth={2} ifOverflow="extendDomain" />
          ) : null}
          {trend ? (
            <Line type="linear" dataKey="wonMarginPct" name="Margen mensual de ganadas" stroke={OUTCOME_COLORS.won} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false} />
          ) : (
            <Bar dataKey="wonMarginPct" name="Margen de propuestas ganadas" fill={OUTCOME_COLORS.won} radius={[4, 4, 0, 0]} />
          )}
        </Chart>
      </ResponsiveContainer>
    </>
  );
}

// Utilidad ($) por mes -- precio menos costo, mismo corte proposed/approved
// que las demas graficas de monto de esta pagina.
function WonTimelineChart({ data, metric }: { data: FinancialChartPoint[]; metric: "wonAmount" | "wonProfit" }) {
  if (data.length === 0) {
    return <EmptyChartState />;
  }

  return (
    <ResponsiveContainer height={280} width="100%">
      <BarChart data={data} barCategoryGap="22%">
        <CartesianGrid stroke="#e4e4e7" vertical={false} />
        <XAxis axisLine={{ stroke: "#e4e4e7" }} dataKey="periodLabel" tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} />
        <YAxis
          axisLine={false}
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickFormatter={(value: number) => formatCompactCurrency(value)}
          tickLine={false}
        />
        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey={metric} fill={OUTCOME_COLORS.won} name={metric === "wonAmount" ? "Revenue de ganadas" : "Margen de ganadas"} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function OutcomeTimelineChart({ data }: { data: OutcomeChartPoint[] }) {
  if (data.length === 0) {
    return <EmptyChartState />;
  }

  return (
    <ResponsiveContainer height={280} width="100%">
      <BarChart data={data}>
        <CartesianGrid stroke="#e4e4e7" vertical={false} />
        <XAxis axisLine={{ stroke: "#e4e4e7" }} dataKey="periodLabel" tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} />
        <YAxis
          axisLine={false}
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickFormatter={(value: number) => formatCompactCurrency(value)}
          tickLine={false}
        />
        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="wonAmount"
          name="Ganado"
          fill={OUTCOME_COLORS.won}
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="lostAmount"
          name="Perdido"
          fill={OUTCOME_COLORS.lost}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RankingChart({ data }: { data: SalesRepRankingRow[] }) {
  if (data.length === 0) {
    return <EmptyChartState />;
  }

  const chartData = data
    .slice(0, 10)
    .map((row) => ({ approvedAmount: row.approvedAmount, name: row.displayName }));

  return (
    <ResponsiveContainer height={Math.max(200, chartData.length * 40)} width="100%">
      <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid horizontal={false} stroke="#e4e4e7" />
        <XAxis
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickFormatter={(value: number) => formatCompactCurrency(value)}
          tickLine={false}
          axisLine={{ stroke: "#e4e4e7" }}
          type="number"
        />
        <YAxis
          dataKey="name"
          tick={{ fill: "#3f3f46", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          type="category"
          width={140}
        />
        <Tooltip
          cursor={{ fill: "#fafafa" }}
          formatter={(value) => formatCurrency(Number(value))}
        />
        <Bar barSize={20} dataKey="approvedAmount" fill={AMOUNT_COLORS.proposed} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChartState() {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-zinc-200 text-sm text-zinc-500">
      Todavía no hay datos suficientes para esta gráfica.
    </div>
  );
}

export function ProposalKpisShell({
  canSeeAll,
  marginTimeline,
  outcomeTimeline,
  ranking,
  statusTimeline,
  summary,
  tenantName,
}: ProposalKpisShellProps) {
  const financialTimeline = fillProposalFinancialMonths(marginTimeline);
  const financialSummary = summarizeProposalFinancials(financialTimeline);
  const financialChartData: FinancialChartPoint[] = financialTimeline.map((point) => ({
    ...point, periodLabel: formatPeriodLabel(point.period),
  }));
  if (summary.undatedWonCount > 0) {
    financialChartData.push({
      periodLabel: "Sin fecha", wonAmount: summary.undatedWonAmount,
      wonProfit: summary.undatedWonProfit,
      wonMarginPct: summary.undatedWonAmount !== 0 ? summary.undatedWonProfit / summary.undatedWonAmount * 100 : 0,
    });
  }
  const outcomeChartData: OutcomeChartPoint[] = outcomeTimeline.map((point) => ({
    ...point, periodLabel: formatPeriodLabel(point.period),
  }));
  if (summary.undatedOutcomeCount > 0) {
    outcomeChartData.push({ periodLabel: "Sin fecha", wonAmount: summary.undatedWonAmount, lostAmount: summary.undatedLostAmount });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-zinc-200 pb-4">
        <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">Tenant activo</p>
        <h1 className="text-2xl font-semibold text-zinc-900">
          {canSeeAll ? `KPIs del equipo — ${tenantName}` : `Mi desempeño — ${tenantName}`}
        </h1>
        <p className="text-zinc-600">
          {canSeeAll
            ? "Propuestas de todo el tenant, con desglose por vendedor."
            : "Propuestas creadas por ti."}
        </p>
      </div>

      <DownloadKpiReportButton />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Total de propuestas" value={String(summary.totalCount)} />
        <StatTile label="Tasa de aprobación" value={`${summary.conversionRatePct.toFixed(1)}%`} />
        <StatTile label="Margen de ganadas (histórico)" value={summary.wonAmount !== 0 ? formatPercent(summary.wonProfit / summary.wonAmount * 100) : "Sin revenue"} />
        <StatTile label="Revenue ganado (histórico)" value={formatCurrency(summary.wonAmount)} />
        <StatTile label="Monto propuesto" value={formatCompactCurrency(summary.proposedAmount)} />
        <StatTile label="Monto aprobado" value={formatCompactCurrency(summary.approvedAmount)} />
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Pendientes de acción (borrador, enviada o en revisión): {summary.pendingActionCount}
      </p>

      {summary.legacyCreationOutcomeCount > 0 ? (
        <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Histórico por fecha de creación">
          <h2 className="text-base font-semibold text-zinc-900">Histórico por fecha de creación</h2>
          <p className="mt-1 text-sm text-zinc-700">
            {summary.legacyCreationOutcomeCount} propuestas ganadas o perdidas existentes se agrupan por su fecha de creación.
            Revenue ganado incluido con esta referencia: {formatCurrency(summary.legacyCreationWonAmount)}.
            Desde el 21 de octubre de 2026, las nuevas decisiones se agrupan por su fecha real de cierre y conservan su fecha de creación.
          </p>
        </section>
      ) : null}

      {summary.undatedOutcomeCount > 0 ? (
        <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="Cierres históricos sin fecha">
          <h2 className="text-base font-semibold text-zinc-900">Ganadas y perdidas sin fecha de cierre</h2>
          <p className="mt-1 text-sm text-zinc-700">
            Ganadas: {summary.undatedWonCount}. Perdidas: {summary.undatedLostCount}. Siguen incluidas en el histórico.
            Se muestran como «Sin fecha» en las gráficas y la tabla; no se les asigna un mes ni se incluyen en el promedio mensual.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <StatTile label="Revenue ganado sin fecha" value={formatCurrency(summary.undatedWonAmount)} />
            <StatTile label="Utilidad de ganadas sin fecha" value={formatCurrency(summary.undatedWonProfit)} />
            <StatTile label="Monto perdido sin fecha" value={formatCurrency(summary.undatedLostAmount)} />
          </div>
          <a className="mt-3 inline-block text-sm font-medium text-blue-700 underline" href="/pipeline">Ver oportunidades ganadas y perdidas en Pipeline</a>
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4" aria-label="Resumen financiero del periodo">
        <h2 className="text-base font-semibold text-zinc-900">Revenue y margen del periodo</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {financialTimeline.length > 0
            ? `${formatPeriodLabel(financialTimeline[0].period)} a ${formatPeriodLabel(financialTimeline[financialTimeline.length - 1].period)} · ${financialTimeline.length} meses mostrados.`
            : "Sin propuestas en el periodo mostrado."}
          {" "}Revenue suma únicamente propuestas marcadas como ganadas. El margen resta solo sus costos.
          Nuevos cierres por mes de decisión; histórico etiquetado por mes de creación. Horario de Ciudad de México.
          Montos en MXN antes de IVA; no equivalen a cobros recibidos.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Revenue ganado del periodo" value={formatCurrency(financialSummary.revenue)} />
          <StatTile label="Margen de ganadas en pesos" value={formatCurrency(financialSummary.profit)} />
          <StatTile label="Margen ponderado de ganadas" value={financialSummary.marginPct === null ? "Sin revenue" : formatPercent(financialSummary.marginPct)} />
          <StatTile label="Revenue promedio mensual" value={formatCurrency(financialSummary.averageMonthlyRevenue)} />
        </div>
        <p className="mt-2 text-xs text-zinc-500">Incluye los cierres fechados y el histórico por creación; excluye el grupo «Sin fecha». El promedio incluye los meses intermedios sin propuestas.</p>
        <details className="mt-4 text-sm text-zinc-700">
          <summary className="cursor-pointer font-medium">Ver montos mensuales</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[640px] w-full text-right text-sm">
              <caption className="sr-only">Revenue y margen de propuestas ganadas en MXN antes de IVA</caption>
              <thead className="border-b border-zinc-200"><tr><th scope="col" className="py-2 pr-4 text-left">Mes</th><th scope="col" className="px-3">Revenue ganado</th><th scope="col" className="px-3">Margen de ganadas</th><th scope="col" className="px-3">Monto propuesto</th><th scope="col" className="pl-3">Monto aprobado</th></tr></thead>
              <tbody>{financialTimeline.map((point) => <tr className="border-b border-zinc-200" key={point.period}>
                <th scope="row" className="py-2 pr-4 text-left font-normal">{formatPeriodLabel(point.period)}</th>
                <td className="px-3">{formatCurrency(point.wonAmount)}</td><td className="px-3">{formatCurrency(point.wonProfit)}</td><td className="px-3">{formatCurrency(point.proposedAmount)}</td><td className="pl-3">{formatCurrency(point.approvedAmount)}</td>
              </tr>)}</tbody>
              <tfoot>
                <tr className="font-semibold"><th scope="row" className="py-2 pr-4 text-left">Total del periodo</th><td className="px-3">{formatCurrency(financialSummary.revenue)}</td><td className="px-3">{formatCurrency(financialSummary.profit)}</td><td className="px-3">{formatCurrency(financialTimeline.reduce((sum, point) => sum + point.proposedAmount, 0))}</td><td className="pl-3">{formatCurrency(financialSummary.approvedRevenue)}</td></tr>
                {summary.undatedWonCount > 0 ? <tr className="bg-amber-50"><th scope="row" className="py-2 pr-4 text-left">Sin fecha de cierre (histórico)</th><td className="px-3">{formatCurrency(summary.undatedWonAmount)}</td><td className="px-3">{formatCurrency(summary.undatedWonProfit)}</td><td className="px-3">—</td><td className="pl-3">—</td></tr> : null}
              </tfoot>
            </table>
          </div>
        </details>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">Propuestas por estatus (por mes)</p>
          <div className="mt-3">
            <StatusTimelineChart data={statusTimeline} />
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">Revenue ganado por mes</p>
          {summary.legacyCreationOutcomeCount > 0 ? <p className="mt-1 text-xs text-zinc-600">Histórico por creación; nuevos cierres por fecha de decisión.</p> : null}
          <UndatedChartNote visible={summary.undatedWonCount > 0} />
          <div className="mt-3">
            <WonTimelineChart data={financialChartData} metric="wonAmount" />
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">Ganado vs. perdido (por mes)</p>
          <p className="mt-1 text-xs text-zinc-500">
            Histórico por creación; nuevos cierres por fecha de decisión. Horario de Ciudad de México. Excluye descartadas.
          </p>
          <UndatedChartNote visible={summary.undatedOutcomeCount > 0} />
          <div className="mt-3">
            <OutcomeTimelineChart data={outcomeChartData} />
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">Margen de ganadas por mes (%)</p>
          <UndatedChartNote visible={summary.undatedWonCount > 0} />
          <div className="mt-3">
            <MarginTimelineChart data={financialChartData} averageMarginPct={financialSummary.marginPct} />
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">Tendencia del margen mes a mes (%)</p>
          <p className="mt-1 text-xs text-zinc-500">
            La línea punteada muestra el promedio ponderado: utilidad total / revenue ganado del periodo.
            Los meses sin revenue quedan sin punto; «Sin fecha» se excluye de la tendencia y del promedio.
          </p>
          <div className="mt-3">
            <MarginTimelineChart
              data={financialTimeline.map((point) => ({ ...point, periodLabel: formatPeriodLabel(point.period) }))}
              averageMarginPct={financialSummary.marginPct}
              trend
            />
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">Margen de ganadas en pesos por mes</p>
          <UndatedChartNote visible={summary.undatedWonCount > 0} />
          <div className="mt-3">
            <WonTimelineChart data={financialChartData} metric="wonProfit" />
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">Montos propuestos y aprobados por mes</p>
          <p className="mt-1 text-xs text-zinc-500">Por mes de creación de la propuesta. Estos montos no son revenue ganado.</p>
          <div className="mt-3"><AmountTimelineChart data={financialTimeline} /></div>
        </div>
      </div>

      {canSeeAll ? (
        <div className="mt-8 rounded-xl border border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">Ranking por vendedor (monto aprobado)</p>
          <p className="mt-1 text-xs text-zinc-500">
            Solo incluye propuestas con creador identificado (desde agosto 2026) — las anteriores no
            tienen ese dato guardado y no se le atribuyen a nadie.
          </p>
          <div className="mt-3">
            <RankingChart data={ranking} />
          </div>
          {ranking.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="text-left text-zinc-600">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Vendedor</th>
                    <th className="py-2 pr-4 font-medium">Propuestas</th>
                    <th className="py-2 pr-4 font-medium">Aprobadas</th>
                    <th className="py-2 pr-4 font-medium">Tasa de conversión</th>
                    <th className="py-2 pr-4 font-medium">Monto propuesto</th>
                    <th className="py-2 font-medium">Monto aprobado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {ranking.map((row) => (
                    <tr key={row.userId}>
                      <td className="py-2 pr-4 text-zinc-900">{row.displayName}</td>
                      <td className="py-2 pr-4 text-zinc-600">{row.totalCount}</td>
                      <td className="py-2 pr-4 text-zinc-600">{row.approvedCount}</td>
                      <td className="py-2 pr-4 text-zinc-600">{row.conversionRatePct.toFixed(1)}%</td>
                      <td className="py-2 pr-4 text-zinc-600">{formatCurrency(row.proposedAmount)}</td>
                      <td className="py-2 text-zinc-600">{formatCurrency(row.approvedAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
