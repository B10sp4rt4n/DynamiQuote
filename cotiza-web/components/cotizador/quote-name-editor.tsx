"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeQuoteName } from "@/lib/domain/quote-name";

export function QuoteNameEditor({ quoteId, initialName, disabled = false, onSaved, onSavingChange }: {
  quoteId: string; initialName: string | null; disabled?: boolean;
  onSaved?: (quoteId: string, name: string) => void;
  onSavingChange?: (saving: boolean) => void;
}) {
  const router = useRouter();
  const id = useId();
  const [savedName, setSavedName] = useState(normalizeQuoteName(initialName));
  const [name, setName] = useState(savedName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const nextName = normalizeQuoteName(name);
    if (!nextName || saving || disabled) return;
    setSaving(true); onSavingChange?.(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/name`, { method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposalName: nextName }) });
      const data = await response.json() as { error?: string; quote?: { quoteId: string; proposalName: string } };
      if (!response.ok || data.quote?.quoteId !== quoteId || !normalizeQuoteName(data.quote.proposalName)) {
        throw new Error(data.error ?? "No se pudo confirmar el nombre. Vuelve a intentarlo.");
      }
      setName(data.quote.proposalName); setSavedName(data.quote.proposalName); setEditing(false);
      setMessage("Nombre guardado en esta revisión.");
      onSaved?.(quoteId, data.quote.proposalName);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el nombre"); }
    finally { setSaving(false); onSavingChange?.(false); }
  }

  return <div className="mt-3 text-sm text-zinc-900">
    {editing ? <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-2">
      <label htmlFor={id} className="block font-medium">Nombre de la cotización</label>
      <input id={id} autoFocus maxLength={200} value={name} disabled={saving || disabled}
        aria-describedby={`${id}-help`} onChange={event => setName(event.target.value)}
        className="min-h-11 w-full min-w-0 rounded-lg border border-zinc-400 bg-white px-3 py-2 text-zinc-900"
        placeholder="Ej. Renovación ThreatDown 2027 · 2 años" />
      <p id={`${id}-help`} className="text-sm text-zinc-600">Identifica esta revisión y se usa como asunto inicial al crear su propuesta. El asunto de una propuesta existente se edita en Propuestas.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || disabled || !normalizeQuoteName(name)} className="min-h-11 rounded-lg bg-blue-800 px-3 py-2 font-medium text-white disabled:opacity-50">{saving ? "Guardando nombre…" : "Guardar nombre"}</button>
        <button type="button" disabled={saving} onClick={() => { setName(savedName); setEditing(false); setError(null); }} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2">Cancelar</button>
      </div>
    </form> : <button type="button" disabled={disabled} onClick={() => { setEditing(true); setMessage(null); }} className="min-h-11 rounded-lg border border-blue-300 px-3 py-2 font-medium text-blue-900 disabled:opacity-50">{savedName ? "Editar nombre" : "Asignar nombre"}</button>}
    {message ? <p role="status" className="mt-2 text-emerald-800">{message}</p> : null}
    {error ? <p role="alert" className="mt-2 text-rose-800">{error}</p> : null}
  </div>;
}
