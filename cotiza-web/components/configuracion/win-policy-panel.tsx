"use client";
import { useState, type FormEvent } from "react";
import { winPolicySchema, type WinPolicyVersion, type WinRule } from "@/lib/domain/won-consolidation";
type User = { userId: string; name: string; role?: string };
export function WinPolicyPanel({ initial, tenantId, tenantName, users }: { initial: WinPolicyVersion; tenantId: string; tenantName: string; users: User[] }) {
  const [policy, setPolicy] = useState(initial), [saving, setSaving] = useState(false), [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const disabled = saving || blocked;
  function change(id: string, value: Partial<WinRule>) { setPolicy({ ...policy, rules: policy.rules.map(r => r.id === id ? { ...r, ...value } : r) }); setMessage(null); }
  function add() {
    setPolicy({ ...policy, rules: [...policy.rules, { id: `regla_${crypto.randomUUID().slice(0, 8)}`, label: "Validación financiera", approverRoles: ["owner"], approverUserIds: [],
      allowSelfApproval: false, evidenceRequired: true, allowWaiver: false, dependsOn: [], minimumAmount: null, currency: null }] }); setMessage(null);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setError(null); setMessage(null);
    const parsed = winPolicySchema.safeParse({ rules: policy.rules, ...(policy.reviewNoticeUserIds ? { reviewNoticeUserIds: policy.reviewNoticeUserIds } : {}) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Revisa los requisitos"); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/settings/win-policy", { method: "PUT", headers: { "Content-Type": "application/json", "X-Tenant-Context": tenantId }, body: JSON.stringify({ policy: parsed.data, expectedRevision: policy.revision }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar");
      setPolicy(body.policy); setMessage("Política guardada. Se aplicará a las nuevas aceptaciones de esta empresa.");
    } catch (err) { setError(err instanceof Error ? err.message : "Guardado sin confirmar"); setBlocked(true); }
    finally { setSaving(false); }
  }
  return <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900">
    <h1 className="text-2xl font-semibold">Reglas para consolidar ganada</h1>
    <p className="text-sm">Empresa: <strong>{tenantName}</strong>. Configura los OK mínimos antes de consolidar y continuar hacia compras.</p>
    <p className="text-sm text-zinc-600">Sin requisitos adicionales se usa la regla mínima: aceptación del cliente. Los circuitos abiertos conservan la política aplicada; los cierres anteriores se mantienen.</p>
    <form onSubmit={save} className="space-y-4">
      {users.some(user => user.role === "owner") ? <fieldset disabled={disabled} className="space-y-2 rounded-xl border border-zinc-300 p-4">
        <legend className="px-2 font-semibold">Avisos de revisión interna</legend>
        <p className="text-sm text-zinc-600">Elige los owners que recibirán los pendientes en la campana de Cotiza. Sin selección se avisa a los owners de la empresa. Las aprobaciones de consolidación llegan a los responsables de cada requisito.</p>
        {users.filter(user => user.role === "owner").map(user => <label className="flex min-h-11 items-center gap-2 text-sm" key={user.userId}>
          <input type="checkbox" checked={policy.reviewNoticeUserIds?.includes(user.userId) ?? false} onChange={e => { setPolicy({ ...policy, reviewNoticeUserIds: e.target.checked ? [...(policy.reviewNoticeUserIds ?? []), user.userId] : (policy.reviewNoticeUserIds ?? []).filter(id => id !== user.userId) }); setMessage(null); }} />{user.name}
        </label>)}
      </fieldset> : null}
      {policy.rules.map((rule, index) => <fieldset key={rule.id} disabled={disabled} className="min-w-0 space-y-3 rounded-xl border border-zinc-300 p-4">
        <legend className="px-2 font-semibold">Requisito {index + 1}</legend>
        <label className="block text-sm font-medium">Nombre del requisito
          <input required minLength={3} maxLength={100} value={rule.label} onChange={e => change(rule.id, { label: e.target.value })} className="mt-1 block w-full rounded-lg border border-zinc-400 p-2" /></label>
        <div className="space-y-2 text-sm"><p className="font-medium">Puede autorizar cualquiera de estos responsables</p>
          <div className="flex flex-wrap gap-4">{(["owner", "admin", "user", "superadmin"] as const).map(role => <label key={role} className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={rule.approverRoles.includes(role)} onChange={e => change(rule.id, { approverRoles: e.target.checked ? [...rule.approverRoles, role] : rule.approverRoles.filter(r => r !== role) })} />{role === "user" ? "Cualquier usuario de la empresa" : role}</label>)}</div>
          {users.length ? <details><summary className="min-h-11 cursor-pointer py-2">Asignar personas específicas</summary><div className="space-y-1">{users.map(user => <label key={user.userId} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={rule.approverUserIds.includes(user.userId)} onChange={e => change(rule.id, { approverUserIds: e.target.checked ? [...rule.approverUserIds, user.userId] : rule.approverUserIds.filter(id => id !== user.userId) })} />{user.name}</label>)}</div></details> : null}
        </div>
        <div className="space-y-1 text-sm">{([
          ["allowSelfApproval", "Permitir que el vendedor dé su propio OK"], ["evidenceRequired", "Exigir evidencia o referencia documental"], ["allowWaiver", "Permitir excepción justificada por owner o superadmin"],
        ] as const).map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={rule[key]} onChange={e => change(rule.id, { [key]: e.target.checked })} />{label}</label>)}</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block max-w-full text-sm font-medium">Aplicar desde este importe (opcional)
            <input type="number" min="0" step="0.01" max="1000000000000" value={rule.minimumAmount ?? ""} onChange={e => change(rule.id, { minimumAmount: e.target.value === "" ? null : Number(e.target.value), currency: e.target.value === "" ? null : rule.currency ?? "MXN" })}
              className="mt-1 block w-full max-w-xs rounded-lg border border-zinc-400 p-2" /></label>
          {rule.minimumAmount !== null ? <label className="block text-sm font-medium">Moneda del umbral<select value={rule.currency ?? "MXN"} onChange={e => change(rule.id, { currency: e.target.value as WinRule["currency"] })} className="mt-1 block rounded-lg border border-zinc-400 p-2">{["MXN", "USD", "EUR"].map(c => <option key={c}>{c}</option>)}</select></label> : null}
        </div>
        {rule.minimumAmount !== null ? <p className="text-xs text-zinc-600">Se usa el importe integrado antes de IVA. Una moneda distinta detiene la aceptación para revisar la regla; no se convierte automáticamente.</p> : null}
        {policy.rules.some(r => r.id !== rule.id && r.minimumAmount === null) ? <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Autorizaciones que deben completarse antes</summary>{policy.rules.filter(r => r.id !== rule.id && r.minimumAmount === null).map(r => <label className="flex min-h-11 items-center gap-2 text-sm" key={r.id}><input type="checkbox" checked={rule.dependsOn.includes(r.id)} onChange={e => change(rule.id, { dependsOn: e.target.checked ? [...rule.dependsOn, r.id] : rule.dependsOn.filter(id => id !== r.id) })} />{r.label}</label>)}</details> : null}
        <button type="button" className="min-h-11 rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-800" onClick={() => setPolicy({ ...policy, rules: policy.rules.filter(r => r.id !== rule.id).map(r => ({ ...r, dependsOn: r.dependsOn.filter(id => id !== rule.id) })) })}>Quitar requisito</button>
      </fieldset>)}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={disabled || policy.rules.length >= 20} onClick={add} className="min-h-11 rounded-lg border border-zinc-400 px-4 py-2 font-medium disabled:opacity-50">Agregar requisito</button>
        <button disabled={disabled} className="min-h-11 rounded-lg bg-blue-800 px-4 py-2 font-medium text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar reglas de ganada"}</button></div>
    </form>
    {message ? <p role="status" className="text-sm text-emerald-800">{message}</p> : null}
    {error ? <p role="alert" className="text-sm text-rose-800">{error}</p> : null}
    {blocked ? <a className="inline-block min-h-11 py-2 font-medium text-blue-800 underline" href="/configuracion/consolidacion">Recargar política antes de continuar</a> : null}
  </section>;
}
