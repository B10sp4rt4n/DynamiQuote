"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PROPOSAL_RELATIONSHIP_LABELS, type ProposalRelationshipMode } from "@/lib/domain/proposal-relationship";

const descriptions: Record<ProposalRelationshipMode, string> = {
  unclassified: "Se aplica el cálculo habitual de la oportunidad.",
  revision: "Elige la versión vigente. Su importe se usa para estimar el negocio.",
  alternatives: "Cotiza muestra el rango hasta que registres una preferencia. El cierre usa la propuesta ganada.",
  complements: "Los importes de estas propuestas se acumulan porque el cliente puede contratar cada una.",
};

export function ProposalRelationshipEditor({ opportunityId, revision, initialMode, initialPreferred, proposals }: {
  opportunityId: string;
  revision: number;
  initialMode: ProposalRelationshipMode;
  initialPreferred: string | null;
  proposals: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [preferred, setPreferred] = useState(initialPreferred ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const needsChoice = mode === "revision" || mode === "alternatives";
  const canSave = mode === "unclassified" ? initialMode !== "unclassified"
    : proposals.length >= 2 && (mode !== "revision" || Boolean(preferred));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/proposal-relationship`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode, revision, proposalIds: mode === "unclassified" ? [] : proposals.map(proposal => proposal.id),
          preferredProposalId: needsChoice && preferred ? preferred : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la relación.");
      setMessage({ text: "Relación guardada.", error: false });
      router.refresh();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "No se pudo guardar la relación.", error: true });
    } finally {
      setSaving(false);
    }
  }

  return <details className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Relación entre propuestas · {PROPOSAL_RELATIONSHIP_LABELS[initialMode]}</summary>
    <form onSubmit={save} className="space-y-3 pb-1 pt-2 text-sm">
      <label className="block font-medium">
        Tipo de relación
        <select value={mode} onChange={event => {
          setMode(event.target.value as ProposalRelationshipMode);
          setPreferred("");
          setMessage(undefined);
        }} disabled={saving} className="mt-1 block min-h-11 w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3">
          {Object.entries(PROPOSAL_RELATIONSHIP_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <p className="text-zinc-600">{descriptions[mode]}</p>
      {mode !== "unclassified" ? <p className="text-zinc-600">
        {proposals.length >= 2 ? `Aplica a las ${proposals.length} propuestas disponibles de esta oportunidad.` : "Se requieren al menos dos propuestas disponibles."}
      </p> : null}
      {needsChoice ? <label className="block font-medium">
        {mode === "revision" ? "Propuesta vigente" : "Opción en negociación"}
        <select value={preferred} onChange={event => setPreferred(event.target.value)} disabled={saving} required={mode === "revision"}
          className="mt-1 block min-h-11 w-full max-w-lg rounded-lg border border-zinc-300 bg-white px-3">
          <option value="">{mode === "revision" ? "Selecciona una propuesta" : "Sin elegir · mostrar rango"}</option>
          {proposals.map(proposal => <option key={proposal.id} value={proposal.id}>{proposal.label}</option>)}
        </select>
      </label> : null}
      <button type="submit" disabled={!canSave || saving} className="min-h-11 rounded-lg bg-blue-700 px-4 font-semibold text-white disabled:opacity-50">
        {saving ? "Guardando…" : "Guardar relación"}
      </button>
      {message ? <p className={message.error ? "text-red-800" : "text-emerald-800"} role={message.error ? "alert" : "status"}>{message.text}</p> : null}
    </form>
  </details>;
}
