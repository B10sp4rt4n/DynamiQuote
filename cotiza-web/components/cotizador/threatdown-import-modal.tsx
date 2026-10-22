"use client";

import { useEffect, useRef, useState } from "react";
import { priceThreatDownQuote, type ThreatDownQuote } from "@/lib/domain/threatdown-quote";
import { quoteLinesPutResponseSchema, type QuoteLinesPutResponse } from "@/lib/validations/quote-editor-response";

export function ThreatDownImportModal({ quoteId, clientName, onClose, onImported }: {
  quoteId: string; clientName: string; onClose: () => void;
  onImported: (data: QuoteLinesPutResponse) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const operationId = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<ThreatDownQuote | null>(null);
  const [fileHash, setFileHash] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [margin, setMargin] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { const d = dialog.current; d?.showModal(); return () => d?.close(); }, []);
  const preview = (() => {
    if (!source || !exchangeRate.trim() || !margin.trim()) return null;
    try { return priceThreatDownQuote(source, Number(exchangeRate), Number(margin)); } catch { return null; }
  })();

  function resetReview() { setConfirmed(false); operationId.current = null; }
  async function submit(action: "preview" | "apply") {
    if (!file || busy) return;
    if (action === "apply" && (!preview || !confirmed)) return;
    setBusy(true); setError(null);
    try {
      const form = new FormData(); form.set("file", file); form.set("action", action);
      if (action === "apply") {
        operationId.current ??= crypto.randomUUID();
        form.set("operationId", operationId.current); form.set("expectedHash", fileHash);
        form.set("exchangeRate", exchangeRate); form.set("marginPct", margin); form.set("confirmed", "yes");
      }
      const response = await fetch(`/api/quotes/${quoteId}/import-threatdown`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo procesar la cotización.");
      if (action === "preview") {
        setSource(data.source); setFileHash(data.fileHash); resetReview();
      } else onImported(quoteLinesPutResponseSchema.parse(data));
    } catch (e) { setError(e instanceof Error ? e.message : "Error de red. Puedes reintentar."); }
    finally { setBusy(false); }
  }

  return <dialog aria-labelledby="td-import-title" className="m-auto max-h-[90vh] w-[min(95vw,64rem)] overflow-auto rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl backdrop:bg-black/40"
    ref={dialog} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-lg font-semibold" id="td-import-title">Importar cotización ThreatDown</h3>
      <button className="min-h-11 px-3" disabled={busy} onClick={onClose} type="button">Cerrar</button>
    </div>
    <p className="mt-2 text-sm">Cotización destino: <strong>{clientName}</strong>. Crea una versión nueva y reemplaza sus partidas con las del PDF.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-sm" htmlFor="td-file">PDF de ThreatDown, hasta 3 MB
        <input accept="application/pdf,.pdf" className="mt-1 block max-w-full text-sm" disabled={busy} id="td-file" type="file"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSource(null); setFileHash(""); setError(null); resetReview(); }} />
      </label>
      <button className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm text-white disabled:opacity-50" disabled={busy || !file} onClick={() => { void submit("preview"); }} type="button">Leer PDF</button>
    </div>
    {error ? <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p> : null}
    {source ? <>
      <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm">
        <p><strong>{source.quoteNumber}</strong> · Licencias para: <strong>{source.licenseTo}</strong></p>
        <p>Suscripción: {source.startsOn} a {source.endsOn} · {source.termMonths} meses. Vigencia de la cotización: {source.expiresOn}.</p>
        <p>Costo neto del proveedor: <strong>USD {source.netTotal.toFixed(2)}</strong>, sin impuestos.</p>
        {source.preliminary ? <p className="mt-1 text-amber-800">El proveedor identifica este documento como preliminar. La importación crea sólo un borrador.</p> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-4">
        <label className="text-sm" htmlFor="td-fx">Tipo de cambio: MXN por USD
          <input className="mt-1 block min-h-11 w-44 rounded-lg border px-3" disabled={busy} id="td-fx" min="0.000001" step="any" type="number" value={exchangeRate}
            onChange={(e) => { setExchangeRate(e.target.value); resetReview(); }} />
        </label>
        <label className="text-sm" htmlFor="td-margin">Margen de venta (%)
          <input className="mt-1 block min-h-11 w-44 rounded-lg border px-3" disabled={busy} id="td-margin" min="0" max="99.99" step="any" type="number" value={margin}
            onChange={(e) => { setMargin(e.target.value); resetReview(); }} />
        </label>
      </div>
      <p className="mt-2 text-xs text-zinc-600">Los costos originales se conservan en USD. El borrador y sus precios de venta quedarán en MXN. El margen se calcula sobre la venta.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm"><thead><tr className="border-b">
          {["SKU", "Producto", "Cantidad", "Costo unit. USD", "Costo unit. MXN", "Venta unit. MXN"].map((s) => <th className="p-2" key={s}>{s}</th>)}
        </tr></thead><tbody>{source.lines.map((l, i) => <tr className="border-b" key={l.sku}>
          <td className="p-2 font-mono text-xs">{l.sku}</td><td className="p-2">{l.description}</td><td className="p-2">{l.quantity}</td>
          <td className="p-2">{l.costUnit.toFixed(2)}</td><td className="p-2">{preview?.lines[i].costUnit.toFixed(2) ?? "—"}</td><td className="p-2">{preview?.lines[i].priceUnit.toFixed(2) ?? "—"}</td>
        </tr>)}</tbody></table>
      </div>
      <p className="mt-3 text-sm font-semibold">{preview ? `Costo MXN ${preview.totals.totalCost.toFixed(2)} · Venta MXN ${preview.totals.totalRevenue.toFixed(2)} · Margen ${preview.totals.avgMargin.toFixed(2)}%` : "Indica el tipo de cambio y margen para revisar los totales."}</p>
      <label className="mt-4 flex items-start gap-3 text-sm" htmlFor="td-confirm">
        <input className="mt-1 size-5 shrink-0" checked={confirmed} disabled={busy || !preview} id="td-confirm" type="checkbox" onChange={(e) => setConfirmed(e.target.checked)} />
        Confirmo que las licencias corresponden al cliente destino y revisé cantidades, vigencia, plazo, tipo de cambio y precios. Acepto reemplazar las partidas en un borrador nuevo.
      </label>
      <div className="mt-4 flex justify-end"><button className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50" disabled={busy || !preview || !confirmed}
        onClick={() => { void submit("apply"); }} type="button">{busy ? "Procesando..." : "Crear borrador en MXN"}</button></div>
    </> : <p className="mt-4 text-sm text-zinc-600">Admite cotizaciones digitales con la tabla Purchase Summary. Los PDF escaneados requieren captura manual.</p>}
  </dialog>;
}
