"use client";
import { CustomerEmailSummary } from "@/components/propuestas/customer-email-summary";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProcurementAction, ProcurementDraft, ProcurementView } from "@/lib/domain/procurement-draft";
function money(value:number,currency:string){return new Intl.NumberFormat("es-MX",{style:"currency",currency}).format(value);}
export function ProcurementDraftPanel({tenantId,proposalId}:{tenantId:string;proposalId:string}) {
  const [view,setView]=useState<ProcurementView|null>(null),[error,setError]=useState<string|null>(null);
  const [reload,setReload]=useState(0),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
  const [edits,setEdits]=useState<Record<string,{notes:string;neededOn:string}>>({});
  const path=`/api/proposals/${encodeURIComponent(proposalId)}/procurement`;
  useEffect(()=>{
    const controller=new AbortController();
    fetch(path,{cache:"no-store",signal:controller.signal}).then(async response=>{
      const body=await response.json(); if(!response.ok)throw Error(body.error??"No se pudo consultar Compras");
      if(body.tenantId!==tenantId||body.proposalId!==proposalId)throw Error("La empresa o propuesta activa cambió. Recupera el estado.");
      if(!controller.signal.aborted){setView(body);setUncertain(false);setError(null);setEdits({});}
    }).catch(err=>{if(!controller.signal.aborted)setError(err instanceof Error?err.message:"No se pudo consultar Compras");});
    return()=>controller.abort();
  },[path,tenantId,proposalId,reload]);
  async function submit(input:ProcurementAction) {
    if(busy||uncertain||!view)return; setBusy(true);setError(null);
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
    try {
      const response=await fetch(path,{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json","X-Tenant-Context":tenantId},body:JSON.stringify(input)});
      const body=await response.json();if(!response.ok)throw Error(body.error??"No se pudo guardar");
      if(body.tenantId!==tenantId||body.proposalId!==proposalId)throw Error("La empresa o propuesta activa cambió. Recupera el estado.");
      setView(body);setEdits({});
    }catch(err){setError(err instanceof Error?err.message:"No se pudo confirmar el guardado");setUncertain(true);}
    finally{clearTimeout(timeout);setBusy(false);}
  }
  function edit(draft:ProcurementDraft){return edits[draft.id]??{notes:draft.notes,neededOn:draft.neededOn??""};}
  const disabled=busy||uncertain;
  return <section aria-label="Requisición de compras" className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900 sm:p-6">
    <h1 className="text-2xl font-semibold">Requisición de compras</h1>
    <p className="text-sm text-zinc-700">Borrador interno ligado a la propuesta ganada y sus autorizaciones. Pendiente de revisión por Compras.</p>
    {!view&&!error?<p role="status">Consultando el cierre y sus requisiciones…</p>:null}
    {view?.reason?<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{view.reason}</p>:null}
    {view?.canPrepare?<button type="button" disabled={disabled} onClick={()=>void submit({action:"prepare",expectedWinRevision:view.winRevision!,expectedFingerprint:view.fingerprint!})}
      className="min-h-11 rounded-lg bg-blue-800 px-4 py-2 font-medium text-white disabled:opacity-50">Preparar requisición en borrador</button>:null}
    {view?.drafts.map(draft=>{
      const fields=edit(draft),editable=draft.current&&draft.state==="draft"&&!disabled;
      return <article key={draft.id} className="min-w-0 space-y-3 rounded-xl border border-zinc-300 p-3 sm:p-4">
        <h2 className="text-lg font-semibold">{draft.folio} · {draft.current?"Borrador":"Requiere revisión"}</h2>
        <p className="break-words text-sm">{draft.basis.customer} · {draft.basis.proposalNumber} · {draft.basis.currency}</p>
        <p className="text-sm text-zinc-600">Preparada {new Date(draft.createdAt).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}. Revisión {draft.revision}.</p>
        {!draft.current?<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">El cierre requiere revisión. Se conserva la versión que dio origen a esta requisición.</p>:null}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left font-medium">Partidas de la versión aprobada · costos estimados</caption>
          <thead><tr>{["SKU","Partida","Cantidad","Costo unitario","Importe"].map(label=><th key={label} className="border-b p-2">{label}</th>)}</tr></thead>
          <tbody>{draft.basis.items.map(item=><tr key={item.itemId}><td className="border-b p-2">{item.sku??"—"}</td><td className="min-w-44 max-w-lg break-words border-b p-2">{item.description}</td>
            <td className="border-b p-2">{item.quantity}</td><td className="whitespace-nowrap border-b p-2">{money(item.costUnit,draft.basis.currency)}</td><td className="whitespace-nowrap border-b p-2">{money(item.subtotalCost,draft.basis.currency)}</td></tr>)}</tbody></table></div>
        <p className="font-semibold">Costo estimado: {money(draft.basis.items.reduce((sum,item)=>sum+item.subtotalCost,0),draft.basis.currency)}</p>
        <details className="rounded-lg bg-zinc-50 p-3 text-sm"><summary className="min-h-11 cursor-pointer py-2 font-medium">Origen y autorizaciones</summary>
          <p>Aceptación: {new Date(draft.basis.acceptedAt).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}.</p>
          <p>Consolidación: {new Date(draft.basis.consolidatedAt).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}. Política aplicada: revisión {draft.basis.policyRevision}.</p>
          <p className="mt-2 whitespace-pre-wrap">{draft.basis.acceptanceEvidence}</p>
          {draft.basis.customerConfirmation ? <p className="mt-2">Confirmó: {draft.basis.customerConfirmation.confirmedBy}{draft.basis.customerConfirmation.contact ? ` · ${draft.basis.customerConfirmation.contact}` : ""}.</p> : null}
          {draft.basis.customerConfirmation?.email ? <CustomerEmailSummary email={draft.basis.customerConfirmation.email} /> : null}
          {draft.basis.customerConfirmation?.attachment ? <a className="mt-2 inline-block break-all font-medium text-blue-800 underline" href={`/api/proposals/${encodeURIComponent(proposalId)}/consolidation/evidence/${encodeURIComponent(draft.basis.customerConfirmation.attachment.id)}`}>Descargar respaldo del cliente: {draft.basis.customerConfirmation.attachment.filename}</a> : null}
          <ul className="mt-2 space-y-1">{draft.basis.approvals.map(approval=><li key={approval.ruleId}>{approval.label}: {approval.decision==="approved"?"OK":"Excepción autorizada"} · {approval.evidence}</li>)}</ul>
          <p className="mt-2 whitespace-pre-wrap">Condiciones: {draft.basis.terms||"Sin condiciones adicionales registradas."}</p>
        </details>
        <form className="space-y-3" onSubmit={event=>{event.preventDefault();void submit({action:"update",draftId:draft.id,expectedRevision:draft.revision,notes:fields.notes,neededOn:fields.neededOn||null});}}>
          <label className="block text-sm font-medium">Fecha requerida · {draft.folio}<input type="date" disabled={!editable} value={fields.neededOn}
            onChange={event=>setEdits({...edits,[draft.id]:{...fields,neededOn:event.target.value}})} className="mt-1 block max-w-full rounded-lg border border-zinc-400 p-2" /></label>
          <label className="block text-sm font-medium">Observaciones para Compras · {draft.folio}<textarea maxLength={4000} disabled={!editable} value={fields.notes}
            onChange={event=>setEdits({...edits,[draft.id]:{...fields,notes:event.target.value}})} className="mt-1 block w-full rounded-lg border border-zinc-400 p-2" /></label>
          <button disabled={!editable} className="min-h-11 rounded-lg border border-zinc-400 px-4 py-2 font-medium disabled:opacity-50">Guardar preparación · {draft.folio}</button>
        </form>
        <a className="inline-block min-h-11 py-2 text-sm font-medium text-blue-800 underline" href={`${path}?downloadDraft=${encodeURIComponent(draft.id)}`}>Descargar borrador JSON · {draft.folio}</a>
      </article>;
    })}
    {error?<p role="alert" className="text-sm text-rose-800">{error}</p>:null}
    {uncertain?<p className="text-sm text-amber-950">El resultado quedó sin confirmar. Recupera el estado para comprobar si la requisición ya se guardó.</p>:null}
    <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={()=>{setView(null);setError(null);setReload(reload+1);}}
      className="min-h-11 rounded-lg border border-zinc-400 px-4 py-2 text-sm disabled:opacity-50">Recuperar estado de la requisición</button>
      <Link href="/compras" className="min-h-11 py-3 text-sm text-blue-800 underline">Ver Compras</Link>
      <Link href={`/autorizaciones/${encodeURIComponent(proposalId)}`} className="min-h-11 py-3 text-sm text-blue-800 underline">Ver cierre y autorizaciones</Link></div>
  </section>;
}
