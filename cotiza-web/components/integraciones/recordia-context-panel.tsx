"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RecordiaMemory, RecordiaPage } from "@/lib/integrations/recordia/domain";

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
export function RecordiaContextPanel({ tenantId, opportunityId }: { tenantId: string; opportunityId: string }) {
  const [data,setData]=useState<RecordiaPage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [snapshots,setSnapshots]=useState<Record<string,string>>({});
  const [verification,setVerification]=useState<{valid:boolean;events:number;checked_at_utc:string}|null>(null);
  const requestId=useRef(0),controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>{requestId.current++;controller.current?.abort();},[tenantId,opportunityId]);
  async function run(name:string,args:unknown,apply:(result:unknown)=>void) {
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    const sequence=++requestId.current;setBusy(true);setError(null);
    try {const result=await queryRecordia(tenantId,opportunityId,name,args,abort.signal);
      if(sequence===requestId.current&&!abort.signal.aborted)apply(result);
    }catch(failure){if(sequence===requestId.current&&!abort.signal.aborted){setData(null);setSnapshots({});setVerification(null);
      setError(failure instanceof Error?failure.message:"No se pudo consultar Recordia");}}
    finally{if(sequence===requestId.current)setBusy(false);}
  }
  async function read(append:boolean) {
    const previous=append?data:null;
    setData(null);if(!append){setSnapshots({});setVerification(null);}
    await run("recordia_list_memories",{limit:50,...(append&&data?.next_cursor?{before_event_number:data.next_cursor}:{})},result=>{
      const page=result as RecordiaPage;setData({...page,items:[...(previous?.items??[]),...page.items]});
    });
  }
  return <section id="recordia" className="rounded-xl border border-violet-300 bg-white p-5 text-zinc-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Memoria persistente Recordia</h2>
      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-900">Premium · Piloto SynAppsSys</span></div>
    <p className="mt-2 text-sm text-zinc-600">Versiones conservadas automáticamente al cambiar los registros, incluso si la fuente original se elimina.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" disabled={busy} className={button} onClick={()=>void read(false)}>{busy?"Consultando…":data?"Actualizar memoria":"Consultar memoria"}</button>
      <Link className="inline-flex min-h-11 items-center text-sm text-blue-800 underline" href="/recordia">Abrir archivo de expedientes</Link>
      {data?<button type="button" disabled={busy} className={button} onClick={()=>void run("recordia_verify_integrity",{},result=>setVerification(result as typeof verification))}>Verificar integridad</button>:null}</div>
    {error?<p role="alert" className="mt-3 text-sm text-red-800">{error}</p>:null}
    {verification?<p role="status" className={`mt-3 text-sm ${verification.valid?"text-emerald-900":"text-red-800"}`}>{verification.valid?"Huellas y cadenas de versiones correctas":"Se detectó una inconsistencia"} · {verification.events} registros comprobados · {date(verification.checked_at_utc)}. La comprobación corresponde al archivo Recordia; no certifica documentos externos.</p>:null}
    {data?<>
      <p className="mt-3 text-xs text-zinc-600">Consultado: {date(data.captured_at_utc)} · Horario de Ciudad de México. Las fechas de conservación permanecen en UTC.</p>
      <p className="mt-2 text-sm text-zinc-600">El estado inicial muestra lo observado al activar la captura. No reconstruye cambios anteriores. Las notas conservan declaraciones y los autores desconocidos se indican expresamente.</p>
      {!data.items.length?<p className="mt-3 text-sm">No hay registros conservados para esta oportunidad.</p>:null}
      <ol aria-label="Historia comercial Recordia" className="mt-4 space-y-3">{data.items.map(item=><li key={item.id} className="rounded-lg border border-zinc-200 p-3">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{item.title}</h3>{item.recorded_at_utc?<time title={item.recorded_at_utc} dateTime={item.recorded_at_utc} className="text-xs text-zinc-600">{date(item.recorded_at_utc)}</time>:<span>Fecha sin registrar</span>}</div>
        <p className="mt-1 text-xs text-violet-900">{status[item.epistemic_status]} · Versión Recordia {String(item.context.version??"—")}</p>
        <p className="mt-1 text-xs text-zinc-600">{item.context.actor_id?`Actor declarado: ${String(item.context.actor_id)}`:"Autor del cambio no registrado"}</p>
        {item.context.preserved_before_case_link===true?<p className="mt-1 text-xs text-zinc-600">Versión conservada antes de que esta fuente quedara vinculada al expediente.</p>:null}
        {item.description?<p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.description}</p>:null}
        {Boolean(item.context.folio)?<p className="mt-1 text-sm">Folio: {String(item.context.folio)}</p>:null}
        {Boolean(item.context.decision)?<p className="mt-1 text-sm">Decisión: {String(item.context.decision)}</p>:null}
        {item.context.text_truncated===true?<p className="mt-1 text-xs text-amber-900">Nota abreviada en esta vista; el archivo conserva el texto capturado completo.</p>:null}
        <button type="button" className={`${button} mt-2`} disabled={busy} onClick={()=>void run("recordia_get_memory",{memory_id:item.id},result=>{
          const memory=result as RecordiaMemory;if(memory.preserved_snapshot)setSnapshots(prev=>({...prev,[item.id]:memory.preserved_snapshot!.canonical_text}));
        })}>Ver versión conservada</button>
        {snapshots[item.id]?<pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-50 p-3 text-xs">{snapshots[item.id]}</pre>:null}
        <details className="mt-1 text-xs text-zinc-600"><summary className="min-h-11 cursor-pointer py-3">Referencia, huella y fecha UTC</summary>
          <p className="break-all">{item.evidence_ids[0]}</p><p>{item.recorded_at_utc}</p><p className="break-all">SHA-256: {String(item.context.content_hash??"")}</p>
          {item.context.previous_event_id?<p className="break-all">Versión anterior: {String(item.context.previous_event_id)}</p>:null}
        </details>
      </li>)}</ol>
      {data.next_cursor?<button type="button" disabled={busy} onClick={()=>void read(true)} className={`${button} mt-3`}>Ver registros anteriores</button>:null}
    </>:null}
  </section>;
}
