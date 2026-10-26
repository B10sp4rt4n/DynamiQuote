"use client";

import { useEffect, useRef, useState } from "react";
import type { BillingPayments } from "@/lib/integrations/digestor-fiscal";

const STATUS = { not_sent: "Pendiente de complemento", processing: "Timbrado pendiente de confirmar", unknown: "Requiere conciliación", rejected: "Rechazado por el PAC", stamped: "Complemento timbrado" };
const money = (value?: string) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value ?? 0));

type Props = { proposalId: string };
export function ProposalPaymentPanel({ proposalId }: Props) {
  const path = `/api/proposals/${encodeURIComponent(proposalId)}/invoice/payments`;
  const [summary, setSummary] = useState<BillingPayments | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [paymentForm, setPaymentForm] = useState("03");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const operation = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(path, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudieron consultar los pagos");
      if (!controller.signal.aborted) setSummary(data);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Error de red"); });
    return () => controller.abort();
  }, [path]);

  async function refresh() {
    const response = await fetch(path);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No se pudo actualizar el saldo");
    setSummary(data);
  }

  async function run(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(null);
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : "Operación sin confirmar. Consulta el estado antes de reintentar"); }
    finally { operation.current = false; setBusy(false); }
  }

  async function register() {
    await run(async () => {
      const input = { amount, reference, paid_at: new Date(paidAt).toISOString(), payment_form: paymentForm };
      const fingerprint = JSON.stringify(input);
      if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, idempotency_key: retry.current.key }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se confirmó el registro del pago; consulta el estado");
      retry.current = null; setAmount(""); setReference(""); setPaidAt("");
      await refresh();
    });
  }

  async function receipt(paymentId: string, action: "prepare" | "stamp") {
    await run(async () => {
      const response = await fetch(`${path}/${encodeURIComponent(paymentId)}/receipt/${action}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) { await refresh(); throw new Error(data.error ?? "No se confirmó el complemento"); }
      if (action === "prepare") {
        const blob = new Blob([Uint8Array.from(atob(data.xml_base64), char => char.charCodeAt(0))], { type: "application/xml" });
        const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
        anchor.href = url; anchor.download = "complemento-preliminar-sin-timbrar.xml"; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      await refresh();
    });
  }

  if (summary && !summary.supported) return null;
  return <section className="mt-4 rounded-lg border border-zinc-300 bg-white p-4 text-zinc-900">
    <h3 className="font-semibold">Pagos de factura PPD · pruebas</h3>
    <p className="mt-1 text-xs text-zinc-600">Registra únicamente pagos recibidos. Este registro no verifica movimientos bancarios. El timbrado está limitado al entorno de pruebas.</p>
    {error ? <p role="alert" className="mt-2 text-sm text-rose-800">{error}</p> : null}
    <button type="button" disabled={busy} onClick={() => void run(refresh)} className="mt-2 rounded border px-3 py-2 text-sm disabled:opacity-50">Consultar saldo y estado</button>
    {summary?.supported ? <>
      <p className="mt-3 text-sm">Total: {money(summary.total)} · Pagos registrados: {money(summary.paid)} · Saldo: <strong>{money(summary.balance)}</strong></p>
      {Number(summary.balance) > 0 ? <fieldset disabled={busy} className="mt-4 grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Registrar pago recibido</legend>
        <label className="text-sm">Importe MXN<input className="mt-1 w-full rounded border p-2" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></label>
        <label className="text-sm">Referencia bancaria o de recibo<input className="mt-1 w-full rounded border p-2" maxLength={100} value={reference} onChange={event => setReference(event.target.value)} /></label>
        <label className="text-sm">Fecha y hora recibida (zona de este dispositivo)<input className="mt-1 w-full rounded border p-2" type="datetime-local" value={paidAt} onChange={event => setPaidAt(event.target.value)} /></label>
        <label className="text-sm">Forma de pago<select className="mt-1 w-full rounded border p-2" value={paymentForm} onChange={event => setPaymentForm(event.target.value)}>
          <option value="01">Efectivo</option><option value="02">Cheque nominativo</option><option value="03">Transferencia electrónica</option><option value="04">Tarjeta de crédito</option><option value="28">Tarjeta de débito</option>
        </select></label>
        <p className="text-xs text-zinc-600 sm:col-span-2">El registro quedará en el historial. La referencia ayuda a evitar duplicados; no reutilices el mismo movimiento con otra referencia.</p>
        <button type="button" disabled={!amount || !reference.trim() || !paidAt} onClick={() => void register()} className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50">Registrar pago recibido</button>
      </fieldset> : null}
      <ol className="mt-4 space-y-3">{summary.payments.map((payment, index) => {
        const previousIssued = index === 0 || summary.payments[index-1].receipt_status === "stamped";
        return <li key={payment.id} className="rounded border p-3 text-sm">
          <p><strong>Pago {payment.sequence}: {money(payment.amount)}</strong> · {payment.reference}</p>
          <p className="mt-1">Saldo después del pago: {money(payment.balance_after)}</p>
          <p className="mt-1">{STATUS[payment.receipt_status]}</p>
          {payment.receipt_uuid ? <p className="mt-1 break-all text-xs">UUID: {payment.receipt_uuid}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {payment.receipt_status === "stamped" ? <a className="rounded border px-3 py-2" href={`${path}/${encodeURIComponent(payment.id)}/receipt?download=1`}>Descargar XML timbrado</a> : <button type="button" disabled={busy} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => void receipt(payment.id, "prepare")}>Ver XML preliminar</button>}
            {summary.receipt_stamp_enabled && previousIssued && ["not_sent", "rejected"].includes(payment.receipt_status) ? <button type="button" disabled={busy} className="rounded border border-amber-500 px-3 py-2 disabled:opacity-50" onClick={() => void receipt(payment.id, "stamp")}>Timbrar complemento en pruebas</button> : null}
          </div>
          {["processing", "unknown"].includes(payment.receipt_status) ? <p className="mt-2 text-xs text-amber-900">No repitas el timbrado. Consulta el estado y concilia con el proveedor antes de continuar.</p> : null}
        </li>;
      })}</ol>
    </> : !error ? <p className="mt-2 text-sm">Consultando pagos…</p> : null}
  </section>;
}
