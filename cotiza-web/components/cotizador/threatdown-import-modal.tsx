"use client";

import { useEffect, useRef, useState } from "react";
import type { ThreatDownQuote } from "@/lib/domain/threatdown-quote";
import { quoteLinesPutResponseSchema, type QuoteLinesPutResponse } from "@/lib/validations/quote-editor-response";

export function ThreatDownImportModal({ quoteId, clientName, hasUnsavedChanges = false, onClose, onImported }: {
  quoteId: string; clientName: string; hasUnsavedChanges?: boolean; onClose: () => void;
  onImported: (data: QuoteLinesPutResponse) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const operationId = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<ThreatDownQuote | null>(null);
  const [fileHash, setFileHash] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { const d = dialog.current; d?.showModal(); return () => d?.close(); }, []);

  function resetReview() { setConfirmed(false); operationId.current = null; }
  async function submit(action: "preview" | "apply", selectedFile: File | null = file) {
    if (!selectedFile || busy) return;
    if (action === "apply" && (!source || !confirmed || hasUnsavedChanges)) return;
    setBusy(true); setError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    try {
      const form = new FormData(); form.set("file", selectedFile); form.set("action", action);
      if (action === "apply") {
        operationId.current ??= crypto.randomUUID();
        form.set("operationId", operationId.current); form.set("expectedHash", fileHash);
        form.set("confirmed", "yes");
      }
      const response = await fetch(`/api/quotes/${quoteId}/import-threatdown`, { method: "POST", body: form, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo procesar la cotización.");
      if (action === "preview") {
        setSource(data.source); setFileHash(data.fileHash); resetReview();
      } else onImported(quoteLinesPutResponseSchema.parse(data));
    } catch (e) {
      setError(controller.signal.aborted
        ? action === "preview"
          ? "La lectura tardó demasiado. Pulsa Volver a leer PDF para reintentar."
          : "La respuesta tardó demasiado. Reintenta Importar partidas sin cambiar los datos para consultar la misma operación."
        : e instanceof Error ? e.message : "Error de red. Puedes reintentar.");
    } finally { clearTimeout(timeout); setBusy(false); }
  }

  return <dialog aria-labelledby="td-import-title" aria-busy={busy} className="m-auto max-h-[90vh] w-[min(95vw,64rem)] overflow-auto rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl backdrop:bg-black/40"
    ref={dialog} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-lg font-semibold" id="td-import-title">Importar cotización ThreatDown</h3>
      <button className="min-h-11 px-3" disabled={busy} onClick={onClose} type="button">Cerrar</button>
    </div>
    <p className="mt-2 text-sm">Cotización destino: <strong>{clientName}</strong>. Reemplaza sus partidas con las del PDF en un borrador. Conserva las versiones anteriores.</p>
    {hasUnsavedChanges ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">
      Puedes leer el PDF y revisar sus datos. Para crear el borrador, cierra esta ventana y guarda primero los cambios pendientes de la cotización.
    </p> : null}
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-sm font-medium">PDF de ThreatDown, hasta 3 MB</p>
      <p className="mt-1 text-sm text-zinc-600">Elige un PDF guardado en tu equipo. Si lo recibiste por correo, descárgalo primero.</p>
      <input accept="application/pdf,.pdf" className="hidden" disabled={busy} id="td-file" ref={fileInput} type="file"
        aria-label="Archivo PDF de ThreatDown"
        onChange={(e) => {
          const selectedFile = e.target.files?.[0] ?? null;
          setFile(selectedFile); setSource(null); setFileHash(""); setError(null); resetReview();
          if (selectedFile) void submit("preview", selectedFile);
        }} />
      <div className="mt-3 flex flex-wrap gap-3">
        <button className="min-h-12 rounded-lg bg-sky-700 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
          disabled={busy} onClick={() => fileInput.current?.click()} type="button">
          {busy ? "Leyendo PDF…" : file ? "Seleccionar otro PDF" : "Seleccionar PDF"}
        </button>
        {file ? <button className="min-h-12 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-800 disabled:opacity-50"
          disabled={busy} onClick={() => { void submit("preview"); }} type="button">Volver a leer PDF</button> : null}
      </div>
      <p className="mt-3 text-sm text-zinc-600" role="status" aria-live="polite">
        {busy ? "Procesando el PDF. Espera a que aparezca la vista previa." : file ? `Archivo seleccionado: ${file.name}` : "La lectura comenzará al seleccionar el archivo."}
      </p>
    </div>
    {error ? <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p> : null}
    {source ? <>
      <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm">
        <p><strong>{source.quoteNumber}</strong> · Licencias para: <strong>{source.licenseTo}</strong></p>
        <p>Suscripción: {source.startsOn} a {source.endsOn} · {source.termMonths} meses. Vigencia de la cotización: {source.expiresOn}.</p>
        {source.preliminary ? <p className="mt-1 text-amber-800">El proveedor identifica este documento como preliminar. La importación crea sólo un borrador.</p> : null}
      </div>
      <p className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">Sólo se importan SKU, cantidades y descripciones. Las partidas comienzan con costo y precio en cero. Captura los costos y define el margen o precio de venta en el editor de Cotiza antes de generar la propuesta.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm"><thead><tr className="border-b">
          {["SKU", "Producto", "Cantidad"].map((s) => <th className="p-2" key={s}>{s}</th>)}
        </tr></thead><tbody>{source.lines.map((l) => <tr className="border-b" key={l.sku}>
          <td className="p-2 font-mono text-xs">{l.sku}</td><td className="p-2">{l.description}</td><td className="p-2">{l.quantity}</td>
        </tr>)}</tbody></table>
      </div>
      <label className="mt-4 flex items-start gap-3 text-sm" htmlFor="td-confirm">
        <input className="mt-1 size-5 shrink-0" checked={confirmed} disabled={busy || !source || hasUnsavedChanges} id="td-confirm" type="checkbox" onChange={(e) => setConfirmed(e.target.checked)} />
        Confirmo que las licencias corresponden al cliente destino y revisé cantidades, SKU y descripciones. Acepto reemplazar las partidas del borrador destino.
      </label>
      <div className="mt-4 flex justify-end"><button className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50" disabled={busy || !source || !confirmed || hasUnsavedChanges}
        onClick={() => { void submit("apply"); }} type="button">{busy ? "Procesando..." : "Importar partidas"}</button></div>
    </> : <p className="mt-4 text-sm text-zinc-600">Admite cotizaciones digitales con la tabla Purchase Summary. Los PDF escaneados requieren captura manual.</p>}
  </dialog>;
}
