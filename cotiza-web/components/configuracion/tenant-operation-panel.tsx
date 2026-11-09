"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { OPERATION_MODES, OPERATION_MODE_DETAILS, isOperationMode, type OperationMode } from "@/lib/tenant-operation";
import { MERCADOLIBRE_CHANNEL } from "@/lib/tenant-capabilities";
import { TenantCapabilitiesPanel } from "./tenant-capabilities-panel";

export type TenantOperationPanelProps = {
  tenantId: string; tenantName: string; initialMode: OperationMode;
  canConfigure: boolean; mercadoLibreEntitled: boolean; mercadoLibreAvailable: boolean;
};

export function TenantOperationPanel({ tenantId, tenantName, initialMode, canConfigure,
  mercadoLibreEntitled, mercadoLibreAvailable }: TenantOperationPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [saved, setSaved] = useState(initialMode);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canConfigure || saving) return;
    setSaving(true); setMessage(null); setError(null);
    try {
      const response = await fetch("/api/settings/tenant-operation", { method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tenant-Context": tenantId },
        body: JSON.stringify({ mode }) });
      const result = await response.json();
      const resultMode: unknown = result.mode;
      if (!response.ok || !isOperationMode(resultMode)) throw new Error(result.error ?? "No se pudo guardar la modalidad.");
      setSaved(resultMode); setMode(resultMode);
      setMessage(`Modalidad ${OPERATION_MODE_DETAILS[resultMode].label} guardada para ${tenantName}.`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar la modalidad.");
    } finally { setSaving(false); }
  }

  return <div className="space-y-5 text-zinc-900">
    <form onSubmit={save} className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Modalidad de operación de {tenantName}</h2>
      <p className="mt-2 text-sm text-zinc-600">Define el perfil operativo de esta empresa. Los canales se habilitan por separado.</p>
      <fieldset disabled={!canConfigure || saving} className="mt-4 grid min-w-0 gap-3 md:grid-cols-3">
        <legend className="sr-only">Modalidad de operación</legend>
        {OPERATION_MODES.map(value => <label key={value}
          className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-4 ${mode === value ? "border-indigo-500 bg-indigo-50" : "border-zinc-200"}`}>
          <input type="radio" name="operation-mode" value={value} checked={mode === value}
            onChange={() => { setMode(value); setMessage(null); setError(null); }} className="mt-1 shrink-0" />
          <span><span className="block font-semibold">{OPERATION_MODE_DETAILS[value].label}</span>
            <span className="mt-1 block text-sm text-zinc-600">{OPERATION_MODE_DETAILS[value].description}</span></span>
        </label>)}
      </fieldset>
      <p className="mt-3 text-sm text-zinc-600">Esta selección guarda el perfil de la empresa. La caja, los arqueos y el inventario de un POS requieren una integración posterior.</p>
      {canConfigure ? <button type="submit" disabled={saving || mode === saved}
        className="mt-4 min-h-11 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">
        {saving ? "Guardando…" : "Guardar modalidad"}
      </button> : <p className="mt-3 text-sm text-zinc-600">Sólo superadmin puede cambiar la modalidad y habilitar canales.</p>}
      {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    </form>
    {canConfigure || mercadoLibreEntitled ? <section aria-labelledby="tenant-channels-heading" className="space-y-3">
      <h2 id="tenant-channels-heading" className="text-lg font-semibold">Canales de venta</h2>
      <p className="text-sm text-zinc-600">Mercado Libre es opcional en las tres modalidades. Cada empresa utiliza su propia cuenta.</p>
      {canConfigure ? <TenantCapabilitiesPanel key={`${tenantId}-${mercadoLibreEntitled}`} tenantId={tenantId}
        tenantName={tenantName} initialEnabled={mercadoLibreEntitled} capabilityKey={MERCADOLIBRE_CHANNEL} /> : null}
      {mercadoLibreAvailable ? <Link href="/configuracion/integraciones/mercadolibre"
        className="block rounded-xl border border-indigo-300 bg-indigo-50 p-5 font-semibold text-indigo-950">
        Conectar cuenta y consultar ventas de Mercado Libre
      </Link> : mercadoLibreEntitled ? <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
        Canal habilitado para esta empresa. Su puesta en servicio está pendiente.
      </p> : null}
    </section> : null}
  </div>;
}
