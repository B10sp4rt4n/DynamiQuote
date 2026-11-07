"use client";
import { useEffect, useState } from "react";
import type { WonPolicy } from "@/lib/notifications/won";
type User = { user_id: string; first_name: string; last_name: string; email: string | null };
type Preview = { subject: string; text: string; message: string; missingEmailCount: number;
  emails: { email: string; reasons: string[] }[]; inApp: { userId: string; reasons: string[] }[] };
export function WonNotificationPilot({ opportunityId, canConfigure }: { opportunityId: string; canConfigure: boolean }) {
  const [policy, setPolicy] = useState<WonPolicy | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/opportunities/${encodeURIComponent(opportunityId)}/won-event`;
  useEffect(() => {
    if (!canConfigure) return;
    const controller = new AbortController();
    fetch("/api/settings/won-notifications", { signal: controller.signal }).then(async r => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      setPolicy(data.policy); setUsers(data.users);
    }).catch(e => { if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : "No se pudo cargar la configuración"); });
    return () => controller.abort();
  }, [canConfigure]);
  async function save() {
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/settings/won-notifications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(policy) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      setPolicy(data.policy); setPreview(null); setMessage("Configuración guardada para los próximos cierres de esta empresa. Sin envíos reales.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  async function loadPreview() {
    setBusy(true); setMessage(""); setPreview(null);
    try { const r = await fetch(endpoint); const data = await r.json(); if (!r.ok) throw new Error(data.error); setPreview(data); }
    catch (e) { setMessage(e instanceof Error ? e.message : "No se pudo cargar la prueba"); } finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
    <h2 className="text-xl font-semibold">Aviso de cierre ganado · Piloto</h2>
    <p className="mt-2 text-sm">Prueba sin envíos. Si una persona es responsable y designada por administración, se prepara un solo correo y un solo aviso interno con ambos motivos. Los correos se agrupan también por dirección.</p>
    {canConfigure && policy ? <fieldset disabled={busy} className="mt-4 space-y-3">
      <legend className="font-semibold">Configuración para esta empresa</legend>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={policy.enabled} onChange={e => setPolicy({ ...policy, enabled: e.target.checked })}/>Capturar próximos cierres para la prueba</label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={policy.includeOwner} onChange={e => setPolicy({ ...policy, includeOwner: e.target.checked })}/>Avisar al responsable de la oportunidad</label>
      <p className="text-sm font-semibold">Otros usuarios designados</p>
      {users.map(u => <label key={u.user_id} className="flex min-h-11 items-center gap-3 break-words"><input type="checkbox" checked={policy.designatedUserIds.includes(u.user_id)} onChange={e => setPolicy({ ...policy, designatedUserIds: e.target.checked ? [...policy.designatedUserIds, u.user_id] : policy.designatedUserIds.filter(id => id !== u.user_id) })}/><span>{u.first_name} {u.last_name} · {u.email ?? "Sin correo configurado"}</span></label>)}
      <button type="button" onClick={save} className="min-h-11 rounded-lg bg-blue-800 px-4 py-2 font-semibold text-white">Guardar configuración de prueba</button>
    </fieldset> : null}
    <div className="mt-4 flex flex-wrap gap-4"><button type="button" disabled={busy} onClick={loadPreview} className="min-h-11 rounded-lg border border-blue-800 bg-white px-4 py-2 font-semibold text-blue-900">Revisar aviso del último cierre</button>
    {preview ? <a className="inline-flex min-h-11 items-center font-semibold text-blue-900 underline" href={`${endpoint}?download=1`}>Descargar JSON del cierre</a> : null}</div>
    <p role="status" className="mt-3 text-sm">{busy ? "Procesando…" : message}</p>
    {preview ? <div className="mt-4 space-y-3 rounded-lg bg-white p-4"><p className="font-semibold">{preview.message}</p><p>Correos preparados: {preview.emails.length} · Avisos internos preparados: {preview.inApp.length}</p>
      {preview.emails.map(e => <p className="break-words text-sm" key={e.email}>{e.email} · {e.reasons.join(" + ")}</p>)}
      {preview.missingEmailCount ? <p className="text-sm">Destinatarios sin correo válido: {preview.missingEmailCount}. Completa sus datos antes de habilitar envíos.</p> : null}
      <p className="font-semibold">Asunto: {preview.subject}</p><p className="whitespace-pre-wrap break-words text-sm">{preview.text}</p></div> : null}
  </section>;
}
