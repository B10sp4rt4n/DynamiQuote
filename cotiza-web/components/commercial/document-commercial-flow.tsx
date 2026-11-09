"use client";
import { useEffect, useState } from "react";
import { CommercialFlow } from "./commercial-flow";
import type { CommercialContext } from "@/lib/domain/business-follow-up";
type Context = CommercialContext;
export function DocumentCommercialFlow({kind,id}:{kind:"quote"|"proposal";id:string}) {
 const [context,setContext]=useState<{id:string;value:Context}|null>(null);const [failed,setFailed]=useState<string|null>(null);
 useEffect(()=>{const controller=new AbortController();void(async()=>{try{const r=await fetch(`/api/commercial-context?${kind}Id=${encodeURIComponent(id)}`,{method:"GET",signal:controller.signal,cache:"no-store"});if(!r.ok)throw Error();const data=await r.json();if(!controller.signal.aborted)setContext({id,value:data.context});}catch{if(!controller.signal.aborted)setFailed(id);}})();return()=>controller.abort();},[id,kind]);
 if(context?.id!==id)return <p className="text-sm text-zinc-600" role="status">{failed===id?"No se pudo vincular este documento con una ficha de oportunidad accesible.":"Consultando el negocio del documento…"}</p>;
 return <CommercialFlow current={kind==="quote"?2:3} context={context.value} next={kind==="quote"?"Completa las partidas y utiliza Crear propuesta. Puedes regresar a la ficha del negocio.":"Revisa la propuesta y utiliza la acción disponible según su autorización."} />;
}
