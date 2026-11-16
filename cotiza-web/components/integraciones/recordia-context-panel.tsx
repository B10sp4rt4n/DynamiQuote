"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RecordiaPage } from "@/lib/integrations/recordia/domain";

const button = "min-h-11 rounded-lg border border-zinc-400 px-4 py-2 text-sm disabled:opacity-50";
const date = (value: string) => new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const status = { observed_fact: "Registro del sistema", recorded_claim: "Declaración registrada", decision: "Decisión registrada" };

export function RecordiaContextPanel({ tenantId, opportunityId }: { tenantId: string; opportunityId: string }) {
  const [data, setData] = useState<RecordiaPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { requestId.current++; controller.current?.abort(); }, [tenantId, opportunityId]);

  async function read(append: boolean) {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const sequence = ++requestId.current;
    const offset = append ? data?.next_offset ?? 0 : 0;
    setBusy(true); setError(null);
    const previous = append ? data : null;
    // Remove cached content before rechecking access, including after revocation.
    setData(null);
    const endpoint = `/api/opportunities/${encodeURIComponent(opportunityId)}/recordia/mcp`;
    let protocol = "2025-11-25";
    async function rpc(method: string, params?: unknown, notification = false) {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", signal: abort.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-Tenant-Context": tenantId,
          "MCP-Protocol-Version": protocol }, body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id: method }), method, ...(params ? { params } : {}) }) });
      if (response.status === 202 && notification) return null;
      const payload = await response.json();
      if (!response.ok || payload.error) throw Error(payload.error?.message ?? (typeof payload.error === "string" ? payload.error : "No se pudo consultar Recordia"));
      if (payload.result?.isError) throw Error(payload.result.content?.[0]?.text ?? "No se pudo consultar Recordia");
      return payload.result;
    }
    try {
      const initialized = await rpc("initialize", { protocolVersion: protocol, capabilities: {}, clientInfo: { name: "cotiza-recordia-panel", version: "0.1.0" } });
      protocol = initialized.protocolVersion;
      await rpc("notifications/initialized", undefined, true);
      const result = await rpc("tools/call", { name: "recordia_list_memories", arguments: { limit: 50, offset } });
      const page = JSON.parse(result.content[0].text) as RecordiaPage;
      if (sequence === requestId.current && !abort.signal.aborted) setData({ ...page, items: [...(previous?.items ?? []), ...page.items] });
    } catch (failure) {
      if (sequence === requestId.current && !abort.signal.aborted) setError(failure instanceof Error ? failure.message : "No se pudo consultar Recordia");
    } finally { if (sequence === requestId.current) setBusy(false); }
  }
  return <section id="recordia" className="rounded-xl border border-violet-300 bg-white p-5 text-zinc-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Memoria Recordia</h2>
      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-900">Premium · Piloto SynAppsSys</span></div>
    <p className="mt-2 text-sm text-zinc-600">Consulta la historia comercial registrada de esta oportunidad y la fuente de cada registro.</p>
    <button type="button" disabled={busy} className={`${button} mt-3`} onClick={() => void read(false)}>{busy ? "Consultando…" : data ? "Actualizar memoria" : "Consultar memoria"}</button>
    {error ? <p role="alert" className="mt-3 text-sm text-red-800">{error}</p> : null}
    {data ? <>
      <p className="mt-3 text-xs text-zinc-600">Consultado: {date(data.captured_at_utc)} · Horario de Ciudad de México. Las fechas de registro se conservan en UTC.</p>
      <p className="mt-2 text-sm text-zinc-600">Vista de los registros disponibles al consultar. Una nota conserva lo declarado; no acredita por sí sola que haya ocurrido. Las fuentes originales no se certifican en esta consulta.</p>
      {data.source_truncated ? <p className="mt-2 text-sm text-amber-900">Este expediente supera el límite del piloto. Se muestran hasta 100 registros recientes por tipo de fuente.</p> : null}
      {!data.items.length ? <p className="mt-3 text-sm">No hay registros disponibles para esta oportunidad.</p> : null}
      <ol aria-label="Historia comercial Recordia" className="mt-4 space-y-3">{data.items.map(item => <li key={item.id} className="rounded-lg border border-zinc-200 p-3">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{item.title}</h3>{item.recorded_at_utc ? <time title={item.recorded_at_utc} dateTime={item.recorded_at_utc} className="text-xs text-zinc-600">{date(item.recorded_at_utc)}</time> : <span className="text-xs text-zinc-600">Fecha sin registrar</span>}</div>
        <p className="mt-1 text-xs text-violet-900">{status[item.epistemic_status]}</p>
        {item.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.description}</p> : null}
        {Boolean(item.context.folio) ? <p className="mt-1 text-sm">Folio: {String(item.context.folio)}{item.context.version ? ` · Versión ${String(item.context.version)}` : ""}</p> : null}
        {Boolean(item.context.decision) ? <p className="mt-1 text-sm">Decisión: {String(item.context.decision)}</p> : null}
        {item.context.text_truncated === true ? <p className="mt-1 text-xs text-amber-900">Nota abreviada en esta vista.</p> : null}
        {item.source.href ? <Link className="mt-2 inline-flex min-h-11 items-center text-sm text-blue-800 underline" href={item.source.href}>Abrir fuente en Cotiza</Link> : null}
        <details className="mt-1 text-xs text-zinc-600"><summary className="min-h-11 cursor-pointer py-3">Referencia y fecha UTC</summary>
          <p className="break-all">{item.evidence_ids[0]}</p><p>{item.recorded_at_utc}</p></details>
      </li>)}</ol>
      {data.next_offset !== null ? <button type="button" disabled={busy} onClick={() => void read(true)} className={`${button} mt-3`}>Ver registros anteriores</button> : null}
    </> : null}
  </section>;
}
