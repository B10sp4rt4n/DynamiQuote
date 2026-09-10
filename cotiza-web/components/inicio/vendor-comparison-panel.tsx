"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ComparisonRow = {
  approvedAmount: number;
  approvedCount: number;
  conversionRatePct: number;
  id: string;
  label: string;
  proposedAmount: number;
  totalCount: number;
};

type MetricKey = "approvedAmount" | "conversionRatePct" | "proposedAmount" | "totalCount";

const OVERALL_COLOR = "#18181b";
const VENDOR_COLOR = "#2a78d6";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    currency: "MXN",
    maximumFractionDigits: 0,
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

function formatCount(value: number): string {
  return String(Math.round(value));
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

const METRICS: Record<
  MetricKey,
  { formatAxis: (value: number) => string; formatValue: (value: number) => string; label: string }
> = {
  approvedAmount: { formatAxis: formatCompactCurrency, formatValue: formatCurrency, label: "Monto aprobado" },
  conversionRatePct: { formatAxis: formatPct, formatValue: formatPct, label: "Tasa de conversión" },
  proposedAmount: { formatAxis: formatCompactCurrency, formatValue: formatCurrency, label: "Monto propuesto" },
  totalCount: { formatAxis: formatCount, formatValue: formatCount, label: "Propuestas totales" },
};

export function VendorComparisonPanel({ rows }: { rows: ComparisonRow[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(rows.map((row) => row.id)));
  const [searchQuery, setSearchQuery] = useState("");
  const [metric, setMetric] = useState<MetricKey>("approvedAmount");

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const visibleCheckboxRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length === 0) {
      return rows;
    }
    return rows.filter((row) => row.id === "overall" || row.label.toLowerCase().includes(q));
  }, [rows, searchQuery]);

  const selectedRows = rows.filter((row) => selectedIds.has(row.id));
  const activeMetric = METRICS[metric];
  const chartData = selectedRows.map((row) => ({
    fill: row.id === "overall" ? OVERALL_COLOR : VENDOR_COLOR,
    label: row.label,
    value: row[metric],
  }));

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900">Comparar desempeño por vendedor</h3>
          <p className="text-sm text-zinc-600">
            Marca o desmarca para comparar contra el total del tenant o entre vendedores.
          </p>
        </div>
        <label className="text-sm text-zinc-700">
          Graficar
          <select
            className="ml-2 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
            onChange={(event) => setMetric(event.target.value as MetricKey)}
            value={metric}
          >
            {Object.entries(METRICS).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <input
        className="mt-4 w-full max-w-xs rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-400"
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Buscar vendedor..."
        type="search"
        value={searchQuery}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {visibleCheckboxRows.map((row) => (
          <label
            className="flex items-center gap-2 rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700"
            key={row.id}
          >
            <input
              checked={selectedIds.has(row.id)}
              onChange={() => toggleRow(row.id)}
              type="checkbox"
            />
            {row.label}
          </label>
        ))}
        {visibleCheckboxRows.length === 0 ? (
          <p className="text-sm text-zinc-500">Ningún vendedor coincide con la búsqueda.</p>
        ) : null}
      </div>

      <div className="mt-4">
        {chartData.length === 0 ? (
          <div className="flex h-[160px] items-center justify-center rounded-lg border border-dashed border-zinc-200 text-sm text-zinc-500">
            Selecciona al menos uno para comparar.
          </div>
        ) : (
          <ResponsiveContainer height={Math.max(160, chartData.length * 44)} width="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid horizontal={false} stroke="#e4e4e7" />
              <XAxis
                axisLine={{ stroke: "#e4e4e7" }}
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickFormatter={(value: number) => activeMetric.formatAxis(value)}
                tickLine={false}
                type="number"
              />
              <YAxis
                axisLine={false}
                dataKey="label"
                tick={{ fill: "#3f3f46", fontSize: 12 }}
                tickLine={false}
                type="category"
                width={140}
              />
              <Tooltip
                cursor={{ fill: "#fafafa" }}
                formatter={(value, _name, _item, _index, _payload) => activeMetric.formatValue(Number(value))}
              />
              <Bar barSize={20} dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((entry) => (
                  <Cell fill={entry.fill} key={entry.label} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {selectedRows.length > 0 ? (
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
              {selectedRows.map((row) => (
                <tr key={row.id}>
                  <td className="py-2 pr-4 text-zinc-900">{row.label}</td>
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
    </section>
  );
}
