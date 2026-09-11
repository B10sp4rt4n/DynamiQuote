"use client";

import { useState } from "react";

import type { ProposalOutcome, ProposalStatus } from "@/lib/validations/proposals";

const OUTCOME_LABELS: Record<"discarded" | "lost" | "won", string> = {
  discarded: "Descartada",
  lost: "Perdida",
  won: "Ganada",
};

const OUTCOME_BADGE_CLASS: Record<"discarded" | "lost" | "won", string> = {
  discarded: "border-amber-300 bg-amber-50 text-amber-800",
  lost: "border-zinc-400 bg-zinc-100 text-zinc-700",
  won: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

type ProposalOutcomeActionsProps = {
  initialOutcome: ProposalOutcome;
  proposalId: string;
  status: ProposalStatus;
};

export function ProposalOutcomeActions({ initialOutcome, proposalId, status }: ProposalOutcomeActionsProps) {
  const [outcome, setOutcome] = useState<ProposalOutcome>(initialOutcome);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ganada/perdida solo aplican en el punto real de decision del cliente.
  // Descartada marca una version superada por un ajuste de configuracion o
  // margen antes de llegar a esa decision -- aplica en cualquier estatus,
  // incluido Borrador.
  const canAssignWonLost = status === "sent" || status === "approved";

  async function setOutcomeValue(next: ProposalOutcome) {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}`, {
        body: JSON.stringify({ outcome: next }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      const data = (await response.json()) as { error?: string; outcome?: ProposalOutcome };

      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo actualizar el desenlace");
      }

      setOutcome(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-900">Desenlace comercial</p>
        {outcome ? (
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${OUTCOME_BADGE_CLASS[outcome]}`}>
            {OUTCOME_LABELS[outcome]}
          </span>
        ) : (
          <span className="text-xs text-zinc-500">Sin etiquetar</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {canAssignWonLost ? (
          <>
            <button
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
              disabled={saving || outcome === "won"}
              onClick={() => void setOutcomeValue("won")}
              type="button"
            >
              Marcar como ganada
            </button>
            <button
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
              disabled={saving || outcome === "lost"}
              onClick={() => void setOutcomeValue("lost")}
              type="button"
            >
              Marcar como perdida
            </button>
          </>
        ) : null}
        <button
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
          disabled={saving || outcome === "discarded"}
          onClick={() => void setOutcomeValue("discarded")}
          type="button"
        >
          Marcar como descartada
        </button>
        {outcome ? (
          <button
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-60"
            disabled={saving}
            onClick={() => void setOutcomeValue(null)}
            type="button"
          >
            Quitar etiqueta
          </button>
        ) : null}
      </div>

      {!canAssignWonLost ? (
        <p className="mt-2 text-xs text-zinc-500">
          Ganada/perdida solo aplican mientras la propuesta esta Enviada o Aprobada. Descartada aplica en
          cualquier estatus.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
