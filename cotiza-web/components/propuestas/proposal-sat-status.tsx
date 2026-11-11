'use client';
import {useEffect,useRef,useState} from 'react';
import type {SatTracking} from '@/lib/integrations/digestor-fiscal';
function date(value:string|null){
 const d=value?new Date(value):null;
 return d && Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'}).format(d)+' · Ciudad de México' : 'Fecha no disponible';
}
export function ProposalSatStatus({proposalId,uuid,paymentId}:{proposalId:string;uuid:string;paymentId?:string}){
 const base=`/api/proposals/${encodeURIComponent(proposalId)}/invoice`;
 const path=(paymentId?`${base}/payments/${encodeURIComponent(paymentId)}/receipt/sat-status`:`${base}/sat-status`)+`?expected_uuid=${encodeURIComponent(uuid.toLowerCase())}`;
 const [data,setData]=useState<SatTracking|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const active=useRef(false),controller=useRef<AbortController|null>(null);
 useEffect(()=>{
  const abort=new AbortController();
  fetch(path,{cache:'no-store',signal:abort.signal}).then(async r=>{
   const value=await r.json();if(!r.ok)throw Error(value.error??'No se pudo leer el historial SAT');
   if(value.document_uuid?.toLowerCase()!==uuid.toLowerCase() || !Array.isArray(value.history))throw Error('La evidencia no corresponde al UUID seleccionado');
   if(!abort.signal.aborted)setData(value);
  }).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Consulta no disponible');});
  return ()=>{abort.abort();controller.current?.abort();};
 },[path,uuid]);
 async function load(consult:boolean,enabled?:boolean){
  if(active.current)return;active.current=true;setBusy(true);setError('');
  const abort=new AbortController();controller.current=abort;
  const timeout=setTimeout(()=>abort.abort(),60_000);
  try{
   const scheduling=enabled!==undefined;
   const target=scheduling?path.replace('?','/schedule?'):path;
   const r=await fetch(target,{method:consult||scheduling?'POST':'GET',cache:'no-store',signal:abort.signal,
    ...(scheduling?{headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})}:{})});
   const value=await r.json();if(!r.ok)throw Error(value.error??'Consulta SAT sin confirmar');
   if(value.document_uuid?.toLowerCase()!==uuid.toLowerCase() || !Array.isArray(value.history))throw Error('La evidencia no corresponde al UUID seleccionado');
   if(!abort.signal.aborted)setData(value);
  }catch(e){setError(abort.signal.aborted?'La consulta no se confirmó a tiempo. Actualiza el historial antes de consultar de nuevo.':e instanceof Error?e.message:'Consulta no disponible');}
  finally{clearTimeout(timeout);active.current=false;setBusy(false);}
 }
 return <section aria-label={`Seguimiento SAT ${uuid}`} className="mt-3 rounded border border-zinc-300 bg-white p-3 text-zinc-900">
  <h4 className="font-medium">Seguimiento SAT · {paymentId?'complemento de pago':'factura'}</h4>
  <p className="mt-1 break-all text-xs">UUID consultado: {uuid}</p>
  <p className="mt-1 text-xs text-zinc-600">La consulta conserva evidencia; no emite, cancela ni modifica pagos o estados internos.</p>
  <div className="mt-2 flex flex-wrap gap-2">
   <button type="button" disabled={busy} onClick={()=>void load(true)} className="rounded border border-blue-600 px-3 py-2 text-sm disabled:opacity-50">{busy?'Consultando…':'Consultar estado en SAT'}</button>
   <button type="button" disabled={busy} onClick={()=>void load(false)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Actualizar historial sin consultar SAT</button>
  </div>
  {busy?<p role="status" className="mt-2 text-xs">Esperando respuesta del servicio fiscal…</p>:null}
  {error?<p role="alert" className="mt-2 text-sm text-rose-800">{error}</p>:null}
  {data?.schedule && (data.schedule.available || data.schedule.enabled || data.schedule.last_outcome)?<div className="mt-3 rounded border border-zinc-200 p-3 text-sm">
   <p className="font-medium">Seguimiento automático: {data.schedule.running?'activo':'pausado'}</p>
   {data.schedule.running?<p className="mt-1 text-xs">Revisión cada {data.schedule.interval_seconds/3600} horas · Próxima revisión: {date(data.schedule.next_check_at)}</p>:null}
   {data.schedule.enabled && !data.schedule.available?<p className="mt-1 text-xs">El seguimiento está pausado por la configuración de la empresa.</p>:null}
   {data.schedule.last_outcome==='document_changed'?<p className="mt-1 text-xs text-amber-900">Se pausó porque cambió el documento o su evidencia. Revisa el expediente antes de activarlo de nuevo.</p>:null}
   {data.schedule.failures>0?<p className="mt-1 text-xs text-amber-900">El último intento automático falló. Se reintentará con espera progresiva; se conserva la última respuesta SAT.</p>:null}
   {data.schedule.can_manage && (data.schedule.available || data.schedule.enabled)?<button type="button" disabled={busy} onClick={()=>void load(false,!data.schedule!.enabled)} className="mt-2 rounded border border-blue-600 px-3 py-2 text-sm disabled:opacity-50">{data.schedule.enabled?'Pausar seguimiento automático':'Activar seguimiento automático'}</button>:null}
  </div>:null}
  {data?.latest_attempt?.outcome==='query_failed'?<p role="alert" className="mt-2 text-sm text-amber-900">Consulta fallida · {date(data.latest_attempt.checked_at)}. {data.latest_attempt.error}</p>:null}
  {data?.last_answer?<div className="mt-2 text-sm"><p>Última respuesta conservada: <strong>{data.last_answer.response?.Estado}</strong></p>
   <p className="text-xs">Fuente: {data.last_answer.source} · {date(data.last_answer.checked_at)}</p>
   {data.last_answer.response?.EstatusCancelacion?<p className="text-xs">Solicitud de cancelación: {data.last_answer.response.EstatusCancelacion}</p>:null}
   {data.last_answer.response?.Estado==='No localizado'?<p className="text-xs">El SAT respondió no localizado en esta consulta; no acredita una cancelación.</p>:null}
  </div>:data?<p className="mt-2 text-xs">Sin respuesta SAT conservada para este UUID.</p>:null}
  {data?.cached?<p className="mt-1 text-xs text-zinc-600">Se muestra la consulta reciente para evitar solicitudes repetidas.</p>:null}
  {data?.history.length?<details className="mt-2 text-xs"><summary>Consultas recientes ({data.history.length})</summary><ol className="mt-2 space-y-2">{data.history.map(row=><li key={row.id} className="rounded border p-2">{row.outcome==='query_failed'?'Consulta fallida':row.response?.Estado} · {date(row.checked_at)} · {row.source}{row.trigger==='scheduled'?' · Automática':row.trigger==='manual'?' · Manual':''}</li>)}</ol></details>:null}
 </section>;
}
