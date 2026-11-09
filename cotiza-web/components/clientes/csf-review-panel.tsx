"use client";

import { useEffect, useRef, useState } from "react";
import { CSF_FIELDS, CSF_MAX_BYTES, clientFiscalValuesSchema, type ClientFiscalValues,
  type CsfReview } from "@/lib/domain/csf-review";

type Props = {
  current: ClientFiscalValues;
  onApply: (values: ClientFiscalValues) => void;
  onPendingChange: (pending: boolean) => void;
};
type Phase = "idle" | "uploading" | "processing" | "review" | "confirming" | "applied" | "error";
const suggestionFields: Record<string, keyof ClientFiscalValues> = {
  legal_name: "company", tax_id: "rfc", tax_regime: "fiscalRegime", postal_code: "zipCode",
};

export function CsfReviewPanel({ current, onApply, onPendingChange }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState("");
  const [filename, setFilename] = useState("");
  const [review, setReview] = useState<CsfReview | null>(null);
  const [values, setValues] = useState<ClientFiscalValues>(current);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [pollCount, setPollCount] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onPendingChange(phase !== "idle" && phase !== "applied");
  }, [phase, onPendingChange]);
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    if (phase !== "processing" || !token) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/clients/csf", { headers: { "X-CSF-Review": token }, signal: abort.signal });
        const data = await response.json();
        if (!response.ok || data.status === "failed") throw new Error(data.error ?? "No fue posible leer la constancia");
        if (abort.signal.aborted) return;
        if (data.status === "done" && data.review) {
          setReview(data.review);
          setValues({ ...data.review.values, address: data.review.values.address || current.address });
          setPhase("review");
        } else if (pollCount >= 59) {
          setError("La lectura sigue pendiente. Consulta de nuevo sin volver a subir el archivo.");
          setPhase("error");
        } else setPollCount((n) => n + 1);
      } catch (e) {
        if (!abort.signal.aborted) { setError(e instanceof Error ? e.message : "Error de conexión"); setPhase("error"); }
      }
    }, 1500);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [phase, token, pollCount, current.address]);

  function discard() {
    controller.current?.abort();
    setToken(""); setReview(null); setPreview(""); setFilename("");
    setConfirmed(false); setError(""); setPhase("idle");
    if (input.current) input.current.value = "";
  }

  async function upload(file: File | undefined) {
    if (!file || busy.current) return;
    discard();
    if (!/\.pdf$/i.test(file.name) || !file.size || file.size > CSF_MAX_BYTES) {
      setError("Selecciona el PDF de la CSF, de hasta 4 MB."); setPhase("error"); return;
    }
    busy.current = true;
    const abort = new AbortController(); controller.current = abort;
    setFilename(file.name); setPreview(URL.createObjectURL(file)); setPhase("uploading");
    try {
      const body = new FormData(); body.append("file", file);
      const response = await fetch("/api/clients/csf", { body, method: "POST", signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No fue posible cargar la CSF");
      if (!abort.signal.aborted) { setToken(data.token); setPollCount(0); setPhase("processing"); }
    } catch (e) {
      if (!abort.signal.aborted) { setError(e instanceof Error ? e.message : "Error de conexión"); setPhase("error"); }
    } finally { busy.current = false; }
  }

  function change(field: keyof ClientFiscalValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value })); setConfirmed(false); setError("");
  }

  async function apply() {
    if (busy.current || !review || !confirmed || !clientFiscalValuesSchema.safeParse(values).success) return;
    busy.current = true; setPhase("confirming"); setError("");
    const abort = new AbortController(); controller.current = abort;
    try {
      const response = await fetch("/api/clients/csf", { method: "POST", signal: abort.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, expectedRevision: review.revision, values, confirm: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Revisa los datos fiscales");
      if (!abort.signal.aborted) { onApply(data.values); setPhase("applied"); }
    } catch (e) {
      if (!abort.signal.aborted) { setError(e instanceof Error ? e.message : "Error de conexión"); setConfirmed(false); setPhase("review"); }
    } finally { busy.current = false; }
  }

  const validation = clientFiscalValuesSchema.safeParse(values);
  const working = ["uploading", "processing", "confirming"].includes(phase);
  return (
    <section aria-label="Cargar y revisar CSF" className="min-w-0 rounded-xl border border-teal-200 bg-teal-50/50 p-4 sm:col-span-2">
      <h3 className="text-sm font-semibold text-zinc-900">Completar datos con una CSF</h3>
      <p className="mt-1 text-xs text-zinc-600">1. Carga el PDF · 2. Revisa los datos · 3. Confirma y guarda el cliente.</p>
      <label className="mt-3 block text-xs font-medium text-zinc-700">
        Cargar CSF en PDF
        <input ref={input} aria-label="Cargar CSF en PDF" className="mt-1 block w-full text-sm" type="file" accept=".pdf,application/pdf"
          disabled={working} onChange={(e) => { void upload(e.target.files?.[0]); }} />
      </label>
      <p className="mt-1 text-xs text-zinc-500">PDF con texto o escaneado, hasta 4 MB. El archivo se almacena para su revisión. El cliente se modifica al pulsar Guardar.</p>
      {working ? <p role="status" className="mt-3 text-sm text-teal-800">{phase === "uploading" ? "Cargando constancia…" : phase === "confirming" ? "Comprobando los datos revisados…" : "Leyendo datos fiscales…"}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
      {phase === "error" && token ? <button type="button" className="mt-2 text-sm font-semibold text-teal-800 underline" onClick={() => { setError(""); setPollCount(0); setPhase("processing"); }}>Consultar de nuevo</button> : null}
      {preview && review ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="min-w-0">
            <a className="break-words text-xs text-teal-800 underline" href={preview} target="_blank" rel="noreferrer">Abrir PDF: {filename}</a>
            <object aria-label="PDF original de la CSF" className="mt-2 h-96 w-full rounded-lg border bg-white" data={preview} type="application/pdf">
              <p className="p-3 text-xs">Abre el PDF con el enlace para comparar sus datos.</p>
            </object>
          </div>
          <div className="min-w-0 space-y-3">
            <p className="text-xs text-zinc-600">Compara la extracción con los datos actuales. Puedes corregir cada campo antes de confirmarlo.</p>
            {review.extraction?.reviewRequired ? <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Se leyó un escaneo. Comprueba sus datos contra el PDF; los avisos señalan campos cuya lectura requiere más atención.
            </p> : null}
            {CSF_FIELDS.map(({ key, label }) => (
              <label key={key} className="block text-xs font-medium text-zinc-700">
                {label}
                <span className="mt-1 block break-words font-normal text-zinc-500">Actual: {current[key] || "Sin dato"}</span>
                <span className="block break-words font-normal text-zinc-500">Extraído: {key === "fiscalRegime" ? review.regimeText || "Sin dato" : review.values[key] || "Sin dato"}</span>
                {key === "fiscalRegime" ? <select aria-label={`CSF: ${label}`} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  disabled={working || phase === "applied"} value={values[key]} onChange={(e) => change(key, e.target.value)}>
                  <option value="">Selecciona el régimen de la CSF</option>
                  {(review.regimeOptions ?? [{ code: review.values.fiscalRegime, label: review.regimeText }]).filter((o) => o.code).map((o) => <option key={o.code} value={o.code}>{o.code} — {o.label}</option>)}
                </select> : <input aria-label={`CSF: ${label}`} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  disabled={working || phase === "applied"} value={values[key]} maxLength={key === "address" ? 300 : key === "company" ? 200 : key === "zipCode" ? 5 : 13}
                  onChange={(e) => change(key, e.target.value)} />}
                {review.fieldWarnings?.[key] ? <span className="mt-1 block rounded bg-amber-100 px-2 py-1 font-normal text-amber-900">{review.fieldWarnings[key]}</span> : null}
                {review.issues[key] ? <span className="mt-1 block font-normal text-amber-800">Lectura: {review.issues[key]}</span> : null}
              </label>
            ))}
            {Object.entries(review.issues).filter(([key]) => !CSF_FIELDS.some((f) => f.key === key)).map(([key, issue]) => <p key={key} className="text-xs text-amber-800">{issue}</p>)}
            {review.suggestions.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Sugerencias de IA pendientes de revisión</p>
              {review.suggestions.map((s, i) => <p key={i} className="mt-2 break-words">{s.field}: {s.suggested_value} {s.reason ? `(${s.reason})` : ""}
                {suggestionFields[s.field] && phase === "review" ? <button type="button" className="ml-2 underline" onClick={() => change(suggestionFields[s.field], s.suggested_value)}>Usar sugerencia</button> : null}
              </p>)}
            </div> : null}
            {current.rfc && current.rfc.toUpperCase() !== values.rfc.toUpperCase() ? <p className="text-xs font-semibold text-amber-900">El RFC es distinto al del cliente actual. Verifica que estás actualizando al contribuyente correcto.</p> : null}
            {!validation.success && phase === "review" ? <p className="text-xs text-rose-700">{validation.error.issues[0]?.message}</p> : null}
            {phase !== "applied" ? <>
              <label className="flex items-start gap-2 text-xs text-zinc-800">
                <input type="checkbox" checked={confirmed} disabled={working} onChange={(e) => setConfirmed(e.target.checked)} />
                Revisé el PDF, los cambios y las sugerencias. Confirmo que estos datos corresponden al cliente.
              </label>
              <button type="button" className="w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={working || !confirmed || !validation.success} onClick={() => { void apply(); }}>Confirmar y aplicar al formulario</button>
            </> : <p role="status" className="text-sm font-semibold text-teal-800">Datos aplicados al formulario. Pulsa Guardar para actualizar el cliente.</p>}
            <p className="text-xs text-zinc-500">Se comprueban formato y catálogos locales. Esto no acredita autenticidad ni situación vigente ante el SAT.</p>
          </div>
        </div>
      ) : null}
      {phase !== "idle" && phase !== "applied" ? <button type="button" disabled={phase === "confirming"} className="mt-3 text-xs text-zinc-600 underline"
        onClick={discard}>Descartar esta revisión y continuar con captura manual</button> : null}
    </section>
  );
}
