"use client";
import { useEffect, useRef, useState } from "react";
import type { PackageDetail, PackageSummary } from "@/lib/db/packages";
import { normalizeQuoteInput } from "@/lib/domain/quote-input";

export type TemplateApplication = {
  operationId: string; expectedRevision: string;
  quantities: Array<{ lineId: string; quantity: number }>;
};

export function TemplatePickerModal({ onClose, onInsert }: {
  onClose: () => void;
  onInsert: (packageId: string, input: TemplateApplication) => Promise<void>;
}) {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/packages", { signal: controller.signal })
      .then(async (r) => { if (!r.ok) throw new Error("No se pudieron cargar las plantillas"); return r.json(); })
      .then((data: { packages: PackageSummary[] }) => setPackages(data.packages.filter((p) => p.active)))
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function choose(packageId: string) {
    setPending(true); setError(null);
    try {
      const r = await fetch(`/api/packages/${packageId}`);
      const data = await r.json() as { package?: PackageDetail; error?: string };
      if (!r.ok || !data.package) throw new Error(data.error ?? "No se pudo abrir la plantilla");
      setDetail(data.package);
      setQuantities(Object.fromEntries(data.package.lines.map((l) => [l.lineId, String(l.quantity)])));
      operationId.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : "Error al cargar"); }
    finally { setPending(false); }
  }

  const preview = (() => {
    if (!detail) return null;
    try { return normalizeQuoteInput(detail.lines.map((l) => ({
      sku: l.sku ?? "", description: l.description, quantity: Number(quantities[l.lineId]),
      costUnit: l.costUnit, priceUnit: l.priceUnit,
      lineType: l.classification1 === "service" ? "service" : "product", serviceOrigin: l.classification2 ?? "",
    }))); } catch { return null; }
  })();

  async function apply() {
    if (!detail || !preview || pending) return;
    setPending(true); setError(null);
    operationId.current ??= crypto.randomUUID();
    try {
      await onInsert(detail.packageId, { operationId: operationId.current, expectedRevision: detail.revision,
        quantities: detail.lines.map((l) => ({ lineId: l.lineId, quantity: Number(quantities[l.lineId]) })) });
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo aplicar. Puedes reintentar."); }
    finally { setPending(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
    <button aria-label="Cerrar plantillas" className="absolute inset-0 bg-black/30" disabled={pending} onClick={onClose} type="button" />
    <section aria-labelledby="template-picker-title" aria-modal="true" role="dialog" className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-lg font-semibold text-zinc-900" id="template-picker-title">{detail ? detail.name : "Elegir plantilla"}</h3>
        <button className="min-h-10 px-3 text-sm text-zinc-600" disabled={pending} onClick={onClose} type="button">Cerrar</button>
      </div>
      {error ? <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p> : null}
      {loading ? <p className="py-4 text-sm text-zinc-500">Cargando plantillas...</p> : null}
      {detail ? <>
        <p className="mt-2 text-sm text-zinc-600">Ajusta la cantidad de cada partida. Se agregarán en una nueva versión en borrador.</p>
        <p className="mt-2 text-xs text-zinc-500">Se usan los costos y precios guardados. Revisa su vigencia y la moneda antes de emitir la propuesta.</p>
        <div className="mt-4 space-y-3">
          {detail.lines.map((l, i) => <div className="rounded-lg border border-zinc-200 p-3" key={l.lineId}>
            <p className="text-sm font-medium text-zinc-900">{l.description}</p>
            <p className="text-xs text-zinc-500">{l.sku || "Sin SKU"} · Costo unitario: {l.costUnit.toFixed(2)} · Precio unitario: {l.priceUnit.toFixed(2)}</p>
            <label className="mt-2 flex items-center gap-3 text-sm text-zinc-700" htmlFor={`template-quantity-${i}`}>
              Cantidad
              <input className="min-h-10 w-28 rounded-lg border border-zinc-300 px-3" disabled={pending} id={`template-quantity-${i}`} min="1" step="1" type="number"
                value={quantities[l.lineId] ?? ""} onChange={(e) => { setQuantities((v) => ({ ...v, [l.lineId]: e.target.value })); operationId.current = null; }} />
            </label>
          </div>)}
        </div>
        <p className="mt-4 text-sm font-medium text-zinc-800">{preview
          ? `Partidas a agregar: ${preview.lines.length} · Costo: ${preview.totals.totalCost.toFixed(2)} · Precio: ${preview.totals.totalRevenue.toFixed(2)} · Margen: ${preview.totals.avgMargin.toFixed(1)}%`
          : "Revisa las cantidades: usa números enteros mayores a cero y totales dentro del límite."}</p>
        <div className="mt-5 flex flex-wrap justify-between gap-3">
          <button className="min-h-11 px-3 text-sm text-zinc-600" disabled={pending} onClick={() => { setDetail(null); setError(null); }} type="button">Elegir otra</button>
          <button className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50" disabled={pending || !preview} onClick={() => { void apply(); }} type="button">{pending ? "Aplicando..." : "Agregar y crear borrador"}</button>
        </div>
      </> : <ul className="mt-4 space-y-2">
        {packages.map((p) => <li className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 p-3" key={p.packageId}>
          <div><p className="text-sm font-medium text-zinc-900">{p.name}</p><p className="text-xs text-zinc-500">{p.pkgNumber} · {p.lineCount} partidas</p></div>
          <button className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm text-white disabled:opacity-50" disabled={pending} onClick={() => { void choose(p.packageId); }} type="button">Revisar</button>
        </li>)}
        {!loading && packages.length === 0 ? <li className="text-sm text-zinc-500">Aún no hay plantillas. Puedes guardar una desde una cotización.</li> : null}
      </ul>}
    </section>
  </div>;
}
