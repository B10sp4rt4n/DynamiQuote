"use client";

import { useState } from "react";

import type { PackageDetail, PackageSummary } from "@/lib/db/packages";
import type { CreatePackageInput } from "@/lib/db/packages";

type PackagesShellProps = {
  initialPackages: PackageSummary[];
  tenantName: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        active ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"
      }`}
    >
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

function PackageLineRow({ line }: { line: PackageDetail["lines"][number] }) {
  return (
    <tr className="border-t border-zinc-100 text-xs">
      <td className="px-3 py-2 font-mono text-zinc-400">{line.sku ?? "—"}</td>
      <td className="px-3 py-2 text-zinc-700">{line.description}</td>
      <td className="px-3 py-2 text-right text-zinc-600">{line.quantity}</td>
      <td className="px-3 py-2 text-right text-zinc-600">
        ${line.costUnit.toFixed(2)}
      </td>
      <td className="px-3 py-2 text-right text-zinc-600">
        ${line.priceUnit.toFixed(2)}
      </td>
      <td className="px-3 py-2 text-right text-zinc-600">
        {line.marginPct !== null ? `${line.marginPct.toFixed(1)}%` : "—"}
      </td>
      <td className="px-3 py-2 text-zinc-400">{line.classification1 ?? "—"}</td>
      <td className="px-3 py-2 text-zinc-400">{line.classification2 ?? "—"}</td>
    </tr>
  );
}

function PackageDrawer({
  onClose,
  pkg,
}: {
  onClose: () => void;
  pkg: PackageDetail;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      {/* overlay */}
      <button
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        type="button"
      />
      {/* panel */}
      <aside className="relative ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-zinc-200 p-5">
          <div>
            <p className="text-xs font-mono text-zinc-400">{pkg.pkgNumber}</p>
            <h2 className="text-lg font-semibold text-zinc-900">{pkg.name}</h2>
            {pkg.description && <p className="mt-0.5 text-sm text-zinc-500">{pkg.description}</p>}
          </div>
          <button
            className="ml-4 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </header>
        <div className="overflow-auto p-5">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 pb-2 font-medium">SKU</th>
                <th className="px-3 pb-2 font-medium">Descripción</th>
                <th className="px-3 pb-2 text-right font-medium">Cantidad</th>
                <th className="px-3 pb-2 text-right font-medium">Costo</th>
                <th className="px-3 pb-2 text-right font-medium">Precio</th>
                <th className="px-3 pb-2 text-right font-medium">Margen</th>
                <th className="px-3 pb-2 font-medium">Clas. 1</th>
                <th className="px-3 pb-2 font-medium">Clas. 2</th>
              </tr>
            </thead>
            <tbody>
              {pkg.lines.map((l) => (
                <PackageLineRow key={l.lineId} line={l} />
              ))}
            </tbody>
          </table>
          {pkg.lines.length === 0 && (
            <p className="text-sm text-zinc-400">Este paquete no tiene líneas.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

export function PackagesShell({ initialPackages, tenantName }: PackagesShellProps) {
  const [packages, setPackages] = useState(initialPackages);
  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);
  const [pendingDetail, setPendingDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<{
    description: string;
    lines: Array<{ classification1: string; classification2: string; costUnit: string; description: string; marginPct: string; priceUnit: string; quantity: string; sku: string }>;
    name: string;
    playbookTag: string;
  }>({
    description: "",
    lines: [{ sku: "", description: "", quantity: "1", costUnit: "0", priceUnit: "0", marginPct: "", classification1: "product", classification2: "" }],
    name: "",
    playbookTag: "",
  });

  async function loadDetail(packageId: string) {
    setPendingDetail(packageId);
    setError(null);
    try {
      const res = await fetch(`/api/packages/${packageId}`);
      const data = (await res.json()) as { error?: string; package?: PackageDetail };
      if (!res.ok || !data.package) throw new Error(data.error ?? "Error al cargar paquete");
      setDetail(data.package);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setPendingDetail(null);
    }
  }

  async function toggleActive(packageId: string) {
    setPendingToggle(packageId);
    setError(null);
    try {
      const res = await fetch(`/api/packages/${packageId}`, {
        body: JSON.stringify({ action: "toggle" }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const data = (await res.json()) as { active?: boolean; error?: string };
      if (!res.ok || data.active === undefined) throw new Error(data.error ?? "Error");
      setPackages((prev) =>
        prev.map((p) => (p.packageId === packageId ? { ...p, active: data.active! } : p)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setPendingToggle(null);
    }
  }

  function addLine() {
    setCreateForm((f) => ({
      ...f,
      lines: [...f.lines, { sku: "", description: "", quantity: "1", costUnit: "0", priceUnit: "0", marginPct: "", classification1: "product", classification2: "" }],
    }));
  }

  function removeLine(index: number) {
    setCreateForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }));
  }

  function updateLineField(index: number, field: string, value: string) {
    setCreateForm((f) => {
      const lines = f.lines.map((l, i) => (i === index ? { ...l, [field]: value } : l));
      return { ...f, lines };
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const payload: CreatePackageInput = {
        name: createForm.name,
        description: createForm.description || undefined,
        playbookTag: createForm.playbookTag || undefined,
        lines: createForm.lines.map((l) => ({
          sku: l.sku || undefined,
          description: l.description,
          quantity: parseFloat(l.quantity) || 1,
          costUnit: parseFloat(l.costUnit) || 0,
          priceUnit: parseFloat(l.priceUnit) || 0,
          marginPct: l.marginPct ? parseFloat(l.marginPct) : undefined,
          classification1: l.classification1 || undefined,
          classification2: l.classification2 || undefined,
        })),
      };
      const res = await fetch("/api/packages", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await res.json()) as { error?: unknown; package?: PackageSummary & { lines: unknown[] } };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error al crear paquete");
      if (data.package) {
        const summary: PackageSummary = {
          active: data.package.active,
          createdAt: data.package.createdAt,
          description: data.package.description,
          lineCount: Array.isArray(data.package.lines) ? data.package.lines.length : 0,
          name: data.package.name,
          packageId: data.package.packageId,
          pkgNumber: data.package.pkgNumber,
          playbookTag: data.package.playbookTag,
        };
        setPackages((prev) => [summary, ...prev]);
      }
      setShowCreateForm(false);
      setCreateForm({ name: "", description: "", playbookTag: "", lines: [{ sku: "", description: "", quantity: "1", costUnit: "0", priceUnit: "0", marginPct: "", classification1: "product", classification2: "" }] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      {detail && <PackageDrawer onClose={() => setDetail(null)} pkg={detail} />}

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 border-b border-zinc-200 pb-4">
          <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">Tenant activo</p>
          <h1 className="text-2xl font-semibold text-zinc-900">Paquetes · {tenantName}</h1>
          <p className="text-sm text-zinc-500">
            Plantillas de líneas reutilizables. Al insertar en cotización las líneas se copian y son editables.
          </p>
        </div>

        {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            onClick={() => setShowCreateForm((v) => !v)}
            type="button"
          >
            {showCreateForm ? "Cancelar" : "+ Nuevo paquete"}
          </button>
        </div>

        {showCreateForm && (
          <form className="mt-4 rounded-xl border border-zinc-200 p-5 space-y-4" onSubmit={(e) => { void handleCreate(e); }}>
            <h2 className="text-base font-semibold text-zinc-900">Nuevo paquete</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-600" htmlFor="pkg-name">Nombre *</label>
                <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" id="pkg-name" required value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-600" htmlFor="pkg-tag">Tag / Playbook</label>
                <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" id="pkg-tag" placeholder="Ej. limpieza-industrial" value={createForm.playbookTag} onChange={(e) => setCreateForm((f) => ({ ...f, playbookTag: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-600" htmlFor="pkg-desc">Descripción</label>
                <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" id="pkg-desc" value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-700">Líneas ({createForm.lines.length})</p>
                <button className="text-xs text-emerald-700 hover:underline" onClick={addLine} type="button">+ Agregar línea</button>
              </div>
              <div className="space-y-2">
                {createForm.lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_3fr_1fr_1fr_1fr_1fr_auto] gap-2 items-end rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-xs">
                    <input className="rounded border border-zinc-300 px-2 py-1" placeholder="SKU" value={line.sku} onChange={(e) => updateLineField(i, "sku", e.target.value)} />
                    <input className="rounded border border-zinc-300 px-2 py-1" placeholder="Descripción *" required value={line.description} onChange={(e) => updateLineField(i, "description", e.target.value)} />
                    <input className="rounded border border-zinc-300 px-2 py-1" placeholder="Cantidad" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => updateLineField(i, "quantity", e.target.value)} />
                    <input className="rounded border border-zinc-300 px-2 py-1" placeholder="Costo" type="number" min="0" step="0.01" value={line.costUnit} onChange={(e) => updateLineField(i, "costUnit", e.target.value)} />
                    <input className="rounded border border-zinc-300 px-2 py-1" placeholder="Precio" type="number" min="0" step="0.01" value={line.priceUnit} onChange={(e) => updateLineField(i, "priceUnit", e.target.value)} />
                    <input className="rounded border border-zinc-300 px-2 py-1" placeholder="Margen%" type="number" min="-100" max="100" step="0.1" value={line.marginPct} onChange={(e) => updateLineField(i, "marginPct", e.target.value)} />
                    <button className="text-rose-500 hover:text-rose-700" disabled={createForm.lines.length === 1} onClick={() => removeLine(i)} type="button">✕</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={creating} type="submit">
                {creating ? "Creando..." : "Crear paquete"}
              </button>
            </div>
          </form>
        )}


        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-600">
              <tr>
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Tag</th>
                <th className="px-4 py-3 font-medium text-right">Líneas</th>
                <th className="px-4 py-3 font-medium">Creado</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {packages.map((pkg) => (
                <tr key={pkg.packageId} className={pkg.active ? "" : "opacity-50"}>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">{pkg.pkgNumber}</td>
                  <td className="px-4 py-3 font-medium text-zinc-900">{pkg.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{pkg.playbookTag ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-zinc-600">{pkg.lineCount}</td>
                  <td className="px-4 py-3 text-zinc-500">{formatDate(pkg.createdAt)}</td>
                  <td className="px-4 py-3">
                    <ActiveBadge active={pkg.active} />
                  </td>
                  <td className="flex gap-2 px-4 py-3">
                    <button
                      className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-200 disabled:cursor-not-allowed"
                      disabled={pendingDetail === pkg.packageId}
                      onClick={() => loadDetail(pkg.packageId)}
                      type="button"
                    >
                      {pendingDetail === pkg.packageId ? "..." : "Ver líneas"}
                    </button>
                    <button
                      className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-200 disabled:cursor-not-allowed"
                      disabled={pendingToggle === pkg.packageId}
                      onClick={() => toggleActive(pkg.packageId)}
                      type="button"
                    >
                      {pendingToggle === pkg.packageId
                        ? "..."
                        : pkg.active
                          ? "Desactivar"
                          : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {packages.length === 0 && (
          <p className="mt-4 text-sm text-zinc-500">No hay paquetes para este tenant.</p>
        )}
      </section>
    </>
  );
}
