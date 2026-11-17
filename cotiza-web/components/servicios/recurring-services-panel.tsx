"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { boundary, type RecurringAction, type RecurringTerms, type RecurringView, type RecurringWorkspace } from "@/lib/domain/recurring-services";
import { RecurringRenewalNotice } from "./recurring-renewal-notice";

const button="min-h-11 rounded-lg border border-zinc-400 px-4 py-2 text-sm font-semibold disabled:opacity-50";
const input="mt-1 min-h-11 w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-zinc-950 disabled:bg-zinc-100";
const status={draft:"Borrador",active:"Activo",paused:"Pausado",ended:"Terminado"};
function emptyTerms():RecurringTerms {return {title:"",clientId:null,contractKind:null,startsOn:null,endsOn:null,autoRenew:null,noticeDays:null,cadence:null,basis:null,anchorDay:null,timezone:"America/Mexico_City",dueDays:null,currency:null,effectiveFrom:null,acceptanceEvidence:"",lines:[]};}
function day(value:string) {const [y,m,d]=value.split('-');return `${d}/${m}/${y}`;}
export function RecurringServicesPanel({tenantId,initialWorkspace}:{tenantId:string;initialWorkspace?:RecurringWorkspace}) {
  const [workspace,setWorkspace]=useState<RecurringWorkspace|null>(initialWorkspace??null),[selected,setSelected]=useState<RecurringView|null>(null);
  const [terms,setTerms]=useState<RecurringTerms>(emptyTerms),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [uncertain,setUncertain]=useState(false),[notice,setNotice]=useState<string|null>(null),[clientSearch,setClientSearch]=useState('');
  const [evidence,setEvidence]=useState(''),[from,setFrom]=useState(''),[count,setCount]=useState(3);
  const requestId=useRef<string|null>(null),controller=useRef<AbortController|null>(null);
  const headers={'X-Tenant-Context':tenantId};
  const load=useCallback(async(search='',before?:string)=>{
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    setBusy(true);setError(null);
    try {
      const params=new URLSearchParams({clientSearch:search,...(before?{before}:{})});
      const response=await fetch(`/api/recurring-services?${params}`,{headers:{'X-Tenant-Context':tenantId},cache:'no-store',signal:abort.signal});
      const payload=await response.json();if(!response.ok)throw Error(payload.error??'No se pudo consultar');
      if(!abort.signal.aborted)setWorkspace(previous=>({...payload,agreements:before?[...(previous?.agreements??[]),...payload.agreements]:payload.agreements}));
    }catch(failure){if(!abort.signal.aborted){setWorkspace(null);setSelected(null);setTerms(emptyTerms());setError(failure instanceof Error?failure.message:'No se pudo consultar');}}
    finally{if(!abort.signal.aborted)setBusy(false);}
  },[tenantId]);
  useEffect(()=>{let disposed=false;queueMicrotask(()=>{if(!disposed&&!initialWorkspace)void load();});return()=>{disposed=true;controller.current?.abort();};},[load,initialWorkspace]);
  function select(agreement:RecurringView) {
    setSelected(agreement);setTerms(agreement.terms);setError(null);setNotice(null);setEvidence('');setUncertain(false);
    requestId.current=null;
    try{setFrom(agreement.periods.length?agreement.periods.at(-1)!.end:boundary(agreement.terms,0));}catch{setFrom('');}
  }
  async function act(action:RecurringAction) {
    setBusy(true);setError(null);setNotice(null);
    try {
      const response=await fetch('/api/recurring-services',{method:'POST',credentials:'same-origin',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(action)});
      const result=await response.json();
      if(!response.ok) {if(response.status>=500)setUncertain(true);if([401,403,404].includes(response.status)){setWorkspace(null);setSelected(null);setTerms(emptyTerms());}throw Error(result.error??'No se pudo confirmar');}
      const agreement=result.agreement as RecurringView;
      select(agreement);setWorkspace(old=>old?{...old,agreements:[agreement,...old.agreements.filter(a=>a.id!==agreement.id)]}:old);
      setNotice(action.action==='generate'?'Periodos registrados; no se emitieron facturas.':'Acuerdo guardado.');
    }catch(failure){setError(failure instanceof Error?failure.message:'No se pudo confirmar');if(!(failure instanceof Error)||failure instanceof TypeError||failure instanceof SyntaxError)setUncertain(true);}
    finally{setBusy(false);}
  }
  async function recover() {
    setBusy(true);setError(null);
    try {
      const url=selected?`/api/recurring-services/${selected.id}`:`/api/recurring-services?requestId=${requestId.current??''}`;
      const response=await fetch(url,{headers,cache:'no-store'}),data=await response.json();
      if(!response.ok){if([401,403,404].includes(response.status)){setWorkspace(null);setSelected(null);setTerms(emptyTerms());}throw Error(data.error??'No se pudo consultar el resultado');}
      if(data.agreement){select(data.agreement);setWorkspace(old=>old?{...old,agreements:[data.agreement,...old.agreements.filter(a=>a.id!==data.agreement.id)]}:old);}
      else {setUncertain(false);setNotice('Alta aún no localizada. Puedes reintentar con la misma clave y contenido.');}
    }catch(failure){setError(failure instanceof Error?failure.message:'Consulta pendiente');}
    finally{setBusy(false);}
  }
  function field<K extends keyof RecurringTerms>(key:K,value:RecurringTerms[K]) {setTerms(t=>({...t,[key]:value}));}
  function save() {
    if(selected)void act({action:'revise',id:selected.id,expectedRevision:selected.revision,terms});
    else {requestId.current??=crypto.randomUUID();void act({action:'create',requestId:requestId.current,terms});}
  }
  const locked=busy||uncertain||selected?.status==='ended';
  const dirty=selected!==null && JSON.stringify(terms)!==JSON.stringify(selected.terms);
  return <div className="space-y-6 text-zinc-950">
    <header><h1 className="text-2xl font-bold">Servicios recurrentes</h1><p className="mt-2 text-zinc-700">Acuerdos, condiciones y periodos por cliente. Piloto SynAppsSys.</p>
      <p className="mt-2 rounded-lg border border-indigo-300 bg-indigo-50 p-3 text-sm">Esta etapa organiza el servicio y su calendario. La emisión de facturas, los pagos y los envíos se revisan por separado.</p></header>
    {error?<p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3">{error}</p>:null}
    {notice?<p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">{notice}</p>:null}
    {uncertain?<button disabled={busy} className={button} onClick={()=>void recover()}>Consultar resultado antes de continuar</button>:null}
    <section aria-label="Cartera" className="rounded-xl border border-zinc-300 bg-white p-4">
      <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-semibold">Acuerdos registrados</h2><button className={button} disabled={busy||uncertain} onClick={()=>{setSelected(null);setTerms(emptyTerms());setError(null);setNotice(null);setEvidence('');setFrom('');requestId.current=null;}}>Nuevo acuerdo</button></div>
      <p className="mt-2 text-sm text-zinc-700">Avisos sobre la vigencia del contrato y su preaviso. Revisa por separado la cobertura de licencias, la facturación y los pagos.</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">{workspace?.agreements.map(a=><li key={a.id} className="min-w-0 rounded-lg border border-zinc-300 p-3"><p className="font-semibold break-words">{a.number} · {a.terms.title}</p><p className="text-sm">{status[a.status]} · {a.terms.currency??'Moneda pendiente'} · {a.missing.length} datos por completar</p><RecurringRenewalNotice review={a.renewalReview}/><button className={`${button} mt-2`} disabled={busy||uncertain} onClick={()=>select(a)}>Abrir acuerdo</button></li>)}</ul>
      {workspace?.agreements.length===0?<p className="mt-3">Aún no hay acuerdos. Puedes comenzar con un borrador y completar sus condiciones.</p>:null}
      {workspace?.hasMore?<button className={`${button} mt-3`} disabled={busy} onClick={()=>void load(clientSearch,workspace.agreements.at(-1)?.number)}>Ver más acuerdos</button>:null}
    </section>
    <section className="rounded-xl border border-zinc-300 bg-white p-4">
      <h2 className="text-xl font-semibold">{selected?`${selected.number} · ${status[selected.status]}`:'Alta de acuerdo'}</h2>
      {selected?<><RecurringRenewalNotice review={selected.renewalReview}/>{selected.terms.clientId?<Link className="mt-2 inline-flex min-h-11 items-center text-sm text-blue-800 underline" href={`/clientes/${encodeURIComponent(selected.terms.clientId)}`}>Ver ficha del cliente</Link>:null}</>:null}
      <p className="mt-1 text-sm text-zinc-700">Guardar conserva una revisión. Activar requiere condiciones completas y aceptación documentada.</p>
      <form onSubmit={e=>{e.preventDefault();save();}} className="mt-4 space-y-4">
        <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 font-semibold">Cliente y contratación</legend>
          <label>Nombre del servicio<input required minLength={3} maxLength={150} className={input} value={terms.title} onChange={e=>field('title',e.target.value)}/></label>
          <label>Buscar cliente<input className={input} value={clientSearch} onChange={e=>setClientSearch(e.target.value)}/><button type="button" className={`${button} mt-1`} onClick={()=>void load(clientSearch)}>Buscar en mi empresa</button></label>
          <label>Cliente<select aria-label="Cliente" className={input} value={terms.clientId??''} onChange={e=>field('clientId',e.target.value||null)}><option value="">Pendiente de seleccionar</option>{terms.clientId&&!workspace?.clients.some(c=>c.id===terms.clientId)?<option value={terms.clientId}>Cliente del acuerdo · {terms.clientId}</option>:null}{workspace?.clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <p className="self-end text-sm">{workspace?.clientsTruncated?'Se muestran 50 clientes; afina la búsqueda. ':''}<Link className="inline-flex min-h-11 items-center text-blue-800 underline" href="/configuracion/clientes">Dar de alta o revisar clientes</Link></p>
          <label>Modalidad<select aria-label="Modalidad" className={input} value={terms.contractKind??''} onChange={e=>field('contractKind',(e.target.value||null) as RecurringTerms['contractKind'])}><option value="">Pendiente</option><option value="month_to_month">Mes a mes</option><option value="fixed_term">Plazo fijo</option></select></label>
          <label>Renovación pactada<select aria-label="Renovación pactada" className={input} value={terms.autoRenew===null?'':String(terms.autoRenew)} onChange={e=>field('autoRenew',e.target.value===''?null:e.target.value==='true')}><option value="">Pendiente</option><option value="false">Sin renovación automática</option><option value="true">Renovación automática pactada</option></select></label>
          {([['startsOn','Inicio del contrato'],['endsOn','Fin exclusivo (primer día fuera del contrato)'],['effectiveFrom','Condiciones vigentes desde']] as const).map(([key,label])=><label key={key}>{label}<input type="date" className={input} value={terms[key]??''} onChange={e=>field(key,e.target.value||null)}/></label>)}
          <label>Preaviso en días<input type="number" min={0} max={365} className={input} value={terms.noticeDays??''} onChange={e=>field('noticeDays',e.target.value===''?null:Number(e.target.value))}/></label>
        </fieldset>
        <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 font-semibold">Facturación pactada</legend>
          <label>Frecuencia<select aria-label="Frecuencia" className={input} value={terms.cadence??''} onChange={e=>field('cadence',(e.target.value||null) as RecurringTerms['cadence'])}><option value="">Pendiente</option><option value="monthly">Mensual</option><option value="quarterly">Trimestral</option><option value="annual">Anual</option></select></label>
          <label>Momento del cobro<select aria-label="Momento del cobro" className={input} value={terms.basis??''} onChange={e=>field('basis',(e.target.value||null) as RecurringTerms['basis'])}><option value="">Pendiente</option><option value="advance">Por adelantado</option><option value="arrears">Periodo vencido</option></select></label>
          <label>Día ancla<input type="number" min={1} max={31} className={input} value={terms.anchorDay??''} onChange={e=>field('anchorDay',e.target.value===''?null:Number(e.target.value))}/></label>
          <label>Zona horaria<input className={input} value={terms.timezone} onChange={e=>field('timezone',e.target.value)}/></label>
          <label>Días de pago desde preparación<input type="number" min={0} max={365} className={input} value={terms.dueDays??''} onChange={e=>field('dueDays',e.target.value===''?null:Number(e.target.value))}/></label>
          <label>Moneda<select aria-label="Moneda" className={input} value={terms.currency??''} onChange={e=>field('currency',(e.target.value||null) as RecurringTerms['currency'])}><option value="">Pendiente</option>{['MXN','USD','EUR'].map(c=><option key={c}>{c}</option>)}</select></label>
        </fieldset>
        <fieldset disabled={locked}><legend className="font-semibold">Partidas por periodo · precio antes de impuestos</legend>
          {terms.lines.map((l,i)=><div key={l.lineId} className="mt-3 grid gap-3 rounded-lg border border-zinc-300 p-3 sm:grid-cols-2">
            {(['description','sku','quantity','unitPrice'] as const).map(k=><label key={k}>{({description:'Descripción',sku:'SKU opcional',quantity:'Cantidad',unitPrice:'Precio unitario'})[k]}<input className={input} inputMode={['quantity','unitPrice'].includes(k)?'decimal':'text'} value={l[k]??''} onChange={e=>field('lines',terms.lines.map((line,j)=>i===j?{...line,[k]:e.target.value===''&&k!=='description'?null:e.target.value}:line))}/></label>)}
            <button type="button" className={button} onClick={()=>field('lines',terms.lines.filter((_,j)=>j!==i))}>Quitar partida {i+1}</button>
          </div>)}
          <button type="button" className={`${button} mt-3`} disabled={terms.lines.length>=50} onClick={()=>field('lines',[...terms.lines,{lineId:crypto.randomUUID(),description:'',sku:null,quantity:null,unitPrice:null}])}>Agregar partida</button>
        </fieldset>
        <label className="block">Referencia de aceptación o contratación<textarea className={input} rows={3} maxLength={2000} value={terms.acceptanceEvidence} disabled={locked} onChange={e=>field('acceptanceEvidence',e.target.value)}/></label>
        <button disabled={locked||!workspace} className={`${button} bg-zinc-900 text-white`}>{selected?.status==='active'||selected?.status==='paused'?'Guardar revisión futura':'Guardar borrador'}</button>
      </form>
      {selected?.missing.length?<p className="mt-3 text-sm text-amber-950">Para activar falta: {selected.missing.join(', ')}.</p>:null}
      {dirty?<p className="mt-3 text-sm text-amber-950">Guarda los cambios antes de decidir o registrar periodos.</p>:null}
      {selected&&selected.status!=='ended'?<fieldset disabled={busy||uncertain||dirty} className="mt-5 space-y-3 border-t border-zinc-300 pt-4"><legend className="font-semibold">Decisión explícita sobre el acuerdo guardado</legend>
        <label className="block">Motivo y evidencia de esta decisión<input className={input} value={evidence} maxLength={2000} onChange={e=>setEvidence(e.target.value)}/></label>
        <div className="flex flex-wrap gap-3">{(selected.status==='draft'?['activate','end']:selected.status==='active'?['pause','end']:['resume','end']).map(action=><button key={action} className={button} disabled={evidence.trim().length<3} onClick={()=>void act(action==='resume'?{action:'resume',id:selected.id,expectedRevision:selected.revision,resumeOn:from,evidence}:{action:action as 'activate'|'pause'|'end',id:selected.id,expectedRevision:selected.revision,evidence})}>{({activate:'Activar con evidencia',pause:'Pausar',resume:'Reanudar desde fecha seleccionada',end:'Terminar acuerdo'})[action]}</button>)}</div>
      </fieldset>:null}
    </section>
    {selected?<section className="rounded-xl border border-zinc-300 bg-white p-4"><h2 className="text-xl font-semibold">Calendario del acuerdo guardado</h2>
      <p className="mt-1 text-sm text-zinc-700">Fechas en {selected.terms.timezone}. Sólo periodos completos; día 31 se ajusta al fin de mes sin cambiar el ancla.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3"><label>Inicio de periodo o reanudación<input type="date" className={input} value={from} disabled={busy||uncertain} onChange={e=>setFrom(e.target.value)}/></label><label>Número de periodos<input type="number" min={1} max={24} className={input} value={count} disabled={busy||uncertain} onChange={e=>setCount(Number(e.target.value))}/></label><button className={button} disabled={busy||uncertain||dirty||selected.status!=='active'} onClick={()=>void act({action:'generate',id:selected.id,expectedRevision:selected.revision,from,count})}>Registrar periodos</button></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left">Periodos planeados · no son facturas ni pagos · últimos 120</caption><thead><tr>{['Inicio','Fin exclusivo','Preparar','Pago esperado','Revisión'].map(t=><th className="p-2" key={t} scope="col">{t}</th>)}</tr></thead><tbody>{selected.periods.map(period=><tr className="border-t border-zinc-200" key={period.start}><td className="p-2 whitespace-nowrap">{day(period.start)}</td><td className="p-2 whitespace-nowrap">{day(period.end)}</td><td className="p-2 whitespace-nowrap">{day(period.prepareOn)}</td><td className="p-2 whitespace-nowrap">{day(period.dueOn)}</td><td className="p-2">{period.termsRevision}</td></tr>)}</tbody></table></div>
      {selected.periods.length===0?<p className="mt-2">Todavía no hay periodos registrados.</p>:null}
    </section>:null}
  </div>;
}
