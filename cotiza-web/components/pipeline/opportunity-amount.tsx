"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CommercialOptionsSummary } from "@/lib/domain/commercial-options";
const money=(n:number)=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(n);
export function OpportunityAmount({amount,options,opportunityId,canChoose=false,stage}:{amount:number;options?:CommercialOptionsSummary;opportunityId:string;canChoose?:boolean;stage?:string}) {
  const router=useRouter();const [saving,setSaving]=useState(false);const [error,setError]=useState<string|null>(null);
  async function choose(value:string) {
    setSaving(true);setError(null);
    try {const response=await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/commercial-option`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({optionId:value||null})});const result=await response.json();if(!response.ok)throw Error(result.error??"No se pudo seleccionar");router.refresh();}
    catch(e){setError(e instanceof Error?e.message:"No se pudo seleccionar");}finally{setSaving(false);}
  }
  if(!options)return <>{money(amount)}</>;
  const pending=stage!=="won"&&!options.selectedOptionId;
  return <div className="space-y-2 text-zinc-900"><span className="block font-semibold">{options.reviewRequired ? "Revisar decisiones de alternativas" : pending?`${money(options.minimum)} a ${money(options.maximum)}`:money(amount)}</span><span className="block text-xs text-zinc-600">{options.optionCount} opciones alternativas{pending?" · por elegir · no se suman":" · se cuenta una sola opción"}</span>
    {canChoose&&stage==="open"?<label className="block text-xs font-medium">Opción en negociación<select aria-label="Opción en negociación" className="mt-1 block max-w-full rounded-lg border border-zinc-400 bg-white p-2 text-zinc-900" disabled={saving} value={options.selectedOptionId??""} onChange={e=>void choose(e.target.value)}><option value="">Sin elegir · mostrar rango</option>{options.options.map(o=><option key={o.id} value={o.id}>{o.label} · {money(o.amount)}</option>)}</select><span className="mt-1 block text-zinc-600">Elegir no autoriza ni marca ganada la propuesta.</span></label>:null}
    <details><summary className="cursor-pointer text-xs font-semibold text-indigo-800">Ver opciones cotizadas</summary>{options.options.map(o=><Link key={o.id} className="mt-1 block text-xs text-indigo-800 underline" href={`/cotizaciones?quoteId=${encodeURIComponent(o.quoteId)}`}>{o.label} · {money(o.amount)}</Link>)}</details>
    {error?<span role="alert" className="block text-xs text-red-800">{error}</span>:null}
  </div>;
}
