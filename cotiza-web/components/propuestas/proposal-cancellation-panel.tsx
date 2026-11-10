'use client';
import { useEffect, useRef, useState } from 'react';
import type { BillingCancellation } from '@/lib/integrations/digestor-fiscal';

import { CANCELLATION_LABELS as LABEL, ProposalFiscalEvidence } from './proposal-fiscal-evidence';
export function ProposalCancellationPanel({ proposalId, paymentId, onStatusChange }: {
  proposalId: string; paymentId?: string; onStatusChange?: (status: BillingCancellation['status'], paymentId?: string) => void;
}) {
  const base = `/api/proposals/${encodeURIComponent(proposalId)}/invoice`;
  const path = paymentId ? `${base}/payments/${encodeURIComponent(paymentId)}/receipt/cancellation` : `${base}/cancellation`;
  const [state, setState] = useState<BillingCancellation | null>(null);
  const [reason, setReason] = useState<'02' | '03'>('03');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(false);
  const attempt = useRef<{ reason: string; key: string; uuid?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    function load() { return fetch(path, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? 'No se pudo consultar la cancelación');
      if (!controller.signal.aborted) {
        setState(value); onStatusChange?.(value.status, paymentId);
        if (value.status === 'not_sent' && ['02', '03'].includes(value.reason) && value.idempotency_key) {
          setReason(value.reason); attempt.current = { reason: value.reason, key: value.idempotency_key, uuid:value.document_uuid };
        }
      }
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Error de consulta'); }); }
    void load(); const updated = () => { void load(); };
    window.addEventListener('cotiza:fiscal-updated', updated);
    return () => { controller.abort(); window.removeEventListener('cotiza:fiscal-updated', updated); };
  }, [path, paymentId, onStatusChange]);
  async function execute(action: 'request' | 'reconcile') {
    if (operation.current || (action === 'request' && !confirmed)) return;
    operation.current = true; setBusy(true); setError(null);
    if (attempt.current?.reason !== reason || attempt.current?.uuid !== state?.document_uuid) attempt.current = { reason, key: crypto.randomUUID(), uuid:state?.document_uuid };
    try {
      const response = await fetch(action === 'request' ? path : `${path}/reconcile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: action === 'request' ? JSON.stringify({ reason, idempotency_key: attempt.current.key, ...(state?.document_uuid ? {expected_uuid:state.document_uuid} : {}), ...(state?.environment === 'production' ? {confirm_real_operation:true} : {}) }) : undefined,
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? 'Operación sin confirmar; consulta el estado antes de reintentar');
      setState(value); onStatusChange?.(value.status, paymentId); setConfirmed(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error de conexión');
      // Read persisted outcome after a lost response; this GET cannot resubmit cancellation.
      try {
        const response = await fetch(path, { cache: 'no-store' });
        if (response.ok) { const value = await response.json(); setState(value); onStatusChange?.(value.status, paymentId); }
      } catch { /* The operator can retry the read; the operation key remains stable. */ }
    }
    finally { operation.current = false; setBusy(false); }
  }
  return <section className="mt-3 rounded border border-zinc-300 bg-white p-3 text-zinc-900">
    <h4 className="font-medium">Cancelación de {paymentId ? 'complemento' : 'factura'}{state?.environment === 'production' ? ' · comprobante real' : ' · pruebas'}</h4>
    <p className="mt-1 text-sm" role="status">{state ? LABEL[state.status] : 'Consultando estado…'}</p>
    {state ? <ProposalFiscalEvidence evidence={state} /> : null}
    {state?.document_uuid ? <p className="mt-1 break-all text-xs">UUID del comprobante: {state.document_uuid}</p> : null}
    {error ? <p role="alert" className="mt-2 text-sm text-rose-800">{error}</p> : null}
    {state?.status === 'not_requested' || state?.status === 'not_sent' ? <fieldset disabled={busy} className="mt-3 space-y-2">
      <label className="block text-sm">Motivo<select className="mt-1 block w-full rounded border p-2" value={reason} onChange={event => { setConfirmed(false); setReason(event.target.value as '02' | '03'); }}>
        <option value="02">02 · Comprobante con errores sin relación</option><option value="03">03 · No se llevó a cabo la operación</option>
      </select></label>
      <p className="text-xs text-zinc-600">Para sustituir este comprobante utiliza «Corregir y sustituir» y confirma primero la nueva emisión.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Confirmo que revisé el comprobante y el motivo para solicitar su cancelación{state?.environment === 'production' ? ' real' : ' en pruebas'}.</label>
      <button type="button" disabled={!confirmed || busy || (state?.environment === 'production' && !state.document_uuid)} onClick={() => void execute('request')} className="rounded border border-rose-500 px-3 py-2 text-sm text-rose-900 disabled:opacity-50">{state?.environment === 'production' ? 'Solicitar cancelación real' : 'Solicitar cancelación en pruebas'}</button>
    </fieldset> : null}
    {state && !['not_requested', 'cancelled', 'not_sent'].includes(state.status) ? <button type="button" disabled={busy} onClick={() => void execute('reconcile')} className="mt-2 rounded border px-3 py-2 text-sm disabled:opacity-50">Consultar estado fiscal sin repetir solicitud</button> : null}
    {state?.acknowledgement_xml ? <a className="mt-2 inline-block rounded border px-3 py-2 text-sm" href={`${path}?download=1`}>{state.status === 'cancelled' ? 'Descargar acuse de cancelación' : 'Descargar acuse de solicitud'}</a> : null}
    {paymentId ? <p className="mt-2 text-xs text-zinc-600">Cancelar el complemento conserva el pago recibido y su historial. La corrección del complemento requiere revisión.</p> : null}
  </section>;
}
