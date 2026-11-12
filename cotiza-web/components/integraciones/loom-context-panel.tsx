"use client";
import { LoomFollowupForm } from "./loom-followup-form";
import { useEffect, useRef, useState } from "react";
import type { LoomLink, LoomSnapshot } from "@/lib/integrations/loom/domain";

type Props = { tenantId: string; targetId: string; kind: "client" | "opportunity" };
type Preview = { snapshot: LoomSnapshot; previewToken: string };
function date(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(value))
    : "Sin fecha de origen";
}
function Recording({ snapshot }: { snapshot: LoomSnapshot }) {
  return <div className="min-w-0 space-y-2">
    <h3 className="break-words font-semibold">{snapshot.title}</h3>
    <p className="text-xs text-zinc-600">Creada en Loom: {date(snapshot.createdAt)}</p>
    <a className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-800 underline" href={snapshot.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Abrir grabación original</a>
    {snapshot.transcriptStatus === "ready" ? <details className="rounded-lg border border-zinc-200 bg-white p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">Ver transcripción</summary>
      <p className="my-2 text-xs text-zinc-600">Texto recuperado de Loom. Revisa el video antes de confirmar un acuerdo.</p>
      <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{snapshot.transcript}</pre>
    </details> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Transcripción no disponible en esta consulta. Puedes conservar el vínculo.</p>}
    <p className="text-xs text-zinc-600">Copia consultada: {date(snapshot.observedAt)}. La grabación de origen puede haber cambiado.</p>
  </div>;
}
export function LoomContextPanel(props: Props) {
  return <LoomContextSession key={props.tenantId + ":" + props.kind + ":" + props.targetId} {...props} />;
}
function LoomContextSession({ tenantId, targetId, kind }: Props) {
  const endpoint = "/api/" + (kind === "client" ? "clients/" : "opportunities/") + encodeURIComponent(targetId) + "/loom";
  const [links, setLinks] = useState<LoomLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"load" | "preview" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, [endpoint, tenantId]);

  async function request(action: "load" | "preview" | "link") {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setBusy(action); setError(null); setMessage("");
    if (action === "preview") setPreview(null);
    try {
      const payload = action === "load" ? undefined : action === "preview"
        ? { action, url } : { action, url: preview?.snapshot.url, previewToken: preview?.previewToken };
      const response = await fetch(endpoint, {
        method: payload ? "POST" : "GET", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-Tenant-Context": tenantId },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (action === "link") setPreview(null);
        throw new Error(data.error ?? "No se pudo consultar Loom");
      }
      if (action === "load") { setLinks(data.links); setLoaded(true); }
      else if (action === "preview") setPreview(data);
      else {
        setLinks(old => [data.link, ...old.filter(row => row.linkId !== data.link.linkId)]);
        setPreview(null); setUrl("");
        setMessage(data.unchanged ? "Esta copia ya estaba vinculada; se conservó una sola entrada." : "Grabación vinculada a este expediente.");
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "No se pudo consultar Loom");
    } finally { if (!controller.signal.aborted) setBusy(null); }
  }

  return <details className="min-w-0 rounded-xl border border-indigo-200 bg-white p-4 text-zinc-900"
    onToggle={event => { if (event.currentTarget.open && !loaded && !busy) void request("load"); }}>
    <summary className="min-h-11 cursor-pointer py-2 text-lg font-semibold">Reuniones y videos · Loom</summary>
    <p className="my-3 text-sm text-zinc-700">Piloto privado: las copias solo están disponibles para quien las vincula en esta empresa. Elige el video que corresponde a {kind === "client" ? "este cliente" : "esta oportunidad"}.</p>
    <form className="space-y-3 rounded-lg bg-indigo-50 p-3" onSubmit={event => { event.preventDefault(); void request("preview"); }}>
      <label className="block text-sm font-semibold" htmlFor={"loom-url-" + targetId}>Enlace de la grabación</label>
      <input id={"loom-url-" + targetId} type="url" required maxLength={2048} value={url} disabled={Boolean(busy)}
        onChange={event => { setUrl(event.target.value); setPreview(null); setMessage(""); }}
        placeholder="https://www.loom.com/share/..." className="min-h-11 w-full min-w-0 rounded-lg border border-zinc-400 bg-white p-3 text-sm" />
      <button type="submit" disabled={Boolean(busy) || !url.trim()} className="min-h-11 rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy === "preview" ? "Consultando grabación…" : "Revisar grabación"}</button>
    </form>
    {busy === "load" ? <p role="status" className="mt-3 text-sm">Cargando vínculos guardados…</p> : null}
    {error ? <div role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900"><p>{error}</p>
      {!loaded ? <button type="button" disabled={Boolean(busy)} onClick={() => void request("load")} className="mt-2 min-h-11 font-semibold underline">Reintentar lectura</button> : null}</div> : null}
    {message ? <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}
    {preview ? <section aria-label="Vista previa de Loom" className="mt-4 min-w-0 rounded-lg border-2 border-indigo-300 p-4">
      <Recording snapshot={preview.snapshot} />
      <p className="my-3 text-sm">Al confirmar, se guardará una copia privada en este expediente.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={Boolean(busy)} onClick={() => void request("link")} className="min-h-11 rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy === "link" ? "Vinculando…" : "Confirmar vínculo"}</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => setPreview(null)} className="min-h-11 rounded-lg border border-zinc-400 px-4 py-2">Descartar vista previa</button>
      </div>
    </section> : null}
    <div className="mt-5 space-y-4">
      {links.map(row => <article key={row.linkId} className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-4"><Recording snapshot={row.snapshot} /><LoomFollowupForm key={row.linkId + ":" + row.revision} link={row} endpoint={endpoint} tenantId={tenantId} /><p className="mt-2 text-xs text-zinc-600">Revisión conservada: {row.revision}</p></article>)}
      {loaded && !links.length ? <p className="text-sm text-zinc-600">Todavía no hay grabaciones vinculadas por ti en este expediente.</p> : null}
    </div>
  </details>;
}
