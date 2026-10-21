"use client";

import { useState } from "react";
import { summarizeQuoteMonths, type MonthlyQuoteKpi } from "@/lib/domain/quote-kpis";

const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const money = (value: number) => new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", maximumFractionDigits: 2,
}).format(value);

export function MonthlyQuoteKpis({ months, currentYear, currentMonth, undatedQuoteCount }: {
  months: MonthlyQuoteKpi[];
  currentYear: string;
  currentMonth: number;
  undatedQuoteCount: number;
}) {
  const years = Array.from(new Set([currentYear, ...months.map((row) => row.month.slice(0, 4))])).sort().reverse();
  const [year, setYear] = useState(currentYear);
  const rows = monthNames.map((label, index) => ({
    label,
    ...(months.find((row) => row.month === `${year}-${String(index + 1).padStart(2, "0")}`) ?? {
      month: `${year}-${String(index + 1).padStart(2, "0")}`,
      revenue: 0, grossProfit: 0, quoteCount: 0, missingMarginCount: 0,
    }),
  }));
  const totals = summarizeQuoteMonths(rows);
  const maxValue = Math.max(0, ...rows.flatMap((row) => [row.revenue, row.grossProfit]));
  const minValue = Math.min(0, ...rows.flatMap((row) => [row.revenue, row.grossProfit]));
  const range = maxValue - minValue || 1;
  const baseline = (maxValue / range) * 100;
  const elapsedMonths = year === currentYear
    ? currentMonth
    : 12;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Revenue y margen por mes</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Montos cotizados en MXN, antes de IVA. Una sola versión por cotización: la más reciente,
            en el mes de creación original. Margen bruto = revenue menos costo.
            Incluye todos los estados; no representa facturación ni cobranza.
          </p>
        </div>
        <label className="text-sm text-zinc-600">
          Año
          <select className="ml-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900" value={year} onChange={(event) => setYear(event.target.value)}>
            {years.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Revenue total", money(totals.revenue)],
          [totals.missingMarginCount ? "Margen conocido (parcial)" : "Margen en pesos", money(totals.grossProfit)],
          ["Margen sobre revenue", totals.marginPct === null ? "Sin datos completos" : `${totals.marginPct.toFixed(2)}%`],
          ["Revenue promedio mensual", money(totals.revenue / elapsedMonths)],
        ].map(([label, value]) => (
          <div className="rounded-lg bg-zinc-50 p-4" key={label}>
            <dt className="text-sm text-zinc-500">{label}</dt>
            <dd className="mt-2 text-xl font-semibold text-zinc-900">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-zinc-500">Promedio: {elapsedMonths} meses{year === currentYear ? " transcurridos, incluido el actual" : " del año"}, incluidos meses sin cotizaciones.</p>
      {totals.missingMarginCount > 0 && <p className="mt-3 text-sm text-amber-800">Hay {totals.missingMarginCount} cotizaciones sin información completa para calcular el margen. El monto de margen es parcial.</p>}
      {undatedQuoteCount > 0 && <p className="mt-3 text-sm text-amber-800">{undatedQuoteCount} cotizaciones sin fecha aparecen en el acumulado general, pero no en la distribución mensual.</p>}

      <div className="mt-6 flex flex-wrap gap-5 text-sm text-zinc-600">
        <span><span className="mr-2 inline-block h-3 w-3 rounded-sm bg-blue-600" />Revenue</span>
        <span><span className="mr-2 inline-block h-3 w-3 rounded-sm bg-emerald-600" />Margen en pesos (rojo si es negativo)</span>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Escala compartida: {money(minValue)} a {money(maxValue)}. La línea horizontal marca cero.</p>
      {totals.quoteCount === 0 && <p className="mt-4 text-sm text-zinc-500">Sin cotizaciones en {year}.</p>}
      <div className="mt-4 overflow-x-auto">
        <svg aria-label={`Revenue y margen mensual de ${year}. Consulta los montos en la tabla de abajo.`} role="img" className="h-72 w-full min-w-[720px]" viewBox="0 0 960 280">
          <line x1="10" x2="950" y1={20 + baseline * 2.1} y2={20 + baseline * 2.1} stroke="#a1a1aa" />
          {rows.map((row, index) => (
            <g key={row.month}>
              {[row.revenue, row.grossProfit].map((value, series) => (
                <rect key={series} x={index * 80 + 18 + series * 25} y={20 + (value >= 0 ? baseline - value / range * 100 : baseline) * 2.1}
                  width="22" height={Math.abs(value) / range * 210} rx="2"
                  fill={series === 0 ? "#2563eb" : value < 0 ? "#dc2626" : "#059669"}>
                  <title>{`${row.label}: ${series === 0 ? "Revenue" : "Margen"} ${money(value)}${series === 1 && row.missingMarginCount ? " (parcial)" : ""}`}</title>
                </rect>
              ))}
              <text x={index * 80 + 40} y="263" textAnchor="middle" fontSize="13" fill="#52525b">{row.label}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-right text-sm">
          <caption className="mb-3 text-left text-sm text-zinc-500">Detalle mensual · {year} · MXN</caption>
          <thead className="border-b border-zinc-200 text-zinc-500"><tr><th className="py-2 text-left" scope="col">Mes</th><th scope="col">Revenue</th><th scope="col">Margen $</th><th scope="col">Margen %</th><th scope="col">Cotizaciones</th></tr></thead>
          <tbody>{rows.map((row) => {
            const pct = summarizeQuoteMonths([row]).marginPct;
            return <tr className="border-b border-zinc-100" key={row.month}>
              <th className="py-2 text-left font-normal" scope="row">{row.label}</th>
              <td>{money(row.revenue)}</td>
              <td className={row.grossProfit < 0 ? "text-red-700" : ""}>{money(row.grossProfit)}{row.missingMarginCount > 0 ? " (parcial)" : ""}</td>
              <td>{pct === null ? "—" : `${pct.toFixed(2)}%`}</td><td>{row.quoteCount}</td>
            </tr>;
          })}</tbody>
          <tfoot className="font-semibold"><tr><th className="py-3 text-left" scope="row">Total</th><td>{money(totals.revenue)}</td><td>{money(totals.grossProfit)}{totals.missingMarginCount ? " (parcial)" : ""}</td><td>{totals.marginPct === null ? "—" : `${totals.marginPct.toFixed(2)}%`}</td><td>{totals.quoteCount}</td></tr></tfoot>
        </table>
      </div>
    </section>
  );
}
