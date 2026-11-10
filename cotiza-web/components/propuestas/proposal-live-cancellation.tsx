'use client';
import {useEffect,useRef,useState} from 'react';
import type {LiveCancellation, BillingCancellation} from '@/lib/integrations/digestor-fiscal';

type State = LiveCancellation & {enabled:boolean};
import { CANCELLATION_LABELS as labels, ProposalFiscalEvidence } from './proposal-fiscal-evidence';

export function ProposalLiveCancellation({proposalId,uuid,onStatusChange}:{proposalId:string;uuid:string;onStatusChange?:(status:BillingCancellation['status'])=>void}) {
  const [data,setData] = useState<State|null>(null), [consent,setConsent] = useState(false);
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const active = useRef(false);
  const path = `/api/proposals/${proposalId}/invoice/production-cancellation`;
  useEffect(()=>{if(data?.enabled)onStatusChange?.(data.status);},[data?.enabled,data?.status,onStatusChange]);
  useEffect(()=>{let closed=false;fetch(path,{cache:'no-store'}).then(async r=>{
    if(!r.ok)throw Error('No se pudo consultar el estado fiscal; no se confirma su vigencia ni cancelación.');
    const result=await r.json() as State;if(!closed)setData(result);
  }).catch(()=>{if(!closed)setError('No se pudo consultar el estado fiscal; no se confirma su vigencia ni cancelación.');});return ()=>{closed=true;};},[path]);
  async function act(operation:'submit'|'reconcile') {
    if(active.current || (operation==='submit'&&!consent))return;
    active.current=true;setBusy(true);setError('');setConsent(false);
    try {
      const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(operation==='submit'?{operation,confirm:true}:{operation})});
      const result=await r.json() as State & {error?:string};
      if(!r.ok)throw Error(result.error??'Resultado sin confirmar; consulta el estado');
      setData(result);
    }catch(e){setError(e instanceof Error?e.message:'Resultado sin confirmar');
      // A lost response must lead to status consultation, never automatic reissue.
      setData(d=>d?{...d,status:d.status==='not_requested'?'unknown':d.status}:d);
    }finally{active.current=false;setBusy(false);}
  }
  if(!data?.enabled)return error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null;
  return <section className="mt-4 rounded-lg border border-amber-300 bg-white p-4" aria-label="Cancelación fiscal">
    <h3 className="font-semibold">Estado fiscal: {labels[data.status]}</h3>
    <p className="mt-1 text-sm">UUID: {uuid}</p>
    <ProposalFiscalEvidence evidence={data}/>
    {data.status==='not_requested'?<>
      <p className="mt-2 text-sm">Motivo 03: No se llevó a cabo la operación. Esta acción solicita cancelar una factura fiscal real.</p>
      <label className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>Confirmo la cancelación de este UUID y el motivo indicado.</label>
      <button type="button" disabled={!consent||busy} onClick={()=>act('submit')} className="mt-3 rounded-lg bg-rose-700 px-4 py-2 text-sm text-white disabled:opacity-40">{busy?'Procesando…':'Solicitar cancelación al PAC'}</button>
    </>:null}
    {data.status!=='cancelled'&&data.status!=='not_requested'?<button type="button" disabled={busy} onClick={()=>act('reconcile')} className="mt-3 rounded-lg border px-4 py-2 text-sm">{busy?'Consultando…':'Consultar estado mediante el servicio fiscal'}</button>:null}
    {data.acknowledgement_xml?<details className="mt-3 text-sm"><summary>Acuse recibido</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">{data.acknowledgement_xml}</pre></details>:null}
    <p className="mt-2 text-xs text-zinc-600">El XML original y la historia comercial se conservan. El acuse del PAC no sustituye la confirmación de cancelación del SAT.</p>
    {error?<p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>:null}
  </section>;
}
