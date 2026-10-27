"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function TenantCapabilitiesPanel({ tenantName, initialEnabled, capabilityKey = "threatdown_pdf_import" }: { tenantName: string; initialEnabled: boolean; capabilityKey?: "threatdown_pdf_import" | "cpq_guided_preview" | "crm_workspace_pilot" | "quote_playbook_field" }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saved, setSaved] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage(null);
    try {
      const response = await fetch("/api/settings/tenant-capabilities", { method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilityKey, enabled }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la capacidad.");
      setSaved(result.enabled); setEnabled(result.enabled);
      setMessage(`${capabilityKey === "quote_playbook_field" ? "Guía comercial variable" : capabilityKey === "crm_workspace_pilot" ? "Experiencia CRM piloto" : capabilityKey === "cpq_guided_preview" ? "Comparación de opciones" : "Importación ThreatDown"} ${result.enabled ? "habilitada" : "deshabilitada"} para ${tenantName}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la capacidad.");
    } finally { setSaving(false); }
  }
  return (
    <form onSubmit={save} className="rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900">
      <h2 className="font-semibold text-zinc-900">Capacidades de {tenantName}</h2>
      <p className="mt-1 text-sm text-zinc-600">Sólo superadmin puede habilitar capacidades por empresa.</p>
      <label className="mt-4 flex items-center gap-3 text-sm">
        <input type="checkbox" checked={enabled} disabled={saving}
          onChange={(event) => { setEnabled(event.target.checked); setMessage(null); }} />
        {capabilityKey === "quote_playbook_field" ? "Campo variable: guía comercial" : capabilityKey === "crm_workspace_pilot" ? "Experiencia CRM piloto (superadmin)" : capabilityKey === "cpq_guided_preview" ? "Comparar opciones de cotización" : "Importar cotizaciones PDF de ThreatDown"}
      </label>
      <p className="mt-2 text-xs text-zinc-500">{capabilityKey === "quote_playbook_field" ? "Desactivado por defecto. Al habilitarlo permite capturar una etiqueta comercial opcional al crear cotizaciones. No activa reglas de precios ni aprobaciones." : capabilityKey === "crm_workspace_pilot" ? "Reúne pendientes, oportunidades y clientes. Acceso piloto reservado a superadmin; no cambia la operación del equipo." : capabilityKey === "cpq_guided_preview" ? "Permite comparar alternativas sin guardar cambios. Los permisos del vendedor siguen aplicando." : "Permite revisar el PDF y crear una nueva versión de cotización. Los permisos de cada usuario siguen aplicando."}</p>
      <button type="submit" disabled={saving || enabled === saved}
        className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">
        {saving ? "Guardando…" : "Guardar capacidades"}
      </button>
      {message ? <p role="status" className="mt-3 text-sm text-zinc-700">{message}</p> : null}
    </form>
  );
}
