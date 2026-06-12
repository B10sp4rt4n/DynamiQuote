import type { ProposalStatus } from "@/lib/validations/proposals";

export type ProposalApproverRole = "superadmin" | "owner" | "admin" | "user";

const allowedTransitions: Record<ProposalStatus, ProposalStatus[]> = {
  // approved puede retroceder a revisión o reenvío para correcciones
  approved: ["approved", "in_review", "sent"],
  // draft puede avanzar a enviada, solicitar revisión interna, o aprobarse automáticamente cuando el margen lo permite
  draft: ["draft", "sent", "in_review", "approved"],
  // expirada puede reactivarse para revisión
  expired: ["expired", "in_review", "draft"],
  in_review: ["in_review", "approved", "rejected", "expired"],
  // rechazada puede reactivarse para revisión
  rejected: ["rejected", "in_review", "draft"],
  sent: ["sent", "in_review", "approved", "rejected", "expired"],
};

export type ProposalWorkflowGuardInput = {
  allowApprovedTermsUpdate: boolean;
  currentStatus: ProposalStatus;
  hasContentUpdate: boolean;
  marginCanAuthorizeFinal: boolean;
  nextStatus: ProposalStatus;
};

export function canTransitionProposalStatus(current: ProposalStatus, next: ProposalStatus): boolean {
  return allowedTransitions[current].includes(next);
}

export function assertProposalWorkflowGuard(input: ProposalWorkflowGuardInput): void {
  // Bloquear edición de contenido en propuesta aprobada sin cambiar estado
  if (
    input.currentStatus === "approved" &&
    input.nextStatus === "approved" &&
    input.hasContentUpdate &&
    !input.allowApprovedTermsUpdate
  ) {
    throw new Error("La propuesta ya esta autorizada");
  }

  if (!canTransitionProposalStatus(input.currentStatus, input.nextStatus)) {
    throw new Error(`Transicion invalida: ${input.currentStatus} -> ${input.nextStatus}`);
  }

  // El guard de margen NO aplica cuando la propuesta ya fue enviada al cliente (estado "sent").
  // En ese escenario, "aprobada" registra la aceptación del cliente; la propuesta ya pasó
  // validación de margen cuando fue aprobada internamente antes de enviarse.
  if (input.nextStatus === "approved" && !input.marginCanAuthorizeFinal && input.currentStatus !== "sent") {
    throw new Error("La politica de margen bloquea la autorizacion final de esta propuesta.");
  }
}

export function shouldClearProposalApprovals(hasContentUpdate: boolean, approvalCount: number): boolean {
  return hasContentUpdate && approvalCount > 0;
}

export function assertApprovalActorEligibility(actor: {
  approverRole: ProposalApproverRole;
  userId: string | null;
}): void {
  if (!actor.userId) {
    throw new Error("No se pudo identificar al aprobador.");
  }

  if (actor.approverRole === "user") {
    throw new Error("Solo Owner, Admin o Superadmin pueden participar en aprobaciones.");
  }
}

export function resolveApprovalGateError(missingRoles: Array<"owner" | "superadmin">): string | null {
  if (missingRoles.includes("owner")) {
    return "Falta la aprobacion de Owner para autorizar la propuesta.";
  }

  if (missingRoles.includes("superadmin")) {
    return "Este tenant requiere observador Superadmin para autorizacion final.";
  }

  return null;
}