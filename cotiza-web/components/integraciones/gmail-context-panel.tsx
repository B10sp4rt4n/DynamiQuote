"use client";
import Link from "next/link";
import { useEffect,useState } from "react";
import type { GmailConnectionView,GmailLink,GmailMessageView } from "@/lib/integrations/gmail/domain";
type SearchItem={messageId:string;subject:string;from:string;date:string};
type Inbox={ready:boolean;connection:GmailConnectionView;links:GmailLink[]};
const button="min-h-11 rounded-lg border border-zinc-400 px-4 py-2 text-sm disabled:opacity-50";
function MessageText({message}:{message:GmailMessageView}) {
  return <div className="mt-3 space-y-2 text-sm">
    <dl><dt className="font-semibold">De</dt><dd className="break-words">{message.from}</dd>
      <dt className="mt-2 font-semibold">Para</dt><dd className="break-words">{message.to}</dd>
      {message.cc ? <><dt className="mt-2 font-semibold">CC</dt><dd className="break-words">{message.cc}</dd></>:null}
      <dt className="mt-2 font-semibold">Fecha del mensaje</dt><dd>{message.date||message.receivedAt}</dd></dl>
    {message.bodyFormat==="html_as_text" ? <p className="text-zinc-600">Texto obtenido del formato HTML del correo.</p>:null}
    <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-50 p-3 font-sans">{message.bodyText||"Este correo no tiene un cuerpo de texto disponible."}</pre>
    <p className="text-xs text-zinc-600">El texto puede incluir citas de mensajes anteriores. El correo es evidencia documental; sus afirmaciones requieren interpretación.</p>
  </div>;
}
export function GmailContextPanel({tenantId,opportunityId,initialQuery}:{tenantId:string;opportunityId:string;initialQuery:string}) {
  const endpoint=`/api/opportunities/${encodeURIComponent(opportunityId)}/gmail`;
  const [data,setData]=useState<Inbox|null>(null),[query,setQuery]=useState(initialQuery),[items,setItems]=useState<SearchItem[]>([]);
  const [page,setPage]=useState<string|null>(null),[preview,setPreview]=useState<{message:GmailMessageView;previewToken:string}|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(endpoint,{headers:{"X-Tenant-Context":tenantId},cache:"no-store",signal:controller.signal})
      .then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.error);return result as Inbox;})
      .then(setData).catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error?error.message:"No se pudo cargar Gmail");});
    return ()=>controller.abort();
  },[endpoint,tenantId]);
  async function post(body:unknown) {
    const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","X-Tenant-Context":tenantId},body:JSON.stringify(body),cache:"no-store"});
    const result=await response.json();if(!response.ok)throw Error(result.error ?? "No se pudo consultar Gmail");return result;
  }
  async function search(next=false) {
    setBusy(true);setError(null);setNotice(null);setPreview(null);
    if(!next){setItems([]);setPage(null);}
    try {
      const result=await post({action:"search",query,...(next&&page ? {pageToken:page}:{})});
      setItems(previous=>next ? [...previous,...result.messages]:result.messages);setPage(result.nextPageToken);
      if(!result.messages.length&&!next)setNotice("No se encontraron mensajes. Prueba con el correo del contacto o el folio de la propuesta.");
    } catch(error){setError(error instanceof Error?error.message:"No se pudo buscar");}finally{setBusy(false);}
  }
  async function review(messageId:string) {
    setBusy(true);setError(null);setPreview(null);setNotice(null);
    try{setPreview(await post({action:"preview",messageId}));}catch(error){setError(error instanceof Error?error.message:"No se pudo leer el mensaje");}finally{setBusy(false);}
  }
  async function link() {
    if(!preview)return;setBusy(true);setError(null);
    try{
      const result=await post({action:"link",messageId:preview.message.messageId,previewToken:preview.previewToken});
      const response=await fetch(endpoint,{headers:{"X-Tenant-Context":tenantId},cache:"no-store"});
      const updated=await response.json();if(!response.ok)throw Error(updated.error);setData(updated);setPreview(null);
      setNotice(result.unchanged?"Este correo ya estaba vinculado; no se creó un duplicado.":"Correo y adjuntos vinculados al expediente.");
    }catch(error){setError(error instanceof Error?error.message:"No se pudo vincular");}finally{setBusy(false);}
  }
  async function download(linkId:string,partId:string,filename:string) {
    setBusy(true);setError(null);
    try{
      const params=new URLSearchParams({linkId,partId});
      const response=await fetch(`${endpoint}/attachment?${params}`,{headers:{"X-Tenant-Context":tenantId},cache:"no-store"});
      if(!response.ok){const result=await response.json();throw Error(result.error);}
      const url=URL.createObjectURL(await response.blob()),anchor=document.createElement("a");
      anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){setError(error instanceof Error?error.message:"No se pudo descargar el documento");}finally{setBusy(false);}
  }
  return <section id="comunicaciones" className="rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Comunicaciones</h2>
      <Link className="inline-flex min-h-11 items-center text-sm text-blue-800 underline" href="/configuracion/integraciones/gmail">Conexión de Gmail</Link></div>
    <p className="mt-2 text-sm text-zinc-600">Correos individuales vinculados a esta oportunidad. El asunto no determina el expediente.</p>
    {!data&&!error ? <p role="status" className="mt-3">Cargando comunicaciones…</p>:null}
    {data&&!data.ready ? <p className="mt-3">La conexión de Google aún no está preparada.</p>:null}
    {data?.ready&&data.connection?.status!=="connected" ? <p className="mt-3">Conecta Gmail para buscar nuevos mensajes. Las copias guardadas se conservan.</p>:null}
    {data?.ready&&data.connection?.status==="connected" ? <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={event=>{event.preventDefault();void search();}}>
      <label htmlFor={`gmail-query-${opportunityId}`} className="sr-only">Buscar correos por contacto, texto o folio</label>
      <input id={`gmail-query-${opportunityId}`} value={query} onChange={event=>{setQuery(event.target.value);setPage(null);}} minLength={3} maxLength={500} required disabled={busy}
        placeholder="Contacto, texto o folio de propuesta" className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-400 px-3"/>
      <button disabled={busy} className={button} type="submit">{busy?"Consultando…":"Buscar / actualizar correos"}</button>
    </form>:null}
    {error?<p role="alert" className="mt-3 text-red-700">{error}</p>:null}
    {notice?<p role="status" className="mt-3 text-blue-900">{notice}</p>:null}
    {items.length ? <ul aria-label="Resultados de Gmail" className="mt-4 space-y-2">{items.map((item,index)=><li key={`${item.messageId}:${index}`} className="rounded-lg border border-zinc-200 p-3">
      <p className="break-words font-semibold">{item.subject||"Sin asunto"}</p><p className="break-words text-sm">{item.from}</p><p className="text-xs text-zinc-600">{item.date}</p>
      <button type="button" disabled={busy} onClick={()=>void review(item.messageId)} className={`${button} mt-2`}>Leer este correo</button>
    </li>)}</ul>:null}
    {page?<button type="button" disabled={busy} onClick={()=>void search(true)} className={`${button} mt-3`}>Más resultados</button>:null}
    {preview?<article aria-label="Revisión del correo" className="mt-4 rounded-xl border-2 border-blue-600 p-4">
      <h3 className="break-words text-lg font-semibold">{preview.message.subject||"Sin asunto"}</h3><MessageText message={preview.message}/>
      <p className="mt-3 text-sm font-semibold">Adjuntos a incorporar: {preview.message.attachments.length}</p>
      <ul className="mt-1 text-sm">{preview.message.attachments.map(a=><li key={a.partId} className="break-words">{a.filename} · {Math.ceil(a.size/1024)} KB</li>)}</ul>
      <p className="mt-3 text-sm">Revisa que este mensaje corresponda a la oportunidad. Vincularlo guarda una copia; no cambia su etapa ni confirma cobros o autorizaciones.</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void link()} className="min-h-11 rounded-lg bg-blue-800 px-4 py-2 text-white disabled:opacity-50">Vincular correo y adjuntos</button>
        <button type="button" disabled={busy} onClick={()=>setPreview(null)} className={button}>Cerrar revisión</button></div>
    </article>:null}
    <h3 className="mt-5 font-semibold">Correos vinculados ({data?.links.length??0})</h3>
    {data?.links.length===50?<p className="text-sm text-zinc-600">Se muestran las últimas 50 vinculaciones.</p>:null}
    <div className="mt-3 space-y-3">{data?.links.toSorted((a,b)=>a.message.receivedAt.localeCompare(b.message.receivedAt)).map(link=><details key={link.linkId} className="rounded-lg border border-zinc-300 p-3">
      <summary className="min-h-11 cursor-pointer break-words py-2 font-medium">{link.message.subject||"Sin asunto"}<span className="block text-xs font-normal text-zinc-600">{link.message.date||link.message.receivedAt}</span></summary>
      <MessageText message={link.message}/><p className="mt-3 text-sm font-semibold">Documentos conservados</p>
      <div className="mt-2 flex flex-wrap gap-2">{link.message.attachments.map(a=><button key={a.partId} type="button" disabled={busy} onClick={()=>void download(link.linkId,a.partId,a.filename)} className={`${button} max-w-full break-all text-left`}>{a.filename}</button>)}</div>
      <p className="mt-3 break-all text-xs text-zinc-500">Copia verificada · SHA-256: {link.snapshotHash}</p>
    </details>)}</div>
    {data&&!data.links.length?<p className="mt-3 text-sm text-zinc-600">Todavía no hay correos vinculados a este expediente.</p>:null}
  </section>;
}
