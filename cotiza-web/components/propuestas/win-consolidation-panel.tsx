"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { mexicoCalendarDate } from "@/lib/domain/commercial-close-date";
import { isSatisfied, type WinAction, type WinView } from "@/lib/domain/won-consolidation";
import { CUSTOMER_CONFIRMATION_CHANNELS, type CustomerConfirmationInput } from "@/lib/domain/customer-confirmation";
const STATES: Record<WinView["state"], string> = {
  not_accepted: "Aceptación pendiente", pending: "Aceptada · pendiente de consolidación", blocked: "Aceptada · requiere corrección",
  evidence_pending: "Respaldo escrito pendiente",
  stale: "Documento modificado · requiere nueva aceptación", consolidated: "Ganada consolidada", legacy: "Ganada · cierre previo conservado", cancelled: "Aceptación retirada",
};
function date(value: string) { return new Date(value).toLocaleString("es-MX", { timeZone: "America/Mexico_City" }); }
export function WinConsolidationPanel({ proposalId, tenantId }: { proposalId: string; tenantId?: string }) {
  const router = useRouter();
  const [view, setView] = useState<WinView | null>(null), [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [acceptedOn, setAcceptedOn] = useState(mexicoCalendarDate(new Date())), [evidence, setEvidence] = useState("");
  const [confirmation, setConfirmation] = useState<CustomerConfirmationInput>({ channel: "email", confirmedBy: "", contact: "" });
  const [file, setFile] = useState<File | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/proposals/${encodeURIComponent(proposalId)}/consolidation`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "No se pudo cargar el circuito");
        if (tenantId && body.tenantId !== tenantId) throw new Error("La empresa activa cambió. Recarga");
        if (!controller.signal.aborted) {
          setView(body as WinView); setUncertain(false);
          if (body.state === "evidence_pending" && body.case) {
            setAcceptedOn(body.case.acceptedOn);
            setConfirmation({ channel: "email", confirmedBy: body.case.customerConfirmation?.confirmedBy ?? "", contact: body.case.customerConfirmation?.contact ?? "" });
          }
        }
      }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "No se pudo cargar el circuito"); });
    return () => controller.abort();
  }, [proposalId, tenantId, reload]);
  async function submit(input: WinAction) {
    if (!view || busy || uncertain) return;
    setBusy(true); setError(null);
    try {
      const multipart = input.action === "accept" && file ? new FormData() : null;
      if (multipart && file) { multipart.set("data", JSON.stringify(input)); multipart.set("file", file); }
      const response = await fetch(`/api/proposals/${encodeURIComponent(proposalId)}/consolidation`, {
        method: "POST", headers: { ...(!multipart ? { "Content-Type": "application/json" } : {}), "X-Tenant-Context": view.tenantId }, body: multipart ?? JSON.stringify(input),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar");
      setView({ ...body, document: view.document }); setDecisionNotes({});
      if (input.action === "accept") {
        setFile(null); setEvidence("");
        if (body.state === "evidence_pending") setConfirmation(current => ({ ...current, channel: "email" }));
      }
      window.dispatchEvent(new Event("cotiza:approval-requests-changed")); router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar el guardado"); setUncertain(true);
    } finally { setBusy(false); }
  }
  function accept(event: FormEvent) {
    event.preventDefault();
    if (view) void submit({ action: "accept", expectedRevision: view.case?.revision ?? 0, expectedPolicyRevision: view.policy.revision, acceptedOn, evidence, confirmation });
  }
  const disabled = busy || uncertain;
  const evidenceRequired = view?.state === "evidence_pending" ? view.case?.customerEvidenceRequired : view?.policy.customerEvidenceRequired;
  return <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Consolidación de ganada">
    <h2 className="text-lg font-semibold text-zinc-900">Consolidación de ganada</h2>
    {!view && !error ? <p role="status">Consultando autorizaciones…</p> : null}
    {view ? <>
      <p role="status" className="font-medium text-blue-950">{STATES[view.state]}</p>
      <p className="text-sm text-zinc-700">La aceptación del cliente abre las validaciones de tu empresa. Los KPIs de ganadas se actualizan al consolidar.</p>
      {view.document ? <p className="break-words rounded-lg border border-blue-200 bg-white p-3 text-sm text-zinc-800">
        <strong>{view.document.proposalNumber ?? "Propuesta seleccionada"}</strong> · {view.document.customer ?? "Cliente por confirmar"}
        {view.document.amount !== null && view.document.currency ? ` · ${view.document.amount.toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${view.document.currency} antes de IVA` : " · Importe o moneda por confirmar"}
        {view.document.quoteId ? <span className="mt-1 block text-xs text-zinc-600">{view.document.quoteName || "Cotización vinculada"}{view.document.quoteVersion ? ` · Revisión ${view.document.quoteVersion}` : ""}</span> : null}
      </p> : null}
      {view.case ? <div className="break-words rounded-lg bg-white p-3 text-sm text-zinc-800">
        <p>Aceptación: {view.case.acceptedOn} · registrada {date(view.case.acceptedAt)} por {view.people?.[view.case.acceptedBy] ?? "Responsable registrado"}.</p>
        {view.case.customerConfirmation ? <>
          <p className="mt-1 font-medium">{view.case.customerConfirmation.channel === "verbal" ? "Respaldo escrito pendiente · confirmación verbal" : CUSTOMER_CONFIRMATION_CHANNELS[view.case.customerConfirmation.channel]}</p>
          <p>Confirmó: {view.case.customerConfirmation.confirmedBy}{view.case.customerConfirmation.contact ? ` · ${view.case.customerConfirmation.contact}` : ""}.</p>
          {view.case.customerConfirmation.attachment ? <a className="mt-2 inline-block break-all font-medium text-blue-800 underline"
            href={`/api/proposals/${encodeURIComponent(proposalId)}/consolidation/evidence/${encodeURIComponent(view.case.customerConfirmation.attachment.id)}`}>Descargar respaldo: {view.case.customerConfirmation.attachment.filename}</a> : null}
        </> : null}
        {view.case.acceptanceEvidence ? <p className="mt-1 whitespace-pre-wrap">{view.case.customerConfirmation?.channel === "verbal" ? "Notas" : "Confirmación registrada"}: {view.case.acceptanceEvidence}</p> : null}
        <p className="mt-1">Política aplicada: revisión {view.case.policyRevision}. {view.requirements.filter(r => isSatisfied(r.decision)).length} de {view.requirements.length} autorizaciones completas.</p>
        {view.case.consolidatedAt ? <p className="mt-1">Consolidación: {date(view.case.consolidatedAt)}.</p> : null}
      </div> : null}
      {view.canRecordAcceptance ? <form className="space-y-3 rounded-lg bg-white p-3" onSubmit={accept}>
        <h3 className="font-semibold text-zinc-950">¿Con qué evidencia cuentas para respaldar que el cliente aceptó esta propuesta?</h3>
        <label className="block text-sm font-medium">Medio de confirmación
          <select value={confirmation.channel} disabled={disabled} onChange={e => { setConfirmation({ ...confirmation, channel: e.target.value as CustomerConfirmationInput["channel"] }); setFile(null); }} className="mt-1 block w-full rounded-lg border border-zinc-400 bg-white p-2 text-zinc-900">
            {Object.entries(CUSTOMER_CONFIRMATION_CHANNELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
        <label className="block text-sm font-medium">¿Quién confirmó por parte del cliente?
          <input required minLength={2} maxLength={200} value={confirmation.confirmedBy} disabled={disabled} onChange={e => setConfirmation({ ...confirmation, confirmedBy: e.target.value })} className="mt-1 block w-full rounded-lg border border-zinc-400 p-2 text-zinc-900" /></label>
        <label className="block text-sm font-medium">Correo o teléfono del contacto (opcional)
          <input maxLength={300} value={confirmation.contact} disabled={disabled} onChange={e => setConfirmation({ ...confirmation, contact: e.target.value })} className="mt-1 block w-full rounded-lg border border-zinc-400 p-2 text-zinc-900" /></label>
        <label className="block text-sm font-medium">Fecha de aceptación del cliente
          <input type="date" required max={mexicoCalendarDate(new Date())} value={acceptedOn} disabled={disabled}
            onChange={e => setAcceptedOn(e.target.value)} className="mt-1 block max-w-full rounded-lg border border-zinc-400 p-2 text-zinc-900" /></label>
        <label className="block text-sm font-medium">{confirmation.channel === "verbal" ? "Notas de la confirmación verbal (opcional)" : "Pega la confirmación o los mensajes relevantes"}
          <textarea required={confirmation.channel !== "verbal" && !file} minLength={3} maxLength={20000} value={evidence} disabled={disabled} onChange={e => setEvidence(e.target.value)}
            placeholder="Incluye el mensaje y el contexto que identifica la propuesta, condiciones o versión aceptadas." className="mt-1 block w-full rounded-lg border border-zinc-400 p-2 text-zinc-900" /></label>
        {confirmation.channel !== "verbal" ? <label className="block text-sm font-medium">Adjuntar respaldo (opcional si pegaste la confirmación)
          <input key={`${confirmation.channel}:${file === null ? "empty" : "selected"}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.eml" disabled={disabled} className="mt-1 block w-full min-w-0 text-sm"
            onChange={e => { const selected = e.target.files?.[0] ?? null; if (selected && selected.size > 3 * 1024 * 1024) { setError("El archivo debe ocupar como máximo 3 MB."); e.target.value = ""; setFile(null); } else { setFile(selected); setError(null); } }} />
          <span className="mt-1 block break-words text-xs text-zinc-600">{file ? `Seleccionado: ${file.name}. ` : ""}PDF, PNG, JPG o correo original EML. Hasta 3 MB.</span></label> : null}
        {file ? <button type="button" disabled={disabled} onClick={() => setFile(null)} className="min-h-11 rounded-lg border border-zinc-400 px-3 py-2 text-sm">Quitar archivo</button> : null}
        <p className="text-xs text-zinc-600">El texto pegado se registra como captura manual. Incluye el contexto si la respuesta del cliente solo dice «adelante».</p>
        <p className="text-xs text-zinc-600">{evidenceRequired && confirmation.channel === "verbal" ? "Se guardará con respaldo escrito pendiente. Esta empresa exige completarlo antes de consolidar como ganada." : (view.state === "evidence_pending" ? view.case?.rules.length : view.policy.rules.length) ? "Se aplicarán los requisitos de la política vigente según sus condiciones." : "Sin requisitos adicionales y con el respaldo exigido completo, registrar la aceptación consolidará la ganada de inmediato."}</p>
        <button disabled={disabled || confirmation.confirmedBy.trim().length < 2 || (view.state === "evidence_pending" && confirmation.channel === "verbal") || (confirmation.channel !== "verbal" && evidence.trim().length < 3 && !file)} className="min-h-11 rounded-lg bg-blue-800 px-4 py-2 font-medium text-white disabled:opacity-50">{view.state === "evidence_pending" ? "Completar respaldo del cliente" : "Registrar aceptación del cliente"}</button>
      </form> : null}
      {view.requirements.length ? <ul className="space-y-3">{view.requirements.map(rule => <li key={rule.id} className="min-w-0 break-words rounded-lg border border-zinc-200 bg-white p-3 text-sm">
        <h3 className="font-semibold text-zinc-950">{rule.label} · {rule.decision?.decision === "approved" ? "OK" : rule.decision?.decision === "waived" ? "Excepción autorizada" : rule.decision?.decision === "rejected" ? "Observado" : "Pendiente"}</h3>
        <p className="mt-1 text-zinc-700">Responsables: {[...rule.approverRoles.map(role => role === "user" ? "Usuarios de la empresa" : role), ...rule.approverUserIds.map(id => view.people?.[id] ?? "Persona designada")].join(", ")}. {rule.allowSelfApproval ? "Permite autorizar al propio vendedor." : "Requiere una persona distinta del vendedor."}</p>
        {rule.waitingFor.length ? <p className="mt-1 text-amber-900">Esperando: {rule.waitingFor.map(id => view.requirements.find(r => r.id === id)?.label ?? id).join(", ")}</p> : null}
        {rule.decision ? <p className="mt-2 whitespace-pre-wrap text-zinc-700">{view.people?.[rule.decision.actorId] ?? "Responsable registrado"} · {date(rule.decision.recordedAt)} · {rule.decision.evidence || "Sin evidencia requerida"}</p> : null}
        {(rule.canDecide || rule.canWaive) && !rule.waitingFor.length ? <div className="mt-3 space-y-2">
          <label className="block font-medium">Evidencia o motivo: {rule.label}
            <textarea maxLength={2000} disabled={disabled} value={decisionNotes[rule.id] ?? ""} onChange={e => setDecisionNotes({ ...decisionNotes, [rule.id]: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-400 p-2 text-zinc-900" /></label>
          <div className="flex flex-wrap gap-2">{(["approved", "rejected", "waived"] as const).filter(d => d === "waived" ? rule.canWaive : rule.canDecide).map(decision => <button type="button" key={decision}
            disabled={disabled || ((rule.evidenceRequired || decision !== "approved") && (decisionNotes[rule.id] ?? "").trim().length < (decision === "waived" ? 10 : 3))}
            onClick={() => void submit({ action: "decide", expectedRevision: view.case!.revision, ruleId: rule.id, decision, evidence: decisionNotes[rule.id] ?? "" })}
            className="min-h-11 rounded-lg border border-zinc-400 px-3 py-2 font-medium text-zinc-900 disabled:opacity-50">{decision === "approved" ? "Dar OK" : decision === "rejected" ? "Observar / rechazar" : "Autorizar excepción"}</button>)}</div>
        </div> : null}
      </li>)}</ul> : null}
      {view.canConsolidate ? <button type="button" disabled={disabled} onClick={() => void submit({ action: "consolidate", expectedRevision: view.case!.revision })}
        className="min-h-11 rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50">Consolidar ganada</button> : null}
      {view.state === "consolidated" ? <div className="space-y-2 text-sm text-emerald-950"><p>Requisitos completos. Ganada consolidada.</p>
        {view.policy.procurementDraftsEnabled?<Link href={`/compras/propuestas/${encodeURIComponent(proposalId)}`} className="inline-block min-h-11 rounded-lg border border-emerald-400 bg-white px-4 py-3 font-medium underline">Ver requisición en Compras</Link>
          :<p>La preparación de requisiciones está desactivada para esta empresa.</p>}</div> : null}
      {view.canCancel ? <button type="button" disabled={disabled} onClick={() => void submit({ action: "cancel", expectedRevision: view.case!.revision })}
        className="min-h-11 rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-800 disabled:opacity-50">Retirar aceptación para corregir</button> : null}
      <Link href="/autorizaciones" className="block text-sm font-medium text-blue-800 underline">Ver autorizaciones de la empresa</Link>
    </> : null}
    {error ? <p role="alert" className="text-sm font-medium text-rose-800">{error}</p> : null}
    {(error || view) ? <button type="button" disabled={busy} onClick={() => { setView(null); setError(null); setDecisionNotes({}); setReload(reload + 1); }} className="min-h-11 rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-800">Recargar autorizaciones</button> : null}
  </section>;
}
