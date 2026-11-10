"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BillingCancellation, BillingPayments } from "@/lib/integrations/digestor-fiscal";
import { ProposalCancellationPanel } from './proposal-cancellation-panel';
import { ProposalCorrectionPanel } from './proposal-correction-panel';

const STATUS = { not_sent: "Pendiente de complemento", processing: "Timbrado pendiente de confirmar", unknown: "Requiere conciliación", rejected: "Rechazado por el PAC", stamped: "Complemento timbrado" };
const money = (value?: string) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value ?? 0));

type Props = { proposalId: string; cancellationEnabled?: boolean; invoiceBlocked?: boolean; correctionsEnabled?: boolean; invoiceCancellationStatus?: BillingCancellation['status'] };
export function ProposalPaymentPanel({ proposalId, cancellationEnabled = false, invoiceBlocked = false, correctionsEnabled = false, invoiceCancellationStatus }: Props) {
  const path = `/api/proposals/${encodeURIComponent(proposalId)}/invoice/payments`;
  const [summary, setSummary] = useState<BillingPayments | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [paymentForm, setPaymentForm] = useState("03");
  const [recoveryUuid, setRecoveryUuid] = useState<Record<string, string>>({});
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const operation = useRef(false);
  const receiptCancellationChanged = useCallback((status: BillingCancellation['status'], paymentId?: string) => {
    setSummary(previous => {
      if (!previous || previous.payments.find(payment => payment.id === paymentId)?.cancellation_status === status) return previous;
      return { ...previous, payments: previous.payments.map(payment => payment.id === paymentId ? { ...payment, cancellation_status: status } : payment) };
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    function load() { return fetch(path, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudieron consultar los pagos");
      if (!controller.signal.aborted) setSummary(data);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Error de red"); }); }
    void load();
    const updated = () => { void load(); };
    window.addEventListener('cotiza:fiscal-updated', updated);
    return () => { controller.abort(); window.removeEventListener('cotiza:fiscal-updated', updated); };
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
    const real = summary?.environment === 'production';
    const payment = summary?.payments.find(item => item.id === paymentId);
    if (action === 'stamp' && real && !window.confirm(`Emitir complemento fiscal real por ${money(payment?.amount)} para la factura ${summary?.invoice_uuid}. ¿Confirmas que recibiste este pago?`)) return;
    await run(async () => {
      // Keep an unconfirmed browser request protected until a server read resolves it.
      if (action === 'stamp') setSummary(previous => previous ? { ...previous,
        payments: previous.payments.map(item => item.id === paymentId ? { ...item, receipt_status: 'unknown', fiscal_ready: false } : item),
      } : previous);
      const response = await fetch(`${path}/${encodeURIComponent(paymentId)}/receipt/${action}`, {
        method: "POST", headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_real_receipt: action === 'stamp' && real }),
      }).catch(() => { throw new Error('No se confirmó la respuesta del complemento. No repitas el timbrado; consulta el saldo y estado.'); });
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

  async function recover(paymentId: string) {
    await run(async () => {
      const response = await fetch(`${path}/${encodeURIComponent(paymentId)}/receipt/reconcile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt_uuid: recoveryUuid[paymentId] ?? '' }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? 'No se confirmó el complemento esperado');
      await refresh();
    });
  }

  if (summary && !summary.supported) return null;
  // A confirmed cancellation takes precedence over a stale payment summary.
  const invoiceCancelled = invoiceCancellationStatus === 'cancelled' || summary?.invoice_cancellation_status === 'cancelled';
  return <section className="mt-4 rounded-lg border border-zinc-300 bg-white p-4 text-zinc-900">
    <h3 className="font-semibold">{invoiceCancelled ? 'Historial de pagos · factura cancelada' : 'Pagos de factura PPD'}{summary?.environment === 'sandbox' ? ' · pruebas' : ''}</h3>
    <p className="mt-1 text-xs text-zinc-600">Registra únicamente pagos recibidos. Este registro no verifica movimientos bancarios.{summary?.environment === 'production' ? ' Los complementos emitidos son comprobantes fiscales reales.' : summary?.environment === 'sandbox' ? ' Entorno de pruebas del PAC.' : ''}</p>
    {error ? <p role="alert" className="mt-2 text-sm text-rose-800">{error}</p> : null}
    <button type="button" disabled={busy} onClick={() => void run(refresh)} className="mt-2 rounded border px-3 py-2 text-sm disabled:opacity-50">Consultar saldo y estado</button>
    {summary?.supported ? <>
      <p className="mt-3 text-sm">{invoiceCancelled ? 'Total original' : 'Total'}: {money(summary.total)} · Pagos registrados: {money(summary.paid)} · {invoiceCancelled ? 'Saldo histórico del comprobante' : 'Saldo'}: <strong>{money(summary.balance)}</strong></p>
      {invoiceCancelled ? <p className="mt-2 text-sm text-zinc-600">Cancelación confirmada. Los importes se conservan como historial; este saldo no determina por sí mismo una deuda comercial. No se pueden registrar nuevos pagos sobre esta factura cancelada.</p>
        : summary.invoice_fiscal_ready === false ? <p className="mt-2 text-sm text-amber-900">Hay una sustitución o cancelación pendiente. Completa su revisión antes de registrar nuevos pagos.</p> : null}
      {!invoiceCancelled && Number(summary.balance) > 0 && summary.invoice_fiscal_ready !== false && !invoiceBlocked && !['processing', 'requested', 'unknown', 'cancelled'].includes(summary.invoice_cancellation_status ?? '') ? <fieldset disabled={busy} className="mt-4 grid gap-3 sm:grid-cols-2">
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
        const fiscalActive = (status?: string) => !['processing', 'requested', 'unknown', 'cancelled'].includes(status ?? '');
        const previousIssued = summary.payments.slice(0, index).every(item => item.fiscal_ready ?? (item.receipt_status === 'stamped' && fiscalActive(item.cancellation_status)));
        const canIssue = !invoiceCancelled && summary.invoice_fiscal_ready !== false && !invoiceBlocked && fiscalActive(summary.invoice_cancellation_status) && fiscalActive(payment.cancellation_status);
        return <li key={payment.id} className="rounded border p-3 text-sm">
          <p><strong>Pago {payment.sequence}: {money(payment.amount)}</strong> · {payment.reference}</p>
          <p className="mt-1">Saldo después del pago: {money(payment.balance_after)}</p>
          <p className="mt-1">{payment.has_active_revision ? 'Complemento original sustituido' : STATUS[payment.receipt_status]}</p>
          {payment.receipt_uuid ? <p className="mt-1 break-all text-xs">UUID: {payment.receipt_uuid}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {payment.receipt_status === "stamped" ? <><a className="rounded border px-3 py-2" href={`${path}/${encodeURIComponent(payment.id)}/receipt?download=1`}>Descargar XML timbrado</a><a className="rounded border px-3 py-2" href={`${path}/${encodeURIComponent(payment.id)}/receipt/pdf`} target="_blank" rel="noreferrer">Descargar PDF</a></> : <button type="button" disabled={busy || !canIssue} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => void receipt(payment.id, "prepare")}>Ver XML preliminar</button>}
            {canIssue && summary.receipt_stamp_enabled && previousIssued && ["not_sent", "rejected"].includes(payment.receipt_status) ? <button type="button" disabled={busy} className="rounded border border-amber-500 px-3 py-2 disabled:opacity-50" onClick={() => void receipt(payment.id, "stamp")}>{summary.environment === 'production' ? 'Emitir complemento fiscal real' : 'Timbrar complemento en pruebas'}</button> : null}
          </div>
          {["processing", "unknown"].includes(payment.receipt_status) ? <p className="mt-2 text-xs text-amber-900">No repitas el timbrado. Consulta el estado y concilia con el proveedor antes de continuar.</p> : null}
          {canIssue && ['processing', 'unknown'].includes(payment.receipt_status) ? <div className="mt-3 space-y-2">
            <label className="block text-sm">UUID del complemento confirmado por el proveedor<input className="mt-1 w-full rounded border p-2" value={recoveryUuid[payment.id] ?? ''} onChange={event => setRecoveryUuid(previous => ({ ...previous, [payment.id]: event.target.value }))} /></label>
            <button type="button" disabled={busy || !recoveryUuid[payment.id]} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => void recover(payment.id)}>Recuperar XML sin volver a timbrar</button>
          </div> : null}
          {payment.cancellation_status && payment.cancellation_status !== 'not_requested' ? <p className="mt-2 text-xs text-amber-900">Cancelación del complemento: {payment.cancellation_status === 'cancelled' ? 'confirmada' : 'requiere seguimiento'}. El pago recibido se conserva.</p> : null}
          {cancellationEnabled && payment.receipt_status === 'stamped' ? <ProposalCancellationPanel proposalId={proposalId} paymentId={payment.id} onStatusChange={receiptCancellationChanged} /> : null}
          {correctionsEnabled && payment.receipt_status === 'stamped' ? <ProposalCorrectionPanel proposalId={proposalId} paymentId={payment.id} /> : null}
        </li>;
      })}</ol>
    </> : !error ? <p className="mt-2 text-sm">Consultando pagos…</p> : null}
  </section>;
}
