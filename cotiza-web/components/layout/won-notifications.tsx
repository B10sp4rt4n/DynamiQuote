"use client";
import Link from "next/link";
import { useEffect,useState } from "react";
import type { WonInboxItem } from "@/lib/db/won-inbox";
import { reasonLabel } from "@/lib/notifications/won";
export function WonNoticeLink({processEmails=false}:{processEmails?:boolean}){
  const [count,setCount]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    const load=()=>fetch("/api/notifications/won",{signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>{if(data)setCount(data.unreadCount ?? 0);}).catch(()=>{});
    const refresh=()=>{
      void load();
      if(processEmails)void fetch("/api/notifications/won-deliveries",{method:"POST",signal:controller.signal}).catch(()=>{});
    };
    refresh();
    const timer=window.setInterval(()=>{if(document.visibilityState==="visible")refresh();},60000);
    window.addEventListener("won-notice-read",load);
    return()=>{controller.abort();window.clearInterval(timer);window.removeEventListener("won-notice-read",load);};
  },[processEmails]);
  return <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-blue-900" href="/notificaciones" aria-label="Avisos comerciales"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16v16H4zM4 7l8 6 8-6"/></svg><span className="hidden sm:inline">Avisos comerciales</span>{count>0?<span className="rounded-full bg-blue-800 px-2 py-0.5 text-xs text-white" aria-label={`${count} sin leer`}>{count>99?"99+":count}</span>:null}</Link>;
}
export function WonInbox(){
  const [items,setItems]=useState<WonInboxItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [pending,setPending]=useState<string|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/notifications/won",{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error("No se pudieron cargar los avisos");return r.json();}).then(data=>{setItems(data.notifications);setLoading(false);}).catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});
    return()=>controller.abort();
  },[]);
  async function mark(id:string){
    setPending(id);setError("");
    try{const r=await fetch("/api/notifications/won",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({notificationId:id})});if(!r.ok)throw Error("No se pudo marcar como leído");
      setItems(current=>current.map(n=>n.id===id?{...n,readAt:new Date().toISOString()}:n));window.dispatchEvent(new Event("won-notice-read"));
    }catch(e){setError(e instanceof Error?e.message:"No se pudo actualizar");}finally{setPending(null);}
  }
  return <div className="space-y-4"><p role="status">{loading?"Cargando avisos…":error}</p>
    {!loading && !items.length && !error?<p className="rounded-xl border border-zinc-200 bg-white p-5">Todavía no tienes avisos de cierres ganados.</p>:null}
    {items.map(item=><article key={item.id} className={`rounded-xl border bg-white p-5 ${item.readAt?"border-zinc-200":"border-blue-400"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="break-words text-lg font-semibold">{item.subject}</h2><span className="text-sm font-semibold">{item.readAt?"Leído":"Sin leer"}</span></div>
      <p className="mt-2 text-xs text-zinc-600">{new Intl.DateTimeFormat("es-MX",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Mexico_City"}).format(new Date(item.createdAt))} · CDMX</p>
      <p className="mt-2 text-sm">{item.reasons.map(r=>reasonLabel[r as keyof typeof reasonLabel]??r).join(" + ")}</p>
      <details className="mt-3"><summary className="cursor-pointer font-semibold">Ver detalle del cierre</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm">{item.body}</p></details>
      <div className="mt-4 flex flex-wrap items-center gap-4"><Link className="inline-flex min-h-11 items-center font-semibold text-blue-800 underline" href={item.href}>Ver propuesta ganadora</Link>
        {!item.readAt?<button type="button" disabled={pending!==null} onClick={()=>void mark(item.id)} className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 font-semibold">{pending===item.id?"Guardando…":"Marcar como leído"}</button>:null}</div>
    </article>)}
    {items.length===50?<p className="text-sm text-zinc-600">Se muestran los 50 avisos más recientes.</p>:null}
  </div>;
}


type DeliveryStatus={delivery_id:string;normalized_email:string;state:string;attempt_count:number;last_error_code:string|null;provider_message_id:string|null};
const deliveryLabels:Record<string,string>={pending:"Pendiente",sending:"En proceso",sent:"Aceptado por el proveedor",failed:"Fallido",uncertain:"Requiere revisión",suppressed:"Omitido"};
export function WonDeliveryStatus(){
  const [rows,setRows]=useState<DeliveryStatus[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{const controller=new AbortController();fetch("/api/notifications/won-deliveries",{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error("No se pudo consultar el correo");return r.json();}).then(d=>setRows(d.deliveries??[])).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[]);
  async function process(){setBusy(true);setError("");try{const r=await fetch("/api/notifications/won-deliveries",{method:"POST"});if(!r.ok)throw Error("No se pudieron procesar los pendientes");const status=await fetch("/api/notifications/won-deliveries");if(!status.ok)throw Error("No se pudo actualizar el estado");setRows((await status.json()).deliveries??[]);}catch(e){setError(e instanceof Error?e.message:"No se pudo procesar");}finally{setBusy(false);}}
  return <section className="rounded-xl border border-zinc-200 bg-white p-5"><h2 className="text-xl font-semibold">Correo de cierres ganados</h2><p className="mt-2 text-sm text-zinc-600">Aceptado por el proveedor confirma la recepción de la solicitud de envío. La entrega al buzón y la lectura requieren confirmación adicional.</p>
    <button type="button" disabled={busy} onClick={()=>void process()} className="mt-3 min-h-11 rounded-lg border border-blue-800 px-4 py-2 font-semibold text-blue-900">{busy?"Procesando…":"Procesar pendientes"}</button><p role="status" className="mt-2 text-sm">{error}</p>
    <ul className="mt-3 space-y-2">{rows.map(row=><li key={row.delivery_id} className="break-words rounded-lg border border-zinc-200 p-3 text-sm"><p className="font-semibold">{row.normalized_email}</p><p>{deliveryLabels[row.state]??"Consultar administración"} · Intentos: {row.attempt_count}</p>{row.state==="uncertain"?<p>Verifica el resultado con el proveedor antes de intentar otro envío.</p>:null}</li>)}</ul>
    {!rows.length?<p className="mt-3 text-sm">Sin envíos registrados.</p>:null}</section>;
}
