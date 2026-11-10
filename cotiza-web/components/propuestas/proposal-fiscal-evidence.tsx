import type { BillingCancellation } from '@/lib/integrations/digestor-fiscal';

export const CANCELLATION_LABELS: Record<BillingCancellation['status'], string> = {
  not_requested: 'Sin solicitud de cancelación', not_sent: 'Solicitud no enviada', processing: 'Envío pendiente de confirmar',
  requested: 'Cancelación solicitada; pendiente de confirmación', unknown: 'Resultado incierto; consulta al proveedor',
  rejected: 'Solicitud rechazada', cancelled: 'Cancelación confirmada',
};

type Evidence = Pick<BillingCancellation, 'status' | 'acknowledgement_xml' | 'checked_at' | 'sat_response'>;
export function ProposalFiscalEvidence({ evidence }: { evidence: Evidence }) {
  const date = evidence.checked_at ? new Date(evidence.checked_at) : null;
  const checked = date && Number.isFinite(date.getTime()) ? date : null;
  return <dl aria-label="Procedencia del estado fiscal" className="mt-2 space-y-1 rounded border border-zinc-200 p-3 text-xs text-zinc-700">
    <div><dt className="font-medium">Registro fiscal en Cotiza</dt><dd>{CANCELLATION_LABELS[evidence.status] ?? 'Estado no reconocido'} · fuente: Digestor Fiscal</dd></div>
    <div><dt className="font-medium">Acuse del PAC</dt><dd>{evidence.acknowledgement_xml ? 'Disponible para consulta; no acredita por sí solo la cancelación confirmada.' : 'Sin acuse disponible en esta respuesta.'}</dd></div>
    <div><dt className="font-medium">Respuesta SAT conservada</dt><dd>{evidence.sat_response?.Estado
      ? `${evidence.sat_response.Estado} · recibida a través del servicio fiscal`
      : 'Sin detalle SAT disponible en esta respuesta; no equivale a vigente ni a no localizado.'}</dd></div>
    <div><dt className="font-medium">Última verificación informada por el servicio fiscal</dt><dd>{checked
      ? <time dateTime={checked.toISOString()}>{new Intl.DateTimeFormat('es-MX', {timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'}).format(checked)} · Ciudad de México</time>
      : 'Fecha no disponible'}</dd></div>
  </dl>;
}
