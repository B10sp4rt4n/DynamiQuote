"use client";
import Link from "next/link";
import { useState } from "react";
import type { GmailConnectionView } from "@/lib/integrations/gmail/domain";

export function GmailConnection({tenantId,ready,initial,callback}:{tenantId:string;ready:boolean;initial:GmailConnectionView;callback?:string}) {
  const [connection,setConnection]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  async function run(action:"connect"|"disconnect") {
    setBusy(true);setError(null);
    try {
      const response=await fetch(`/api/integrations/gmail${action==="connect" ? "/connect":""}`,{method:"POST",
        headers:{"Content-Type":"application/json","X-Tenant-Context":tenantId},body:JSON.stringify({action}),cache:"no-store"});
      const result=await response.json();
      if(!response.ok) throw Error(result.error ?? "No se pudo completar la conexión");
      if(action==="connect") {
        const url=new URL(result.url);
        if(url.origin!=="https://accounts.google.com") throw Error("Destino de autorización no válido");
        window.location.assign(url.toString());
      } else setConnection(connection ? {...connection,status:"disconnected"}:null);
    } catch(error) {setError(error instanceof Error ? error.message:"No se pudo completar la conexión");}
    finally {setBusy(false);}
  }
  return <section className="rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900">
    <h1 className="text-xl font-semibold">Gmail · Comunicaciones comerciales</h1>
    <p className="mt-2 text-sm">Consulta mensajes y vincula los que correspondan a cada oportunidad. Cada correo se conserva por separado, aunque comparta asunto.</p>
    {!ready ? <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-950">La conexión todavía requiere completar su configuración de Google. No hay un buzón conectado desde esta pantalla.</p> : null}
    {callback==="failed" ? <p role="alert" className="mt-3 text-red-700">No se completó la autorización. Vuelve a conectar con la cuenta habilitada y la misma empresa activa.</p>:null}
    {connection ? <p className="mt-4 break-all font-medium">{connection.email} · {connection.status==="connected" ? "Conectada":"Desconectada"}</p>:<p className="mt-4">Sin cuenta conectada.</p>}
    <p className="mt-2 text-sm text-zinc-600">Acceso de lectura. Tú eliges qué mensajes incorporar al expediente. Las copias del piloto sólo están disponibles para tu usuario en esta empresa.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" disabled={!ready||busy} onClick={()=>void run("connect")} className="min-h-11 rounded-lg bg-blue-800 px-4 py-2 text-white disabled:opacity-50">{busy ? "Procesando…":connection?.status==="connected" ? "Volver a autorizar Gmail":"Conectar Gmail"}</button>
      {connection?.status==="connected" ? <button type="button" disabled={busy} onClick={()=>void run("disconnect")} className="min-h-11 rounded-lg border border-zinc-400 px-4 py-2 disabled:opacity-50">Desconectar</button>:null}
    </div>
    <p className="mt-3 text-sm text-zinc-600">Desconectar detiene las consultas futuras y conserva las copias ya vinculadas. Puedes revocar también el acceso desde tu cuenta de Google.</p>
    {error ? <p role="alert" className="mt-3 text-red-700">{error}</p>:null}
    <Link href="/pipeline" className="mt-5 inline-flex min-h-11 items-center text-blue-800 underline">Ir a las oportunidades</Link>
  </section>;
}
