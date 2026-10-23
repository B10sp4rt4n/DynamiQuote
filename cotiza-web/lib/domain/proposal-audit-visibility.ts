import type { ProposalAuditTimelineItem } from "@/lib/db/proposal-audit";

// Lista positiva: los eventos nuevos quedan reservados a administradores hasta
// revisar su contenido. No pasar payloads completos, errores ni notas internas.
const OPERATIONAL_FIELDS: Record<string, readonly string[]> = {
  outcome_date_changed: ["previousOutcomeAt", "outcomeAt"],
  historical_creation_reference: [],
  outcome_changed: ["fromOutcome", "toOutcome", "trigger", "selectedCloseDate", "outcomeAt"],
  status_change_requested: ["fromStatus", "requestedStatus", "resultStatus", "ok"],
  document_issued: ["status", "watermark", "forced", "via"],
  document_blocked: ["via"],
  approval_decision: ["approverRole", "decision"],
  proposal_force_issue_consumed: ["consumedVia"],
  margin_override_window_granted: [],
  margin_override_denied: [],
};

export function projectProposalAuditTimeline(
  items: ProposalAuditTimelineItem[],
  canSeeInternalDetails: boolean,
): ProposalAuditTimelineItem[] {
  if (canSeeInternalDetails) return items;

  return items.flatMap((item) => {
    if (!Object.hasOwn(OPERATIONAL_FIELDS, item.type)) return [];
    const details: Record<string, unknown> = {};
    for (const field of OPERATIONAL_FIELDS[item.type]) {
      const value = item.details[field];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
        details[field] = value;
      }
    }
    if (item.type === "status_change_requested" && details.ok === false) {
      details.error = "La solicitud no pudo completarse. Consulta al administrador.";
    }
    if (item.type === "document_blocked") {
      details.reason = "La propuesta no cumple los requisitos de emisión. Consulta al administrador.";
    }
    return [{ actorName: item.actorName, createdAt: item.createdAt, details, id: item.id, type: item.type,
      ...(item.integrity ? { integrity: item.integrity } : {}) }];
  });
}
