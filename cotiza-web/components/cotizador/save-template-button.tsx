"use client";
import { useRef, useState } from "react";

export function SaveTemplateButton({ quoteId, disabled }: { quoteId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const operationId = useRef<string | null>(null);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true); setMessage(null); operationId.current ??= crypto.randomUUID();
    try {
      const r = await fetch("/api/packages/from-quote", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId, name, description, operationId: operationId.current }) });
      const data = await r.json() as { error?: string; package?: { pkgNumber: string } };
      if (!r.ok || !data.package) throw new Error(data.error ?? "No se pudo guardar la plantilla");
      setMessage(`Plantilla ${data.package.pkgNumber} guardada. Disponible en Paquetes y en Usar plantilla.`);
      setOpen(false); operationId.current = null; setName(""); setDescription("");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Error de red. Puedes reintentar."); }
    finally { setSaving(false); }
  }
  return <>
    <button className="rounded-lg border border-emerald-400 px-3 py-2 text-sm font-medium text-emerald-700 disabled:opacity-50" disabled={disabled} onClick={() => { setOpen(true); setMessage(null); }} type="button">Guardar como plantilla</button>
    {message && !open ? <span className="text-sm text-zinc-700" role="status">{message}</span> : null}
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <button aria-label="Cerrar guardar plantilla" className="absolute inset-0 bg-black/30" disabled={saving} onClick={() => setOpen(false)} type="button" />
      <form aria-labelledby="save-template-title" aria-modal="true" role="dialog" className="relative w-full max-w-lg space-y-4 rounded-xl bg-white p-5 shadow-xl" onSubmit={(e) => { void save(e); }}>
        <h3 className="text-lg font-semibold text-zinc-900" id="save-template-title">Guardar como plantilla</h3>
        <p className="text-sm text-zinc-600">Guarda las partidas de esta versión para reutilizarlas. No incluye los datos del cliente ni de facturación.</p>
        <label className="block text-sm text-zinc-700" htmlFor="template-name">Nombre
          <input autoFocus className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 px-3" disabled={saving} id="template-name" maxLength={200} required value={name}
            onChange={(e) => { setName(e.target.value); operationId.current = null; }} placeholder="Ej. Renovación ThreatDown anual" />
        </label>
        <label className="block text-sm text-zinc-700" htmlFor="template-description">Descripción opcional
          <textarea className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2" disabled={saving} id="template-description" maxLength={500} value={description}
            onChange={(e) => { setDescription(e.target.value); operationId.current = null; }} />
        </label>
        {message ? <p className="text-sm text-rose-700" role="alert">{message}</p> : null}
        <div className="flex justify-end gap-3">
          <button className="min-h-11 px-3 text-sm text-zinc-600" disabled={saving} onClick={() => setOpen(false)} type="button">Cancelar</button>
          <button className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !name.trim()} type="submit">{saving ? "Guardando..." : "Guardar plantilla"}</button>
        </div>
      </form>
    </div> : null}
  </>;
}
