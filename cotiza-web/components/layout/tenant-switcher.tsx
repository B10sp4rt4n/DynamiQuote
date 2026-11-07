"use client";

import { useRef, useState } from "react";

type TenantOption = { id: string; name: string; slug: string };

export function TenantSwitcher({ currentSlug, currentName, options }: {
  currentSlug: string; currentName: string; options: TenantOption[];
}) {
  const [selectedSlug, setSelectedSlug] = useState(currentSlug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function switchCompany(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || !selectedSlug || selectedSlug === currentSlug) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch("/api/context/tenant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: selectedSlug }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "No se pudo cambiar de empresa");
      // A full navigation clears the previous company's cached document and form state.
      // Never carry quote/proposal/opportunity IDs into the newly selected company.
      window.location.assign("/inicio");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar de empresa");
      inFlight.current = false; setBusy(false);
    }
  }

  return <details className="min-w-0 rounded-lg border border-zinc-300 bg-white text-zinc-900">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2">
      <span className="min-w-0 break-words">Empresa activa: <strong>{currentName}</strong></span>
      <span className="shrink-0 font-semibold">Cambiar <span aria-hidden="true">▾</span></span>
    </summary>
    <div className="border-t border-zinc-200 p-3">
      <form onSubmit={switchCompany} className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">Cambiar a
          <select className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-zinc-400 bg-white px-3 py-2" value={selectedSlug} disabled={busy} onChange={e => { setSelectedSlug(e.target.value); setError(null); }}>
            {options.map(option => <option key={option.id} value={option.slug}>{option.name} ({option.slug})</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy || selectedSlug === currentSlug} className="min-h-11 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Cambiando…" : "Cambiar empresa"}</button>
      </form>
      <p className="mt-3 text-xs text-zinc-600">Guarda tu trabajo antes de cambiar. Se abrirá el inicio de la empresa elegida.</p>
      {busy ? <p className="mt-2 text-sm" role="status">Cambiando de empresa…</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-700" role="alert">{error}</p> : null}
    </div>
  </details>;
}
