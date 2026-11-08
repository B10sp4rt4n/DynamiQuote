'use client';
import { useEffect, useRef, useState } from 'react';
import type { FiscalCorrection } from '@/lib/integrations/digestor-fiscal';

const STATUS = { prepared: 'Corrección preparada para revisión', processing: 'Emisión pendiente de confirmar',
  unknown: 'Resultado incierto: recupera el XML antes de continuar', rejected: 'Sustituta rechazada por el proveedor', stamped: 'Sustituta timbrada' };
const FIELD_LABELS: Record<string, string> = { customer_name: 'Nombre o razón social', customer_zip: 'Código postal fiscal',
  customer_regimen: 'Régimen fiscal', customer_use_cfdi: 'Uso CFDI', operation_reference: 'Referencia fiscal del pago', payment_form: 'Forma de pago', payment_method: 'Método de pago' };

export function ProposalCorrectionPanel({ proposalId, paymentId }: { proposalId: string; paymentId?: string }) {
  const base = `/api/proposals/${encodeURIComponent(proposalId)}/invoice`;
  const path = paymentId ? `${base}/payments/${encodeURIComponent(paymentId)}/receipt/correction` : `${base}/correction`;
  const [state, setState] = useState<FiscalCorrection | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [uuid, setUuid] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(path, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'No se pudo consultar el historial fiscal');
      if (!controller.signal.aborted) { setState(data); setFields(Object.fromEntries(Object.entries(data.defaults).map(([key,value]) => [key,String(value ?? '')]))); }
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Error de consulta'); });
    return () => controller.abort();
  }, [path]);

  async function run(action: 'create' | 'stamp' | 'reconcile' | 'abandon' | 'cancel-original' | 'confirm-cancellation' | 'read') {
    if (operation.current || (['create','stamp','cancel-original'].includes(action) && !confirmed)) return;
    operation.current = true; setBusy(true); setError(null);
    try {
      let body: string | undefined;
      if (action === 'create') {
        const changes = Object.fromEntries(Object.entries(fields).filter(([key,value]) => value !== (state?.defaults[key] ?? '')));
        if (!Object.keys(changes).length) throw new Error('Modifica al menos un dato fiscal antes de preparar la sustitución');
        const input = { source_uuid: state?.active_uuid, reason, changes };
        const fingerprint = JSON.stringify(input);
        if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
        body = JSON.stringify({ ...input, idempotency_key: attempt.current.key, ...(state?.environment === 'production' ? {confirm_real_operation:true} : {}) });
      } else if (action === 'reconcile') body = JSON.stringify({ receipt_uuid: uuid });
      else if (['stamp','cancel-original'].includes(action) && state?.environment === 'production') body = JSON.stringify({confirm_real_operation:true});
      const response = await fetch(['create','read'].includes(action) ? path : `${path}/${action}`, {
        method: action === 'read' ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Operación sin confirmar; consulta el estado antes de reintentar');
      setState(data); setConfirmed(false);
      setFields(Object.fromEntries(Object.entries(data.defaults).map(([key,value]) => [key,String(value ?? '')])));
      if (!data.pending) { attempt.current = null; setReason(''); }
      window.dispatchEvent(new Event('cotiza:fiscal-updated'));
    } catch (error) { setError(error instanceof Error ? error.message : 'Error de conexión'); }
    finally { operation.current = false; setBusy(false); }
  }
  const current = state?.pending ? state.history.at(-1) : undefined;
  const step = !current ? (state?.history.length ? 4 : 1) : current.status !== 'stamped' ? 2
    : current.source_cancellation_status === 'not_requested' ? 3 : 4;
  return <section className="mt-4 rounded-lg border border-blue-300 bg-white p-4 text-zinc-900">
    <h4 className="font-semibold">Corregir y sustituir {paymentId ? 'complemento' : 'factura'}{state?.environment === 'production' ? ' · comprobante real' : ' · pruebas'}</h4>
    <ol aria-label="Flujo de sustitución" className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      {['Revisar corrección','Emitir sustituta','Solicitar cancelación anterior','Confirmar estado'].map((label,index) => <li key={label}
        className={`rounded border p-2 ${index+1 === step ? 'border-blue-600 bg-blue-50 font-semibold' : 'border-zinc-200'}`}>{index+1}. {label}</li>)}
    </ol>
    <p className="mt-2 text-xs text-zinc-600">El RFC, los importes y los pagos recibidos se conservan. {paymentId ? 'Puedes corregir forma y referencia del último complemento.' : 'Puedes corregir datos del receptor y método o forma de pago si la factura aún no tiene pagos registrados.'}</p>
    {error ? <p role="alert" className="mt-2 text-sm text-rose-800">{error}</p> : null}
    <button type="button" disabled={busy} className="mt-2 rounded border px-3 py-2 text-sm disabled:opacity-50" onClick={() => void run('read')}>Consultar historial y estado</button>
    {state ? <>
      <p className="mt-2 break-all text-xs">Comprobante activo en Cotiza: {state.active_uuid}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-sm"><a className="rounded border px-3 py-2" href={`${path}?format=xml`}>XML activo</a><a className="rounded border px-3 py-2" target="_blank" rel="noreferrer" href={`${path}?format=pdf`}>PDF activo</a></div>
      {state.can_correct === false ? <p className="mt-3 text-sm text-amber-900">El comprobante tiene una cancelación registrada. Conserva su expediente y revisa el estado fiscal antes de corregir.</p> : null}
      {!current && state.can_correct !== false ? <fieldset disabled={busy} className="mt-4 grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-medium">Datos para la sustituta</legend>
        {(paymentId ? ['operation_reference'] : ['customer_name','customer_zip','customer_regimen','customer_use_cfdi']).map(key => <label key={key} className="text-sm">{FIELD_LABELS[key]}
          <input className="mt-1 w-full rounded border p-2" value={fields[key] ?? ''} onChange={event => { setConfirmed(false); setFields(previous => ({ ...previous,[key]:event.target.value })); }} />
        </label>)}
        {!paymentId ? <label className="text-sm">Método de pago<select className="mt-1 w-full rounded border p-2" value={fields.payment_method ?? 'PUE'} onChange={event => { setConfirmed(false); setFields(previous => ({ ...previous,payment_method:event.target.value,payment_form:event.target.value === 'PPD' ? '99':'03' })); }}><option value="PUE">PUE</option><option value="PPD">PPD</option></select></label> : null}
        <label className="text-sm">Forma de pago<select className="mt-1 w-full rounded border p-2" value={fields.payment_form ?? '03'} disabled={!paymentId && fields.payment_method === 'PPD'} onChange={event => { setConfirmed(false); setFields(previous => ({ ...previous,payment_form:event.target.value })); }}>
          <option value="01">01 · Efectivo</option><option value="02">02 · Cheque nominativo</option><option value="03">03 · Transferencia</option><option value="04">04 · Tarjeta de crédito</option><option value="28">28 · Tarjeta de débito</option>{!paymentId ? <option value="99">99 · Por definir</option> : null}
        </select></label>
        <label className="text-sm sm:col-span-2">Motivo de la corrección<textarea className="mt-1 w-full rounded border p-2" value={reason} maxLength={500} onChange={event => { setConfirmed(false); setReason(event.target.value); }} /></label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Revisé los datos que se corregirán y el motivo.</label>
        <button type="button" disabled={busy || !confirmed || reason.trim().length < 5} className="rounded bg-blue-800 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={() => void run('create')}>Preparar sustitución para revisión</button>
      </fieldset> : current ? <div className="mt-4 space-y-2 text-sm">
        <p role="status" className="font-medium">{STATUS[current.status]}</p><p className="break-all text-xs">UUID anterior: {current.source_uuid}</p>
        <p>Motivo: {current.reason}</p>
        <dl className="rounded border border-blue-200 bg-blue-50 p-3">{Object.entries(current.changes ?? {}).map(([key,value]) => <div key={key} className="mt-1"><dt className="font-medium">{FIELD_LABELS[key] ?? key}</dt><dd className="break-words">{value}</dd></div>)}</dl>
        {current.result_uuid ? <><p className="break-all text-xs">UUID sustituto: {current.result_uuid}</p><a className="inline-block rounded border px-3 py-2" href={`${path}?format=xml&revision=${encodeURIComponent(current.id)}`}>XML de la sustituta emitida</a></> : null}
        {['prepared','rejected'].includes(current.status) ? <>
          <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Confirmo los datos preparados para emitir la sustituta{state?.environment === 'production' ? ' real' : ' en pruebas'}.</label>
          <button type="button" disabled={busy || !confirmed} className="rounded border border-amber-500 px-3 py-2 disabled:opacity-50" onClick={() => void run('stamp')}>{state?.environment === 'production' ? 'Emitir sustituta real' : 'Timbrar sustituta en pruebas'}</button>
          <button type="button" disabled={busy} className="ml-2 rounded border px-3 py-2 disabled:opacity-50" onClick={() => void run('abandon')}>Descartar corrección sin emitir</button>
        </> : null}
        {['processing','unknown'].includes(current.status) ? <>
          <label className="block">UUID confirmado por el proveedor<input className="mt-1 w-full rounded border p-2" value={uuid} onChange={event => setUuid(event.target.value)} /></label>
          <button type="button" disabled={busy || !uuid} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => void run('reconcile')}>Recuperar sustituta sin volver a timbrar</button>
        </> : null}
        {current.status === 'stamped' && ['not_requested','not_sent'].includes(current.source_cancellation_status) ? <>
          <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Confirmo solicitar la cancelación del comprobante anterior con motivo01 y esta sustituta.</label>
          <button type="button" disabled={busy || !confirmed} className="rounded border border-rose-500 px-3 py-2 disabled:opacity-50" onClick={() => void run('cancel-original')}>{state?.environment === 'production' ? 'Solicitar cancelación real del anterior' : 'Solicitar cancelación del anterior en pruebas'}</button>
        </> : null}
        {current.status === 'stamped' && !['not_requested','not_sent'].includes(current.source_cancellation_status) ? <button type="button" disabled={busy} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => void run('confirm-cancellation')}>Consultar confirmación de cancelación</button> : null}
      </div> : null}
      {state.history.length ? <details className="mt-3 text-sm"><summary>Historial de sustituciones ({state.history.length})</summary><ol className="mt-2 space-y-2">{state.history.map(row => <li key={row.id} className="break-all rounded border p-2 text-xs">{row.source_uuid} → {row.result_uuid ?? 'pendiente'} · Cancelación anterior: {row.source_cancellation_status}</li>)}</ol></details> : null}
      {state.archived_history?.length ? <details className="mt-3 text-sm"><summary>Correcciones descartadas sin emitir ({state.archived_history.length})</summary><ol className="mt-2 space-y-2">{state.archived_history.map(row => <li key={row.id} className="break-all rounded border p-2 text-xs">{row.source_uuid} · {row.reason}</li>)}</ol></details> : null}
    </> : !error ? <p className="mt-2 text-sm">Consultando datos fiscales…</p> : null}
  </section>;
}
