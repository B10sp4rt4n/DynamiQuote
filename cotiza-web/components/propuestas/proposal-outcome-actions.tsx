"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { mexicoCalendarDate } from "@/lib/domain/commercial-close-date";
import type { ProposalOutcome, ProposalStatus } from "@/lib/validations/proposals";

const OUTCOME_LABELS = { discarded: "Descartada", lost: "Perdida", won: "Ganada" };
const OUTCOME_BADGE_CLASS = {
  discarded: "border-amber-300 bg-amber-50 text-amber-800",
  lost: "border-zinc-400 bg-zinc-100 text-zinc-700",
  won: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

type ProposalOutcomeActionsProps = {
  initialOutcome: ProposalOutcome;
  initialOutcomeAt?: string | null;
  createdAt?: string;
  closeDateMinimum?: string;
  opportunityCreatedAt?: string | null;
  proposalId: string;
  status: ProposalStatus;
};

function displayDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" }).format(new Date(iso));
}

export function ProposalOutcomeActions({ initialOutcome, initialOutcomeAt, createdAt, closeDateMinimum, opportunityCreatedAt, proposalId, status }: ProposalOutcomeActionsProps) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<ProposalOutcome>(initialOutcome);
  const [outcomeAt, setOutcomeAt] = useState(initialOutcomeAt ?? null);
  const [pendingOutcome, setPendingOutcome] = useState<"won" | "lost" | null>(null);
  const [closedOn, setClosedOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAssignWonLost = status === "sent" || status === "approved";
  const start = opportunityCreatedAt ?? createdAt;
  const minimumDay = closeDateMinimum ?? (start ? mexicoCalendarDate(start) : undefined);
  const dateId = `close-date-${proposalId}`;

  function openCalendar(next: "won" | "lost") {
    setError(null);
    setPendingOutcome(next);
    // Historical decisions require an explicit choice, never a silent "today".
    setClosedOn(outcome === next ? outcomeAt ? mexicoCalendarDate(outcomeAt) : "" : mexicoCalendarDate(new Date()));
  }

  async function saveOutcome(next: ProposalOutcome, selectedDate?: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/proposals/${proposalId}`, {
        body: JSON.stringify({ outcome: next, closedOn: selectedDate,
          expectedOutcome: outcome, expectedOutcomeAt: outcomeAt }),
        headers: { "Content-Type": "application/json" }, method: "PATCH",
      });
      const data = await response.json() as { error?: string; outcome?: ProposalOutcome; outcomeAt?: string | null };
      if (!response.ok) throw new Error(data.error ?? "No se pudo actualizar el desenlace");
      setOutcome(data.outcome ?? next);
      setOutcomeAt(data.outcomeAt ?? null);
      setPendingOutcome(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  function confirmDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingOutcome && closedOn) void saveOutcome(pendingOutcome, closedOn);
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-900">Desenlace comercial</p>
        {outcome ? <span className={`rounded-full border px-3 py-1 text-xs font-medium ${OUTCOME_BADGE_CLASS[outcome]}`}>
          {OUTCOME_LABELS[outcome]}
        </span> : <span className="text-xs text-zinc-500">Sin etiquetar</span>}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {start ? `Creación de ${opportunityCreatedAt ? "la oportunidad" : "la propuesta"}: ${displayDate(start)}. ` : ""}
        {outcome === "won" || outcome === "lost"
          ? outcomeAt ? `Fecha de cierre: ${displayDate(outcomeAt)}.` : "Fecha real de cierre pendiente. La referencia histórica se conserva hasta que captures la fecha."
          : "Cierre comercial pendiente."}
        {" "}Horario de Ciudad de México.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {canAssignWonLost ? <>
          <button className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 disabled:opacity-60"
            disabled={saving || outcome === "won"} onClick={() => openCalendar("won")} type="button">Marcar como ganada</button>
          <button className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 disabled:opacity-60"
            disabled={saving || outcome === "lost"} onClick={() => openCalendar("lost")} type="button">Marcar como perdida</button>
          {outcome === "won" || outcome === "lost" ? <button
            className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 disabled:opacity-60"
            disabled={saving} onClick={() => openCalendar(outcome)} type="button">
            {outcomeAt ? "Corregir fecha de cierre" : "Registrar fecha de cierre"}
          </button> : null}
        </> : null}
        <button className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 disabled:opacity-60"
          disabled={saving || outcome === "discarded"} onClick={() => void saveOutcome("discarded")} type="button">Marcar como descartada</button>
        {outcome ? <button className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-500 disabled:opacity-60"
          disabled={saving} onClick={() => void saveOutcome(null)} type="button">Quitar etiqueta</button> : null}
      </div>

      {pendingOutcome ? <form className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4" onSubmit={confirmDate}>
        <label className="block text-sm font-medium text-zinc-900" htmlFor={dateId}>
          ¿En qué fecha se cerró como {OUTCOME_LABELS[pendingOutcome].toLowerCase()}?
        </label>
        <input className="mt-2 max-w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
          id={dateId} type="date" value={closedOn} min={minimumDay} max={mexicoCalendarDate(new Date())}
          required disabled={saving} onChange={(event) => setClosedOn(event.target.value)} aria-describedby={`${dateId}-help`} />
        <p className="mt-2 text-xs text-zinc-600" id={`${dateId}-help`}>
          Usa la fecha real del cierre. Revenue y margen se asignarán a ese mes. Se conservará quién registró el cambio y cuándo.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" type="submit" disabled={saving || !closedOn}>
            {saving ? "Guardando..." : outcome === pendingOutcome ? "Guardar fecha de cierre" : `Confirmar ${OUTCOME_LABELS[pendingOutcome].toLowerCase()}`}
          </button>
          <button className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700" type="button"
            disabled={saving} onClick={() => setPendingOutcome(null)}>Cancelar</button>
        </div>
      </form> : null}

      {!canAssignWonLost ? <p className="mt-2 text-xs text-zinc-500">Ganada/perdida solo aplican mientras la propuesta está Enviada o Aprobada.</p> : null}
      {error ? <p className="mt-2 text-sm font-medium text-rose-700" role="alert">{error}</p> : null}
    </div>
  );
}
