"use client";

import { useState } from "react";
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

export function VendorComparisonPanel({ rows }: { rows: ComparisonRow[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(rows.map((row) => row.id)));

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

  const selectedRows = rows.filter((row) => selectedIds.has(row.id));
  const chartData = selectedRows.map((row) => ({
    approvedAmount: row.approvedAmount,
    fill: row.id === "overall" ? OVERALL_COLOR : VENDOR_COLOR,
    label: row.label,
  }));

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div>
        <h3 className="text-lg font-semibold text-zinc-900">Comparar desempeño por vendedor</h3>
        <p className="text-sm text-zinc-600">
          Marca o desmarca para comparar contra el total del tenant o entre vendedores.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {rows.map((row) => (
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
                tickFormatter={(value: number) => formatCompactCurrency(value)}
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
                formatter={(value, _name, _item, _index, _payload) => formatCurrency(Number(value))}
              />
              <Bar barSize={20} dataKey="approvedAmount" radius={[0, 4, 4, 0]}>
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
