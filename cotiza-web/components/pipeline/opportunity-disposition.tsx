"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OpportunityWithStage } from "@/lib/db/opportunities";
import { DISPOSITION_LABELS, type DispositionInput } from "@/lib/domain/opportunity-disposition";
import { mexicoCalendarDate } from "@/lib/domain/commercial-close-date";

export function OpportunityDispositionControl({ opportunity: opp, canManage }: { opportunity: OpportunityWithStage; canManage: boolean }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [state, setState] = useState<DispositionInput["state"]>(opp.stage === "open" ? "no_decision" : "open");
  const [reason, setReason] = useState("");
  const [resumeOn, setResumeOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decided = opp.canChangeDisposition === false || opp.stage === "won" || (opp.stage === "lost" && !opp.disposition);

  function openDialog() {
    setState(opp.stage === "open" ? "no_decision" : "open");
    setError(null);
    dialogRef.current?.showModal();
  }

  function resetForm() {
    setReason("");
    setResumeOn("");
    setError(null);
  }

  async function save() {
    if (busy || reason.trim().length < 3 || (state === "paused" && !resumeOn)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/opportunities/${encodeURIComponent(opp.opportunityId)}/disposition`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, reason, ...(state === "paused" ? { resumeOn } : {}), revision: opp.disposition?.revision ?? 0 }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error ?? "No se pudo guardar");
      dialogRef.current?.close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-2 space-y-2 text-sm text-zinc-900">
    {opp.disposition && opp.stage !== "won" ? <p className="max-w-xs whitespace-normal text-xs text-zinc-700">{opp.disposition.reason}
      {opp.stage === "paused" && opp.disposition.resumeOn ? ` · Retomar: ${opp.disposition.resumeOn} (recordatorio en Mi día)` : ""}</p> : null}
    {canManage && !decided ? <>
      <button type="button" className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-xs font-semibold text-zinc-900" onClick={openDialog}>
        {opp.stage === "open" ? "Descartar" : "Reactivar / cambiar estado"}
      </button>
      {/* Native modal top layer escapes the table's horizontal overflow and
          provides focus containment, Escape and return focus to the trigger. */}
      <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId} aria-modal="true" aria-busy={busy}
        className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-xl border border-zinc-300 bg-white p-0 text-left text-zinc-900 shadow-2xl backdrop:bg-black/40"
        onCancel={event => { if (busy) event.preventDefault(); }} onClose={resetForm}>
        <form className="space-y-4 whitespace-normal break-words p-5 sm:p-6" onSubmit={event => { event.preventDefault(); void save(); }}>
          <div>
            <h2 id={titleId} className="text-lg font-semibold">{opp.stage === "open" ? "Descartar oportunidad" : "Actualizar oportunidad"}</h2>
            <p id={descriptionId} className="mt-1 text-sm text-zinc-700">{opp.opportunityNumber} · {opp.title}</p>
          </div>
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <legend className="sr-only">Estado comercial</legend>
            <label className="block text-sm font-medium">Acción
              <select aria-label="Estado comercial" className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-zinc-400 bg-white p-2 text-zinc-900" value={state} onChange={e => setState(e.target.value as DispositionInput["state"])}>
                {(["paused", "no_decision", "lost", ...(opp.stage !== "open" ? ["open"] : [])] as DispositionInput["state"][]).map(value => <option key={value} value={value}>{value === "open" ? "Reactivar oportunidad" : DISPOSITION_LABELS[value]}</option>)}
              </select>
            </label>
            <p className="text-sm text-zinc-700">{state === "paused" ? "Sale del total activo. Se crea un recordatorio; se reactiva manualmente." : state === "no_decision" ? "El proyecto no avanzó. Sale del total activo sin registrarse como pérdida." : state === "lost" ? "Registra una pérdida comercial de esta oportunidad. No cambia autorizaciones ni documentos." : "Vuelve al pipeline abierto y conserva el historial."}</p>
            <label className="block text-sm font-medium">Motivo
              <textarea aria-label="Motivo del cambio" maxLength={500} rows={3} className="mt-1 block w-full min-w-0 resize-y rounded-lg border border-zinc-400 bg-white p-2 text-zinc-900" value={reason} onChange={e => setReason(e.target.value)} />
            </label>
            {state === "paused" ? <label className="block text-sm font-medium">Fecha para retomar
              <input aria-label="Fecha para retomar" type="date" min={mexicoCalendarDate(new Date())} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-zinc-400 bg-white p-2 text-zinc-900" value={resumeOn} onChange={e => setResumeOn(e.target.value)} />
            </label> : null}
          </fieldset>
          {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-3 border-t border-zinc-200 pt-4">
            <button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} className="min-h-11 rounded-lg border border-zinc-400 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={busy || reason.trim().length < 3 || (state === "paused" && !resumeOn)} className="min-h-11 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Guardando…" : "Guardar estado"}</button>
          </div>
        </form>
      </dialog>
    </> : null}
  </div>;
}
