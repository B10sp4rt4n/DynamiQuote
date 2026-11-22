"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RecordiaMemory, RecordiaPage } from "@/lib/integrations/recordia/domain";
import { groupRecordiaTimeline } from "@/lib/integrations/recordia/timeline";

const button = "min-h-11 rounded-lg border border-zinc-400 px-4 py-2 text-sm disabled:opacity-50";
const date = (value: string) => new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const status = { observed_fact: "Registro del sistema", recorded_claim: "Declaración registrada", decision: "Decisión registrada" };
async function queryRecordia(tenantId:string,opportunityId:string,name:string,args:unknown,signal:AbortSignal) {
  const endpoint=`/api/opportunities/${encodeURIComponent(opportunityId)}/recordia/mcp`;
  let protocol="2025-11-25";
  async function rpc(method:string,params?:unknown,notification=false) {
    const response=await fetch(endpoint,{method:"POST",credentials:"same-origin",cache:"no-store",signal,
      headers:{"Content-Type":"application/json",Accept:"application/json, text/event-stream","X-Tenant-Context":tenantId,"MCP-Protocol-Version":protocol},
      body:JSON.stringify({jsonrpc:"2.0",...(notification?{}:{id:method}),method,...(params?{params}:{})})});
    if(response.status===202&&notification)return null;
    const payload=await response.json();
    if(!response.ok||payload.error)throw Error(payload.error?.message??(typeof payload.error==="string"?payload.error:"No se pudo consultar Recordia"));
    if(payload.result?.isError)throw Error(payload.result.content?.[0]?.text??"No se pudo consultar Recordia");
    return payload.result;
  }
  const initialized=await rpc("initialize",{protocolVersion:protocol,capabilities:{},clientInfo:{name:"cotiza-recordia-panel",version:"0.2.0"}});
  protocol=initialized.protocolVersion;
  await rpc("notifications/initialized",undefined,true);
  const result=await rpc("tools/call",{name,arguments:args});
  return JSON.parse(result.content[0].text);
}

const auditDate = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "medium" });

function EventTime({ value }: { value: string | null }) {
  return value ? <time title={value} dateTime={value}>{date(value)}</time> : <span>Fecha sin registrar</span>;
}

export function RecordiaContextPanel({ tenantId, opportunityId }: { tenantId: string; opportunityId: string }) {
  const [data, setData] = useState<RecordiaPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [snapshots, setSnapshots] = useState<Record<string, string>>({});
  const [verification, setVerification] = useState<{ valid: boolean; events: number; checked_at_utc: string } | null>(null);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => {
    requestId.current++;
    controller.current?.abort();
  }, [tenantId, opportunityId]);

  async function run(name: string, args: unknown, apply: (result: unknown) => void) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const sequence = ++requestId.current;
    setBusy(true);
    setError(null);
    try {
      const result = await queryRecordia(tenantId, opportunityId, name, args, abort.signal);
      if (sequence === requestId.current && !abort.signal.aborted) apply(result);
    } catch (failure) {
      if (sequence === requestId.current && !abort.signal.aborted) {
        setData(null);
        setSnapshots({});
        setVerification(null);
        setError(failure instanceof Error ? failure.message : "No se pudo consultar Recordia");
      }
    } finally {
      if (sequence === requestId.current) setBusy(false);
    }
  }

  async function read(append: boolean) {
    const previous = append ? data : null;
    if (!append) {
      setSnapshots({});
      setVerification(null);
    }
    await run("recordia_list_memories", {
      limit: 50, ...(previous?.next_cursor ? { before_event_number: previous.next_cursor } : {}),
    }, result => {
      const page = result as RecordiaPage;
      setData({ ...page, items: [...(previous?.items ?? []), ...page.items] });
    });
  }

  function evidence(item: RecordiaMemory, label = "Ver evidencia") {
    return (
      <details className="mt-2 text-sm text-zinc-700">
        <summary className="min-h-11 cursor-pointer py-3 font-medium text-violet-900">{label}</summary>
        <div className="space-y-2 border-l border-zinc-200 pl-3 text-xs">
          <p>{status[item.epistemic_status]} · Versión de registro {String(item.context.version ?? "—")}</p>
          {item.context.actor_id ? <p>Actor declarado: {String(item.context.actor_id)}</p> : null}
          <p className="break-all">{item.evidence_ids[0]}</p>
          <p>{item.recorded_at_utc} · UTC</p>
          <p className="break-all">SHA-256: {String(item.context.content_hash ?? "")}</p>
          {item.context.previous_event_id
            ? <p className="break-all">Registro anterior: {String(item.context.previous_event_id)}</p> : null}
          {item.context.preserved_before_case_link === true
            ? <p>El registro se conservó antes de que su fuente se vinculara al expediente.</p> : null}
          <button type="button" className={button} disabled={busy} onClick={() => void run(
            "recordia_get_memory", { memory_id: item.id }, result => {
              const snapshot = (result as RecordiaMemory).preserved_snapshot;
              if (snapshot) setSnapshots(previous => ({ ...previous, [item.id]: snapshot.canonical_text }));
            },
          )}>Ver registro original</button>
          {snapshots[item.id]
            ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-50 p-3">{snapshots[item.id]}</pre>
            : null}
        </div>
      </details>
    );
  }

  const timeline = groupRecordiaTimeline(data?.items ?? []);
  const mode = "min-h-11 rounded-lg border px-3 py-2 text-sm font-medium";
  const activeMode = "border-violet-200 bg-violet-50 text-violet-950";
  const inactiveMode = "border-transparent text-zinc-700 hover:bg-zinc-100";
  return (
    <section id="recordia" className="rounded-xl border border-violet-200 bg-white p-4 text-zinc-900 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Memoria Recordia</h2>
          <p className="mt-1 text-sm text-zinc-600">Premium · Piloto SynAppsSys</p>
        </div>
        <button type="button" disabled={busy} className={`${button} bg-violet-800 text-white`} onClick={() => void read(false)}>
          {data ? "Actualizar memoria" : busy ? "Consultando…" : "Consultar memoria"}
        </button>
      </div>
      <Link className="inline-flex min-h-11 items-center text-sm text-violet-900 underline" href="/recordia">Archivo de expedientes</Link>
      {error ? <p role="alert" className="mt-3 text-sm text-red-800">{error}</p> : null}
      {data ? (
        <>
          <div className="flex flex-wrap gap-1 border-b border-zinc-200 pb-2" role="group" aria-label="Vista del expediente">
            <button type="button" aria-pressed={!showAll} className={`${mode} ${!showAll ? activeMode : inactiveMode}`} onClick={() => setShowAll(false)}>
              Cronología comercial
            </button>
            <button type="button" aria-pressed={showAll} className={`${mode} ${showAll ? activeMode : inactiveMode}`} onClick={() => setShowAll(true)}>
              Registro completo
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-600">Más reciente primero · Hora de Ciudad de México</p>
          {showAll ? (
            <>
              <p className="mt-2 text-sm text-zinc-600">Incluye el estado inicial observado y las versiones técnicas conservadas.</p>
              {data.items.length ? (
                <ol aria-label="Registro completo de Recordia" className="mt-2 divide-y divide-zinc-200">
                  {data.items.map(item => (
                    <li key={item.id} className="py-3">
                      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                        <h3 className="text-sm font-semibold">{item.timeline?.title ?? item.title}</h3>
                        <span className="text-xs text-zinc-600"><EventTime value={item.recorded_at_utc} /></span>
                      </div>
                      {item.timeline?.folio ? <p className="mt-1 text-xs text-zinc-700">{item.timeline.folio}</p> : null}
                      {item.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.description}</p> : null}
                      {evidence(item)}
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-4 text-sm text-zinc-700">Este expediente aún no tiene registros.</p>}
              <button type="button" disabled={busy} className={`${button} mt-3`} onClick={() => void run(
                "recordia_verify_integrity", {}, result => setVerification(result as typeof verification),
              )}>Verificar integridad</button>
              {verification ? (
                <p role="status" className={`mt-2 text-sm ${verification.valid ? "text-emerald-900" : "text-red-800"}`}>
                  {verification.valid ? "Huellas y cadenas correctas" : "Se detectó una inconsistencia"} · {verification.events} registros revisados · {date(verification.checked_at_utc)}
                </p>
              ) : null}
            </>
          ) : timeline.length ? (
            <ol aria-label="Cronología comercial de Recordia" className="mt-3 divide-y divide-zinc-200">
              {timeline.map(({ entry, records: [item, ...otherRecords] }) => (
                <li key={item.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="font-semibold">{entry.title}</h3>
                    <span className="text-xs text-zinc-600"><EventTime value={item.recorded_at_utc} /></span>
                  </div>
                  {entry.folio || entry.detail ? (
                    <p className="mt-1 text-sm text-zinc-700">{[entry.folio, entry.detail].filter(Boolean).join(" · ")}</p>
                  ) : null}
                  {item.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.description}</p> : null}
                  {item.context.text_truncated === true ? <p className="mt-1 text-xs text-zinc-600">Nota abreviada. El texto completo está en la evidencia.</p> : null}
                  {entry.pdf ? (
                    <details className="mt-2">
                      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-violet-900">
                        {otherRecords.length ? `${otherRecords.length + 1} solicitudes de descarga registradas` : "1 solicitud de descarga registrada"}
                      </summary>
                      <ul className="space-y-1 border-l border-zinc-200 pl-3">
                        {[item, ...otherRecords].map(record => (
                          <li key={record.id}>{evidence(record, record.recorded_at_utc
                            ? auditDate.format(new Date(record.recorded_at_utc)) : "Solicitud con fecha sin registrar")}</li>
                        ))}
                      </ul>
                    </details>
                  ) : evidence(item, item.epistemic_status === "recorded_claim" ? status.recorded_claim : "Ver evidencia")}
                </li>
              ))}
            </ol>
          ) : <p className="mt-4 text-sm text-zinc-700">No hay actividad comercial en los registros cargados.</p>}
          {data.next_cursor ? (
            <button type="button" disabled={busy} className={`${button} mt-3`} onClick={() => void read(true)}>
              {busy ? "Cargando…" : "Cargar registros anteriores"}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
