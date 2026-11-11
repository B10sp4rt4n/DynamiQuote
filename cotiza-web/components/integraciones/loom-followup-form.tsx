"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LoomFollowup, LoomLink } from "@/lib/integrations/loom/domain";

type Props = { link: LoomLink; endpoint: string; tenantId: string };
type Review = { token: string; followup: LoomFollowup; source: { title: string; url: string; observedAt: string; revision: number } };
export function LoomFollowupForm({ link, endpoint, tenantId }: Props) {
  const router = useRouter(), active = useRef<AbortController | null>(null);
  const [kind, setKind] = useState<"note" | "task">("note"), [excerpt, setExcerpt] = useState(""), [description, setDescription] = useState(""), [dueDate, setDueDate] = useState("");
  const [review, setReview] = useState<Review | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [message, setMessage] = useState("");
  useEffect(() => () => { active.current?.abort(); }, [endpoint, tenantId, link.linkId, link.revision]);
  async function send(confirm: boolean) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null); setMessage("");
    try {
      const body = confirm ? { action: "save_followup", token: review?.token } : { action: "review_followup", linkId: link.linkId, revision: link.revision,
        followup: { kind, excerpt, description, dueDate: kind === "task" ? dueDate : null } };
      const response = await fetch(endpoint, { method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-Tenant-Context": tenantId }, body: JSON.stringify(body) });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) { if (confirm) setReview(null); throw new Error(data.error ?? "No se pudo guardar el seguimiento"); }
      if (!confirm) setReview(data);
      else {
        setReview(null); setExcerpt(""); setDescription(""); setDueDate("");
        setMessage(data.unchanged ? "El seguimiento ya estaba guardado; se conservó una sola entrada." : data.kind === "task" ? "Tarea guardada en el expediente." : "Nota guardada en la bitácora del cliente.");
        router.refresh();
      }
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "No se pudo guardar el seguimiento"); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  if (link.snapshot.transcriptStatus !== "ready") return null;
  const prefix = "loom-followup-" + link.linkId;
  return <details className="mt-4 min-w-0 rounded-lg border border-indigo-200 bg-white p-3">
    <summary className="min-h-11 cursor-pointer py-2 font-semibold text-indigo-900">Crear nota o tarea desde esta grabación</summary>
    <p className="my-3 text-sm text-zinc-700">Copia un fragmento exacto de la transcripción para respaldar el seguimiento. La nota o tarea guardada será visible según los permisos habituales del expediente.</p>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); void send(false); }}>
      <label className="block text-sm font-medium" htmlFor={prefix + "-kind"}>Tipo de seguimiento</label>
      <select id={prefix + "-kind"} value={kind} disabled={busy} onChange={event => { setKind(event.target.value as "note" | "task"); setReview(null); }} className="min-h-11 w-full rounded-lg border border-zinc-400 bg-white p-2">
        <option value="note">Nota de bitácora</option><option value="task">Tarea con fecha</option>
      </select>
      <label className="block text-sm font-medium" htmlFor={prefix + "-excerpt"}>Fragmento de origen</label>
      <textarea id={prefix + "-excerpt"} value={excerpt} required minLength={3} maxLength={600} disabled={busy} onChange={event => { setExcerpt(event.target.value); setReview(null); }} rows={3} className="w-full min-w-0 rounded-lg border border-zinc-400 bg-white p-2 text-sm" />
      <label className="block text-sm font-medium" htmlFor={prefix + "-description"}>{kind === "task" ? "Qué se debe hacer" : "Nota para el expediente"}</label>
      <textarea id={prefix + "-description"} value={description} required minLength={3} maxLength={1000} disabled={busy} onChange={event => { setDescription(event.target.value); setReview(null); }} rows={3} className="w-full min-w-0 rounded-lg border border-zinc-400 bg-white p-2 text-sm" />
      {kind === "task" ? <><label className="block text-sm font-medium" htmlFor={prefix + "-date"}>Fecha de seguimiento</label>
        <input id={prefix + "-date"} type="date" value={dueDate} required disabled={busy} onChange={event => { setDueDate(event.target.value); setReview(null); }} className="min-h-11 max-w-full rounded-lg border border-zinc-400 bg-white p-2" /></> : null}
      <button type="submit" disabled={busy} className="min-h-11 rounded-lg border border-indigo-600 px-4 py-2 font-semibold text-indigo-900 disabled:opacity-50">{busy ? "Procesando seguimiento…" : "Revisar seguimiento"}</button>
    </form>
    {error ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{error}</p> : null}
    {message ? <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}
    {review ? <section aria-label="Revisión del seguimiento" className="mt-4 space-y-3 rounded-lg bg-indigo-50 p-3">
      <p className="font-semibold">{review.followup.kind === "task" ? "Tarea por guardar" : "Nota por guardar"}</p>
      <p className="whitespace-pre-wrap break-words text-sm">{review.followup.description}</p>
      <blockquote className="whitespace-pre-wrap break-words border-l-2 border-indigo-400 pl-3 text-sm">{review.followup.excerpt}</blockquote>
      {review.followup.kind === "task" ? <p className="text-sm font-medium">Fecha confirmada: {review.followup.dueDate}</p> : null}
      <p className="break-words text-xs text-zinc-600">Fuente: {review.source.title} · copia revisión {review.source.revision}. Se conservará el enlace y el pasaje.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={() => void send(true)} className="min-h-11 rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Confirmar seguimiento</button>
        <button type="button" disabled={busy} onClick={() => setReview(null)} className="min-h-11 rounded-lg border border-zinc-400 px-4 py-2">Volver a editar</button>
      </div>
    </section> : null}
  </details>;
}
