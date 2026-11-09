"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { readInbox } from "@/lib/integrations/mercadolibre/store";

type Inbox = Awaited<ReturnType<typeof readInbox>>;
const path = "/api/integrations/mercadolibre";
const button = "rounded-lg border border-zinc-400 px-4 py-3 text-sm font-medium disabled:opacity-50";
const status: Record<string, string> = { paid: "Pagada", cancelled: "Cancelada", confirmed: "Confirmada", payment_required: "Pago pendiente", payment_in_process: "Pago en proceso" };
function amount(value: string, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(Number(value));
}

export function MercadoLibreInbox({ initial, ready, tenantName, callback }: {
  initial: Inbox; ready: boolean; tenantName: string; callback?: "failed" | "connected";
}) {
  const [inbox, setInbox] = useState(initial), [busy, setBusy] = useState(false), [offset, setOffset] = useState(0);
  const [nextRemote, setNextRemote] = useState<number | null>(null);
  const [message, setMessage] = useState(callback === "failed" ? "No se completó la autorización. Revisa la empresa activa y vuelve a conectar."
    : callback === "connected" ? "Cuenta conectada. Ya puedes consultar e importar sus ventas." : "");
  const [error, setError] = useState(false), [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const operation = useRef(false);
  async function json(response: Response) {
    const data = await response.json();
    if (!response.ok) throw Error(data.error ?? "No se pudo completar la consulta");
    return data;
  }
  async function run(action: "connect" | "sync" | "disconnect" | "page", page = 0) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(false); setMessage("");
    try {
      if (action === "connect") {
        const data = await json(await fetch(`${path}/connect`, { method: "POST" }));
        window.location.assign(data.url); return;
      }
      if (action === "sync") {
        const result = await json(await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, offset: page }) }));
        setNextRemote(result.nextOffset);
        setMessage(`Consulta completada: ${result.inserted} nuevas, ${result.updated} actualizadas y ${result.unchanged} sin cambios. Ventas en la búsqueda: ${result.total}.`);
      }
      if (action === "disconnect") {
        await json(await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }));
        setConfirmDisconnect(false); setNextRemote(null); setMessage("Conexión desactivada en Cotiza. Se conserva el historial de ventas.");
      }
      const localPage = action === "page" ? page : 0;
      const data = await json(await fetch(`${path}?offset=${localPage}`, { cache: "no-store" }));
      setInbox(data); setOffset(localPage);
    } catch (failure) { setError(true); setMessage(failure instanceof Error ? failure.message : "No se pudo completar la operación"); }
    finally { operation.current = false; setBusy(false); }
  }
  const connected = inbox.connection?.status === "connected";
  return <section className="space-y-5 text-zinc-900" aria-busy={busy}>
    <div><Link href="/configuracion?tab=operation" className="text-sm underline">Volver a Operación y canales</Link>
      <h1 className="mt-3 text-2xl font-semibold">Ventas de Mercado Libre</h1>
      <p className="mt-1 text-zinc-600">Empresa: {tenantName}</p></div>
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="font-semibold">1. Conecta tu cuenta</h2>
      <p className="mt-2 text-sm">{inbox.connection ? `Cuenta ${inbox.connection.nickname} · vendedor ${inbox.connection.sellerId}` : "Autoriza la cuenta del vendedor que corresponde a esta empresa."}</p>
      <p className="mt-2 text-sm">{connected ? "Conectada" : inbox.connection?.status === "reconnect_required" ? "Es necesario volver a autorizar la cuenta" : "Sin conexión activa"}</p>
      {!ready ? <p className="mt-2 text-sm text-amber-900">Falta completar la configuración de la aplicación de Mercado Libre.</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <button className={button} disabled={!ready || busy} onClick={() => void run("connect")}>{inbox.connection ? "Volver a autorizar" : "Conectar Mercado Libre"}</button>
        {connected ? <button className={button} disabled={busy} onClick={() => setConfirmDisconnect(true)}>Desconectar cuenta</button> : null}
      </div>
      {confirmDisconnect ? <div className="mt-4 rounded-lg bg-amber-50 p-4"><p className="text-sm">Se detendrán las consultas y se conservarán las ventas importadas. Puedes revocar el permiso de la aplicación desde Mercado Libre.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void run("disconnect")}>Confirmar desconexión</button>
          <button className={button} disabled={busy} onClick={() => setConfirmDisconnect(false)}>Conservar conexión</button></div></div> : null}
    </div>
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="font-semibold">2. Consulta e importa tus ventas</h2>
      <p className="mt-2 text-sm text-zinc-600">Cada consulta importa hasta 50 ventas. Las órdenes repetidas se actualizan conservando sus cambios.</p>
      <p className="mt-2 text-sm text-zinc-600">Esta bandeja prepara la integración comercial y fiscal. Las ventas todavía no generan clientes, oportunidades, indicadores ni facturas.</p>
      <div className="mt-4 flex flex-wrap gap-3"><button className={button} disabled={!connected || !ready || busy} onClick={() => void run("sync", 0)}>Consultar ventas recientes</button>
        {nextRemote !== null ? <button className={button} disabled={!connected || busy} onClick={() => void run("sync", nextRemote)}>Importar siguientes 50</button> : null}</div>
      {inbox.connection?.lastSyncAt ? <p className="mt-3 text-xs text-zinc-500">Última consulta (CDMX): {new Date(inbox.connection.lastSyncAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}</p> : null}
    </div>
    {message ? <p role={error || callback === "failed" ? "alert" : "status"} className={`rounded-lg border p-4 text-sm ${error ? "border-rose-300 bg-rose-50" : "border-blue-200 bg-blue-50"}`}>{message}</p> : null}
    <div className="space-y-3"><h2 className="font-semibold">Ventas importadas: {inbox.total}</h2>
      {!inbox.sales.length ? <p className="rounded-xl border border-dashed p-6 text-zinc-600">Todavía no hay ventas importadas en esta página.</p> : null}
      {inbox.sales.map(sale => <article key={sale.orderId} className="min-w-0 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-all font-semibold">Orden {sale.orderId}</h3>
          <p className="mt-1 text-sm">{new Date(sale.createdAt).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}{sale.packId ? ` · Compra ${sale.packId}` : ""}</p></div>
          <span className={`rounded-full px-3 py-1 text-sm ${sale.status === "paid" ? "bg-emerald-100 text-emerald-900" : sale.status === "cancelled" ? "bg-rose-100 text-rose-900" : "bg-amber-100 text-amber-900"}`}>{status[sale.status] ?? sale.status}</span></div>
        <p className="mt-3 text-lg font-semibold">{amount(sale.total, sale.currency)} {sale.currency}</p>
        <p className="text-xs text-zinc-500">Importe de la orden · pendiente de desglose para facturación y conciliación</p>
        <details className="mt-4"><summary className="cursor-pointer py-2 text-sm font-medium">Ver productos ({sale.items.length})</summary>
          <ul className="mt-2 space-y-3">{sale.items.map((item, index) => <li key={`${item.itemId}:${index}`} className="break-words border-t pt-3 text-sm">
            <p>{item.title}</p><p className="mt-1 text-zinc-600">{item.quantity} × {amount(item.unitPrice, sale.currency)}{item.sku ? ` · SKU ${item.sku}` : ""}</p></li>)}</ul></details>
      </article>)}
      <div className="flex flex-wrap items-center gap-3"><button className={button} disabled={offset === 0 || busy} onClick={() => void run("page", Math.max(0, offset - 50))}>Página anterior</button>
        <span className="text-sm">Página {Math.floor(offset / 50) + 1}</span>
        <button className={button} disabled={offset + 50 >= inbox.total || busy} onClick={() => void run("page", offset + 50)}>Página siguiente</button></div>
    </div>
  </section>;
}
