"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useReverification } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import type { approvalState, exportApproval } from "@/lib/db/verified-authorization";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { approvalFetch, control, primary, localTime, SnapshotCard } from "./shared";

type State = Awaited<ReturnType<typeof approvalState>>;
export function PilotConsole({ state }: { state: State }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [link, setLink] = useState<{ url: string; id: string; qr: string } | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [label, setLabel] = useState("Mi credencial de aprobación");
  const [approver, setApprover] = useState(state.users.find(u => u.id === state.actorId && u.canApprove)?.id ?? state.users.find(u => u.canApprove)?.id ?? "");
  const [target, setTarget] = useState(state.actorId);
  const [kind, setKind] = useState("purchase");
  const [credentialId, setCredentialId] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [evidence, setEvidence] = useState<Awaited<ReturnType<typeof exportApproval>> | null>(null);
  // La PC se actualiza desde el servidor; no comparte ni recibe la sesión móvil.
  useEffect(() => {
    if (!state.requests.some(r => ["pending", "approved"].includes(r.state))) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [router, state.requests]);
  const bootstrap = useReverification(async (attempt: { prompted: boolean; challengeId: string }) => {
    const path = attempt.prompted ? "bootstrap" : "bootstrap/reverify";
    attempt.prompted = true;
    const response = await fetch(`/api/verified-authorization/${path}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Approval-Tenant": state.tenant.id }, body: JSON.stringify(attempt.prompted && path === "bootstrap" ? { challengeId: attempt.challengeId } : {}) });
    const result = await response.json();
    if (!response.ok && !result.clerk_error) throw new Error(result.error ?? "No se pudo habilitar el registro");
    return result;
  });
  function work(task: () => Promise<void>) {
    setMessage(""); start(async () => { try { await task(); router.refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : "No fue posible completar la operación"); } });
  }
  async function register(grantId: string) {
    const { startRegistration } = await import("@simplewebauthn/browser");
    const options = await approvalFetch<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }>("registration/options", state.tenant.id, { grantId, label });
    const response = await startRegistration({ optionsJSON: options.options });
    await approvalFetch("registration/verify", state.tenant.id, { challengeId: options.challengeId, response });
    setMessage("Credencial registrada. Ya puedes confirmar solicitudes compatibles con su política.");
  }
  async function create(form: FormData) {
    const input = kind === "purchase" ? { kind, approverUserId: approver, purchase: { folio: form.get("folio"), vendor: form.get("vendor"), description: form.get("description"), amount: form.get("amount"), currency: form.get("currency") } }
      : kind === "enrollment" ? { kind, approverUserId: approver, targetUserId: target } : { kind, approverUserId: approver, credentialId };
    const result = await approvalFetch<{ request: { id: string }; confirmationUrl: string }>("requests", state.tenant.id, input);
    const qr = await import("qrcode");
    setLink({ url: result.confirmationUrl, id: result.request.id, qr: await qr.toDataURL(result.confirmationUrl, { width: 280, margin: 2 }) });
    setQrVisible(!window.matchMedia("(pointer: coarse)").matches);
  }
  async function download(id: string) {
    const bundle = await approvalFetch(`requests/${id}/recordia`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `Recordia_Cotiza_${id}.json`; a.click(); URL.revokeObjectURL(url);
  }
  const linkRequest = state.requests.find(r => r.id === link?.id);
  return <div className="space-y-6 text-zinc-900">
    <div><p className="text-sm text-zinc-500">SynAppsSys · Capacidad premium en piloto</p><h1 className="text-2xl font-semibold">Autorización verificable</h1>
      <p className="mt-2 text-sm">Confirma una operación con tu credencial registrada y conserva su expediente Recordia.</p></div>
    <aside className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">Ensayo con datos sintéticos. Las compras generan un recibo simulado. Las altas y revocaciones sí administran las credenciales de este piloto.</aside>
    <p className="text-sm">Política: {state.singleDevice ? "credenciales de un solo autenticador" : "credenciales registradas; admite sincronizables"}. La verificación local puede usar biometría o PIN.</p>
    {message ? <p role="status" className="rounded-lg border border-zinc-300 bg-white p-3 text-sm">{message}</p> : null}
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="font-semibold">Mis credenciales</h2>
      {state.credentials.length ? <ul className="space-y-2">{state.credentials.map(c => <li key={c.id} className="break-words text-sm"><strong>{c.label}</strong> · {c.revokedAt ? "Revocada" : "Activa"} · {c.deviceType === "multiDevice" ? "Sincronizable" : "Un solo autenticador"}<span className="block break-all text-xs text-zinc-500">{c.id}</span></li>)}</ul> : <p className="text-sm">Aún no tienes credenciales de aprobación.</p>}
      {state.grants.length ? <><label className="block text-sm">Nombre de la credencial<input className={`${control} mt-1 block w-full`} value={label} maxLength={80} onChange={e => setLabel(e.target.value)} /></label>
        {state.grants.map(g => <button key={g.id} className={primary} disabled={pending} onClick={() => work(() => register(g.id))}>Registrar credencial · vence {localTime(g.expiresAt)}</button>)}</> : null}
      {state.bootstrapConfigured && !state.credentials.some(c => !c.revokedAt) ? <button className={control} disabled={pending} onClick={() => work(async () => { const intent = await approvalFetch<{ challengeId: string }>("bootstrap/prepare", state.tenant.id, {}); await bootstrap({ prompted: false, challengeId: intent.challengeId }); })}>Solicitar habilitación inicial</button> : null}
    </section>
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="mb-3 font-semibold">Nueva solicitud</h2>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); work(() => create(form)); }}>
        <label className="text-sm">Operación<select className={`${control} mt-1 block w-full`} value={kind} onChange={e => setKind(e.target.value)}><option value="purchase">Compra de ensayo</option>{state.isManager ? <><option value="enrollment">Habilitar nueva credencial</option><option value="revocation">Revocar credencial</option></> : null}</select></label>
        <label className="text-sm">Persona que autoriza<select className={`${control} mt-1 block w-full`} value={approver} required onChange={e => setApprover(e.target.value)}>{state.users.filter(u => kind === "purchase" ? u.canApprove : u.canManage).map(u => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
        {kind === "purchase" ? <>
          <label className="text-sm">Folio<input name="folio" className={`${control} mt-1 block w-full`} defaultValue="ENSAYO-SYN-001" maxLength={80} required /></label>
          <label className="text-sm">Proveedor<input name="vendor" className={`${control} mt-1 block w-full`} defaultValue="Proveedor sintético" maxLength={160} required /></label>
          <label className="text-sm">Importe total · dos decimales<input name="amount" className={`${control} mt-1 block w-full`} inputMode="decimal" pattern="(0|[1-9][0-9]{0,8})\.[0-9]{2}" defaultValue="1250.00" required /></label>
          <label className="text-sm">Moneda<select name="currency" className={`${control} mt-1 block w-full`}><option>MXN</option><option>USD</option></select></label>
          <label className="text-sm sm:col-span-2">Concepto<textarea name="description" className={`${control} mt-1 block w-full`} defaultValue="Validación del ciclo de aprobación SynAppsSys" maxLength={600} required /></label>
        </> : kind === "enrollment" ? <label className="text-sm sm:col-span-2">Usuario destinatario<select className={`${control} mt-1 block w-full`} value={target} onChange={e => setTarget(e.target.value)}>{state.users.map(u => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
          : <label className="text-sm sm:col-span-2">Credencial a revocar<select className={`${control} mt-1 block w-full`} value={credentialId} onChange={e => setCredentialId(e.target.value)} required><option value="">Selecciona una credencial</option>{state.managedCredentials.map(c => <option key={c.id} value={c.id}>{state.users.find(u => u.id === c.userId)?.name ?? c.userId} · {c.label}</option>)}</select></label>}
        <button className={primary} disabled={pending || !approver}>Preparar solicitud</button>
      </form>
    </section>
    {link && (!linkRequest || linkRequest.state === "pending") ? <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-5">
      <h2 className="font-semibold">Confirma desde tu celular</h2>
      {qrVisible ? <Image unoptimized src={link.qr} alt="QR del enlace de confirmación de esta solicitud" width={280} height={280} className="max-w-full" /> : null}
      <div className="flex flex-wrap gap-2"><a className={primary} href={link.url}>Continuar en este dispositivo</a>
        <button className={control} onClick={() => setQrVisible(v => !v)}>{qrVisible ? "Ocultar QR" : "Mostrar QR"}</button>
        <button className={control} onClick={async () => { try { await navigator.clipboard.writeText(link.url); setCopyStatus("Enlace copiado"); } catch { setCopyStatus("No se pudo copiar. Usa Continuar en este dispositivo."); } }}>Copiar enlace</button></div>
      <p className="text-sm" role="status">{copyStatus || "El enlace vence en cinco minutos y sólo permite confirmar a la cuenta destinataria."}</p>
    </section> : null}
    <section className="space-y-3"><h2 className="font-semibold">Solicitudes y expedientes</h2>
      {!state.requests.length ? <p className="text-sm">Aún no hay solicitudes.</p> : state.requests.map(r => <article key={r.id} className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <p className="font-medium">{r.kind === "purchase" ? "Compra de ensayo" : r.kind === "enrollment" ? "Alta de credencial" : "Revocación"} · {r.state}</p>
        <p className="break-all text-xs text-zinc-500">{r.id}</p><p className="text-sm">Vence {localTime(r.expiresAt)} · CDMX</p>
        <details><summary className="min-h-11 py-2 text-sm">Ver contenido de la operación</summary><SnapshotCard value={r.snapshot} hash={r.payloadHash} /></details>
        <div className="flex flex-wrap gap-2">{r.state === "approved" && r.initiatorUserId === state.actorId ? <button disabled={pending} className={primary} onClick={() => work(async () => { await approvalFetch(`requests/${r.id}/consume`, state.tenant.id, {}); })}>{r.kind === "purchase" ? "Ejecutar ensayo" : "Aplicar autorización"}</button> : null}
          {["pending", "approved"].includes(r.state) && r.initiatorUserId === state.actorId ? <button disabled={pending} className={control} onClick={() => work(async () => { await approvalFetch(`requests/${r.id}/cancel`, state.tenant.id, {}); })}>Cancelar</button> : null}
          <button disabled={pending} className={control} onClick={() => work(() => download(r.id))}>Descargar expediente Recordia</button></div>
        <button disabled={pending} className={control} onClick={() => work(async () => { setEvidence(await approvalFetch(`requests/${r.id}/recordia`)); })}>Ver bitácora Recordia</button>
        {evidence?.case_id === `request:${r.id}` ? <ol className="space-y-2 border-l border-zinc-300 pl-4">{evidence.events.map(e => {
          const record = e.record as { event_id: string; occurred_at_utc: string; event_type: string; actors: Array<{ actor_id: string }> };
          return <li key={record.event_id} className="text-sm"><strong>{record.event_type}</strong><span className="block">{localTime(record.occurred_at_utc)} · CDMX</span><span className="block break-all text-xs text-zinc-500">Actor: {record.actors[0]?.actor_id} · UTC: {record.occurred_at_utc}</span></li>;
        })}<li className="text-xs text-zinc-500">Integridad verificada por hashes. Preparado para custodia; sin sello de HotVault.</li></ol> : null}
      </article>)}
    </section>
    <Link className="text-sm underline" href="/autorizaciones">Volver a autorizaciones comerciales</Link>
  </div>;
}
