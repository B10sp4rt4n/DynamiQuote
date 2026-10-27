"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OpportunityIntake } from "@/lib/domain/opportunity-intake";

export function QuoteOpportunityPanel({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [opportunity, setOpportunity] = useState<OpportunityIntake | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const savingRef = useRef(false);
  const [fields, setFields] = useState({ title: "", need: "", source: "", nextStep: "" });
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/opportunity`, { method: "GET", signal: controller.signal });
        if (!response.ok) throw new Error("No disponible");
        const data = await response.json() as { opportunity: OpportunityIntake | null };
        if (controller.signal.aborted) return;
        setOpportunity(data.opportunity);
        if (data.opportunity) setFields({ title: data.opportunity.title, need: data.opportunity.need,
          source: data.opportunity.source, nextStep: data.opportunity.nextStep });
        setLoadError(false);
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [quoteId, retry]);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!opportunity || savingRef.current) return;
    savingRef.current = true; setSaving(true); setMessage(null);
    try {
      const response = await fetch(`/api/opportunities/${encodeURIComponent(opportunity.opportunityId)}/intake`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, revision: opportunity.revision }),
      });
      const data = await response.json() as { opportunity?: OpportunityIntake; error?: string };
      if (!response.ok || !data.opportunity) throw new Error(data.error ?? "No se pudieron guardar los datos");
      setOpportunity(data.opportunity);
      setFields({ title: data.opportunity.title, need: data.opportunity.need, source: data.opportunity.source, nextStep: data.opportunity.nextStep });
      setMessage(data.opportunity.missingFields.length ? "Avance guardado. Aún hay datos por completar." : "Datos de la oportunidad completos.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudieron guardar los datos"); }
    finally { savingRef.current = false; setSaving(false); }
  }
  if (loading) return <p className="mt-4 text-sm text-zinc-600" role="status">Consultando oportunidad…</p>;
  if (loadError) return <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">
    No se pudo consultar el pendiente de la oportunidad. Puedes seguir cotizando.
    <button className="ml-3 font-semibold underline" type="button" onClick={() => { setLoading(true); setRetry(value => value + 1); }}>Reintentar consulta</button>
  </div>;
  if (!opportunity) return null;
  const pending = opportunity.managed && opportunity.missingFields.length > 0;
  const formId = `opportunity-intake-${quoteId}`;
  return <section className={`mt-4 rounded-lg border p-4 ${pending ? "border-amber-300 bg-amber-50 text-amber-950" : "border-zinc-300 bg-white text-zinc-900"}`} aria-label="Oportunidad de la cotización">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-semibold">{opportunity.opportunityNumber} · {pending ? "Datos de oportunidad pendientes" : opportunity.title || "Oportunidad vinculada"}</p>
        {pending ? <><p className="mt-1 text-sm">Completa: {opportunity.missingFields.join(", ")}. Puedes seguir cotizando y hacerlo después.</p>
          <p className="mt-1 text-xs">Este aviso permanece al volver a abrir la cotización y sus versiones.</p></> : null}</div>
      {opportunity.managed ? <button className="rounded-lg border border-zinc-500 bg-white px-4 py-2 text-sm font-semibold text-zinc-900" type="button"
        aria-expanded={expanded} aria-controls={formId} onClick={() => setExpanded(value => !value)}>{expanded ? "Cerrar datos" : pending ? "Completar datos de la oportunidad" : "Ver datos de la oportunidad"}</button> : null}
    </div>
    {expanded ? <form id={formId} onSubmit={save} className="mt-4 space-y-3 text-zinc-900">
      <p className="text-sm">Empresa: {opportunity.clientCompany}. El nombre, la necesidad y el origen completan el registro; puedes guardar avances.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {([{ key: "title", label: "Nombre de oportunidad", maxLength: 200 }, { key: "source", label: "Origen (referido, campaña, renovación…)", maxLength: 200 }] as const).map(({ key, label, maxLength }) =>
          <label key={key} className="grid gap-1 text-sm font-medium">{label}<input className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-zinc-900" maxLength={maxLength}
            value={fields[key]} disabled={saving} onChange={event => setFields(current => ({ ...current, [key]: event.target.value }))} /></label>)}
        {([{ key: "need", label: "Necesidad del cliente", maxLength: 2000 }, { key: "nextStep", label: "Próximo paso (opcional)", maxLength: 1000 }] as const).map(({ key, label, maxLength }) =>
          <label key={key} className="grid gap-1 text-sm font-medium">{label}<textarea className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-zinc-900" rows={3} maxLength={maxLength}
            value={fields[key]} disabled={saving} onChange={event => setFields(current => ({ ...current, [key]: event.target.value }))} /></label>)}
      </div>
      <p className="text-xs text-zinc-600">El próximo paso es una nota; no programa recordatorios.</p>
      <button className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} type="submit">{saving ? "Guardando…" : "Guardar datos"}</button>
      {message ? <p role="status" className="text-sm text-zinc-900">{message}</p> : null}
    </form> : null}
  </section>;
}
