"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { CommercialFlow } from "./commercial-flow";

type Client = { clientId: string; company: string };
type Created = { opportunityId: string; opportunityNumber: string; title: string };
export function NewOpportunity({ clients }: { clients: Client[] }) {
  const [clientId, setClientId] = useState(""); const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [created, setCreated] = useState<Created | null>(null);
  const request = useRef<{ fingerprint: string; id: string } | null>(null); const busy = useRef(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy.current) return; busy.current = true; setSaving(true); setError("");
    const fingerprint = JSON.stringify([clientId, title.trim()]);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/opportunities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, title: title.trim(), creationId: request.current.id }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo confirmar el alta");
      setCreated(data.opportunity);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo confirmar el alta. Reintenta con los mismos datos."); }
    finally { busy.current = false; setSaving(false); }
  }
  return <div className="space-y-5">
    <CommercialFlow current={1} attention={error || undefined} context={created ? { opportunityId: created.opportunityId, opportunityNumber: created.opportunityNumber, title: created.title } : undefined} next={created ? "Crea una cotización para esta oportunidad." : "Selecciona el cliente y nombra el negocio."} />
    <section className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-900">
      <h1 className="text-2xl font-semibold">{created ? "Oportunidad registrada" : "Nueva oportunidad"}</h1>
      {created ? <div className="mt-4 space-y-4"><p role="status">{created.opportunityNumber} · {created.title}</p><Link className="block text-blue-800 underline" href={`/oportunidades/${encodeURIComponent(created.opportunityId)}`}>Abrir ficha de la oportunidad</Link><p>Monto: por estimar. Puedes completar necesidad, origen y siguiente paso al preparar la cotización.</p><Link className="inline-block rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white" href={`/cotizaciones?opportunityId=${encodeURIComponent(created.opportunityId)}`}>Continuar: crear cotización →</Link></div> : <form onSubmit={save} className="mt-4 grid min-w-0 max-w-xl gap-4">
        <p>Registra el negocio aunque todavía no tengas productos ni precios. Tú serás el responsable.</p>
        <label className="grid min-w-0 gap-1 font-medium">Cliente<select required disabled={saving} value={clientId} onChange={e=>setClientId(e.target.value)} className="w-full min-w-0 max-w-full rounded-lg border border-zinc-400 bg-white p-3"><option value="">Selecciona un cliente</option>{clients.map(c=><option key={c.clientId} value={c.clientId}>{c.company}</option>)}</select></label>
        <Link className="text-sm text-blue-800 underline" href="/configuracion/clientes">Registrar o revisar clientes</Link>
        <label className="grid min-w-0 gap-1 font-medium">Nombre del negocio<input required maxLength={200} disabled={saving} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej. Renovación de seguridad 2027" className="w-full min-w-0 max-w-full rounded-lg border border-zinc-400 p-3" /></label>
        <p className="text-sm text-zinc-600">Necesidad, origen y siguiente paso se pueden completar después.</p>
        {error ? <p role="alert" className="text-amber-900">Requiere atención: {error}</p> : null}
        <button disabled={saving || !clientId || !title.trim()} className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar oportunidad"}</button>
      </form>}
      <Link className="mt-5 inline-block text-sm text-blue-800 underline" href="/pipeline">Volver a Oportunidades</Link>
    </section>
  </div>;
}
