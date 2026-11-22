import type { RecordiaMemory, RecordiaTimelineEntry } from "./domain";
import type { MemoryRow } from "./reader";

const proposalStatuses: Record<string, string> = {
  approved: "Aprobada", draft: "Borrador", expired: "Vencida",
  in_review: "En revisión", rejected: "Rechazada", sent: "Enviada",
};
const outcomes: Record<string, string> = { won: "Propuesta ganada", lost: "Propuesta perdida", discarded: "Propuesta descartada" };
const documentFields: Record<string, string> = {
  subject: "Asunto", valid_until: "Vigencia", currency: "Moneda", terms_and_conditions: "Condiciones",
  custom_intro: "Introducción", objective: "Objetivo", recipient_contact_name: "Contacto",
  recipient_email: "Correo del contacto",
  recipient_contact_title: "Cargo del contacto", recipient_company: "Destinatario",
  issuer_company: "Emisor", issuer_contact_name: "Emisor", issuer_email: "Correo del emisor",
  client_logo_id: "Logotipo del cliente", issuer_logo_id: "Logotipo del emisor",
};

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function auditPayload(value: unknown): Record<string, unknown> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // Older records may have a payload that cannot be interpreted.
  }
  return {};
}

function describeAudit(row: MemoryRow, image: Record<string, unknown>): RecordiaTimelineEntry | undefined {
  const payload = auditPayload(image.payload);
  const folio = text(payload.proposalNumber) ?? row.proposal_folio ?? undefined;
  switch (image.event_type) {
    case "document_downloaded":
    case "document_issued": {
      if (payload.via === "email") {
        return { title: payload.recipientScope === "customer_owner_and_emitter"
          ? "Envío al contacto registrado" : "Envío por correo registrado", folio };
      }
      const status = proposalStatuses[String(payload.status)];
      const detail = [status, payload.watermark === true ? "Con marca de agua" : undefined,
        payload.forced === true ? "Emisión forzada" : undefined].filter(Boolean).join(" · ");
      if (payload.via === "xlsx") return { title: "Excel generado para descarga", detail, folio };
      if (payload.via !== "pdf") return { title: "Documento generado", detail, folio };

      const archived = image.event_type === "document_issued";
      const documentId = text(payload.documentId);
      const updatedAt = text(payload.documentUpdatedAt);
      const revision = archived
        ? row.archived_document_revision
        : documentId && updatedAt && JSON.stringify([documentId, updatedAt]);
      return {
        title: "PDF generado para descarga",
        detail, folio,
        ...(revision ? { pdf: { revision: JSON.stringify([image.proposal_id, revision, payload.status,
          payload.watermark === true, payload.forced === true]), archived } } : {}),
      };
    }
    case "status_change_requested": {
      if (payload.ok === false) return { title: "Cambio de estado bloqueado", folio };
      const previous = text(payload.fromStatus);
      const next = text(payload.resultStatus);
      if (payload.ok !== true || !next || previous === next) return;
      const title = next === "approved" ? "Propuesta aprobada"
        : next === "in_review" ? "Propuesta enviada a revisión"
        : next === "rejected" ? "Propuesta rechazada"
        : next === "draft" && previous === "approved" ? "Propuesta reabierta" : "Estado de la propuesta actualizado";
      const labels = [proposalStatuses[previous ?? ""], proposalStatuses[next]].filter(Boolean);
      return { title, folio, detail: labels.join(" → ") };
    }
    case "document_blocked":
      return { title: "Generación de documento bloqueada", folio };
    case "outcome_changed":
      return { title: outcomes[String(payload.toOutcome)] ?? "Desenlace comercial actualizado", folio };
    case "outcome_date_changed":
      return { title: "Fecha de cierre corregida", folio };
    case "proposal_synced_from_quote":
      return { title: "Propuesta actualizada desde la cotización", folio };
    case "invoice_preparation_saved":
      return { title: "Prefactura preparada", folio };
  }
}

export function describeRecordiaEvent(row: MemoryRow, image: Record<string, unknown>): RecordiaTimelineEntry | undefined {
  const folio = text(image.proposal_number) ?? text(image.opportunity_number) ?? undefined;
  if (row.source_table === "interaction_logs" && row.after_data) {
    return { title: row.event_type === "source.updated" ? "Nota comercial editada" : "Nota comercial registrada" };
  }
  if (row.event_type.startsWith("baseline.")) return;
  switch (row.source_table) {
    case "proposal_audit_events":
      if (row.after_data) return describeAudit(row, image);
      break;
    case "proposal_approvals":
      if (!row.after_data) break;
      if (image.decision === "approved") return { title: "Visto bueno registrado", folio: row.proposal_folio ?? undefined };
      if (image.decision === "rejected") return { title: "Rechazo registrado", folio: row.proposal_folio ?? undefined };
      if (image.decision === "overridden") return { title: "Excepción de aprobación registrada", folio: row.proposal_folio ?? undefined };
      break;
    case "formal_proposals":
      if (row.event_type === "source.created") return { title: "Propuesta creada", folio };
      if (row.event_type === "source.updated" && row.before_data) {
        const changes = [...new Set(Object.entries(documentFields)
          .filter(([key]) => row.before_data?.[key] !== image[key]).map(([, label]) => label))];
        if (changes.length) return { title: "Propuesta editada", folio, detail: changes.join(" · ") };
      }
      break;
    case "opportunities":
      if (row.event_type === "source.created") return { title: "Oportunidad creada", folio };
      if (row.event_type === "source.updated") return { title: "Oportunidad actualizada", folio };
      break;
    case "quotes":
      if (row.event_type === "source.created") {
        const version = text(image.version) ?? (typeof image.version === "number" ? String(image.version) : undefined);
        return { title: version && version !== "1" ? "Nueva versión de cotización" : "Cotización creada",
          detail: version ? `Versión ${version}` : undefined };
      }
      if (row.event_type === "source.updated" && row.before_data) {
        const changed = row.before_data.total_revenue !== image.total_revenue || row.before_data.total_cost !== image.total_cost
          || row.before_data.avg_margin !== image.avg_margin;
        if (changed) return { title: "Importes de cotización actualizados" };
      }
  }
}

export type RecordiaTimelineGroup = { entry: RecordiaTimelineEntry; records: RecordiaMemory[] };

export function groupRecordiaTimeline(items: RecordiaMemory[]): RecordiaTimelineGroup[] {
  const groups: RecordiaTimelineGroup[] = [];
  const downloads = new Map<string, RecordiaTimelineGroup>();
  for (const item of items) {
    const entry = item.timeline;
    if (!entry) continue;

    if (entry.pdf) {
      const key = JSON.stringify([entry.pdf.archived, entry.pdf.revision]);
      const group = downloads.get(key);
      const previous = group?.records.at(-1);
      // An older audit only identifies the last archived revision. Group nearby requests
      // conservatively, without claiming older requests rendered the same revision.
      const distance = previous && item.recorded_at_utc && previous.recorded_at_utc
        ? Date.parse(previous.recorded_at_utc) - Date.parse(item.recorded_at_utc) : Infinity;
      if (group && (!entry.pdf.archived || (distance >= 0 && distance <= 15_000))) {
        group.records.push(item);
        continue;
      }
      const next = { entry, records: [item] };
      downloads.set(key, next);
      groups.push(next);
    } else {
      groups.push({ entry, records: [item] });
    }
  }
  return groups;
}
