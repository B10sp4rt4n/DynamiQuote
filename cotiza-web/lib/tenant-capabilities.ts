export const THREATDOWN_PDF_IMPORT = "threatdown_pdf_import";
export const MERCADOLIBRE_CHANNEL = "mercadolibre_channel";
export const TENANT_CAPABILITY_KEYS = [THREATDOWN_PDF_IMPORT, "cpq_guided_preview", "crm_workspace_pilot", "quote_playbook_field", MERCADOLIBRE_CHANNEL] as const;
export type TenantCapabilityKey = typeof TENANT_CAPABILITY_KEYS[number];

export const TENANT_CAPABILITY_DETAILS: Record<TenantCapabilityKey, { label: string; description: string }> = {
  threatdown_pdf_import: { label: "Importar cotizaciones PDF de ThreatDown", description: "Permite revisar el PDF y crear una nueva versión de cotización. Los permisos de cada usuario siguen aplicando." },
  cpq_guided_preview: { label: "Comparar opciones de cotización", description: "Permite comparar alternativas sin guardar cambios. Los permisos del vendedor siguen aplicando." },
  crm_workspace_pilot: { label: "Experiencia CRM piloto (superadmin)", description: "Reúne pendientes, oportunidades y clientes. Acceso piloto reservado a superadmin; no cambia la operación del equipo." },
  quote_playbook_field: { label: "Campo variable: guía comercial", description: "Desactivado por defecto. Al habilitarlo permite capturar una etiqueta comercial opcional al crear cotizaciones. No activa reglas de precios ni aprobaciones." },
  mercadolibre_channel: { label: "Canal Mercado Libre", description: "Opcional para esta empresa, en cualquier modalidad. Un owner o administrador conecta su cuenta y consulta ventas. No crea oportunidades ni emite facturas automáticamente." },
};
