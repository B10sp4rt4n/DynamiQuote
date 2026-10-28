"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OpportunityWithStage } from "@/lib/db/opportunities";
import { DISPOSITION_LABELS, type DispositionInput } from "@/lib/domain/opportunity-disposition";
import { mexicoCalendarDate } from "@/lib/domain/commercial-close-date";
export function OpportunityDispositionControl({ opportunity: opp, canManage }: { opportunity: OpportunityWithStage; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<DispositionInput["state"]>(opp.stage === "open" ? "no_decision" : "open");
  const [reason, setReason] = useState("");
  const [resumeOn, setResumeOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decided = opp.canChangeDisposition === false || opp.stage === "won" || (opp.stage === "lost" && !opp.disposition);
  async function save() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/opportunities/${encodeURIComponent(opp.opportunityId)}/disposition`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, reason, ...(state === "paused" ? { resumeOn } : {}), revision: opp.disposition?.revision ?? 0 }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error ?? "No se pudo guardar");
      setEditing(false); setReason(""); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  return <div className="mt-2 space-y-2 text-sm text-zinc-900">
    {opp.disposition && opp.stage !== "won" ? <p className="max-w-xs whitespace-normal text-xs text-zinc-700">{opp.disposition.reason}
      {opp.stage === "paused" && opp.disposition.resumeOn ? ` · Retomar: ${opp.disposition.resumeOn} (recordatorio en Mi día)` : ""}</p> : null}
    {canManage && !decided ? <button type="button" className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-xs font-semibold text-zinc-900" onClick={() => { setEditing(!editing); setError(null); setState(opp.stage === "open" ? "no_decision" : "open"); }}>
      {editing ? "Cancelar" : opp.stage === "open" ? "Dejar de trabajar" : "Reactivar / cambiar estado"}</button> : null}
    {editing ? <fieldset disabled={busy} className="min-w-64 space-y-3 rounded-lg border border-zinc-300 bg-white p-3">
      <legend className="px-1 text-xs font-semibold">Estado comercial</legend>
      <label className="block text-xs">Acción<select aria-label="Estado comercial" className="mt-1 block w-full rounded border border-zinc-400 bg-white p-2 text-zinc-900" value={state} onChange={e => setState(e.target.value as DispositionInput["state"])}>
        {(["paused", "no_decision", "lost", ...(opp.stage !== "open" ? ["open"] : [])] as DispositionInput["state"][]).map(value => <option key={value} value={value}>{value === "open" ? "Reactivar oportunidad" : DISPOSITION_LABELS[value]}</option>)}</select></label>
      <p className="max-w-xs whitespace-normal text-xs text-zinc-700">{state === "paused" ? "Sale del total activo. Se crea un recordatorio; se reactiva manualmente." : state === "no_decision" ? "El proyecto no avanzó. Sale del total activo sin registrarse como pérdida." : state === "lost" ? "Registra una pérdida comercial de esta oportunidad. No cambia autorizaciones ni documentos." : "Vuelve al pipeline abierto y conserva el historial."}</p>
      <label className="block text-xs">Motivo<textarea aria-label="Motivo del cambio" maxLength={500} className="mt-1 block w-full rounded border border-zinc-400 bg-white p-2 text-zinc-900" value={reason} onChange={e => setReason(e.target.value)} /></label>
      {state === "paused" ? <label className="block text-xs">Fecha para retomar<input aria-label="Fecha para retomar" type="date" min={mexicoCalendarDate(new Date())} className="mt-1 block w-full rounded border border-zinc-400 bg-white p-2 text-zinc-900" value={resumeOn} onChange={e => setResumeOn(e.target.value)} /></label> : null}
      <button type="button" disabled={busy || reason.trim().length < 3 || (state === "paused" && !resumeOn)} onClick={() => void save()} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Guardando…" : "Guardar estado"}</button>
    </fieldset> : null}
    {error ? <p role="alert" className="max-w-xs whitespace-normal text-xs text-red-800">{error}</p> : null}
  </div>;
}
