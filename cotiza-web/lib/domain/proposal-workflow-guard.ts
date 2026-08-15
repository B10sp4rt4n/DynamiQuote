import type { ProposalStatus } from "@/lib/validations/proposals";

export type ProposalApproverRole = "superadmin" | "owner" | "admin" | "user";

const allowedTransitions: Record<ProposalStatus, ProposalStatus[]> = {
  // approved puede retroceder a revisión o reenvío para correcciones, o
  // reabrirse a borrador para editar contenido
  approved: ["approved", "in_review", "sent", "draft"],
  // draft puede avanzar a enviada, solicitar revisión interna, o aprobarse automáticamente cuando el margen lo permite
  draft: ["draft", "sent", "in_review", "approved"],
  // expirada puede reactivarse para revisión o reabrirse a borrador
  expired: ["expired", "in_review", "draft"],
  // in_review puede reabrirse a borrador para editar contenido
  in_review: ["in_review", "approved", "rejected", "expired", "draft"],
  // rechazada puede reactivarse para revisión o reabrirse a borrador
  rejected: ["rejected", "in_review", "draft"],
  // sent puede reabrirse a borrador para editar contenido
  sent: ["sent", "in_review", "approved", "rejected", "expired", "draft"],
};

export type ProposalWorkflowGuardInput = {
  allowApprovedTermsUpdate: boolean;
  // Omite unicamente el check de margen mas abajo -- el resto del guard
  // (transiciones permitidas, edicion de contenido en aprobada) sigue
  // aplicando igual. Lo usa executeMarginOverride, nunca el flujo normal.
  bypassMarginGuard?: boolean;
  currentStatus: ProposalStatus;
  hasContentUpdate: boolean;
  marginCanAuthorizeFinal: boolean;
  nextStatus: ProposalStatus;
};

export function canTransitionProposalStatus(current: ProposalStatus, next: ProposalStatus): boolean {
  return allowedTransitions[current].includes(next);
}

export function assertProposalWorkflowGuard(input: ProposalWorkflowGuardInput): void {
  // Bloquear edicion de contenido material fuera de "draft" sin reabrir --
  // antes esto solo aplicaba a "approved"; ahora aplica a cualquier estado
  // no-draft (in_review, sent, rejected, expired), porque draft es el
  // unico estado donde se edita libremente. Los campos "seguros" (terminos,
  // datos de contacto) siguen exentos en cualquier estado via
  // allowApprovedTermsUpdate (ver updateProposalWorkflowByTenant).
  if (
    input.currentStatus !== "draft" &&
    input.nextStatus === input.currentStatus &&
    input.hasContentUpdate &&
    !input.allowApprovedTermsUpdate
  ) {
    throw new Error("Debes reabrir la propuesta a borrador para editar su contenido.");
  }

  if (!canTransitionProposalStatus(input.currentStatus, input.nextStatus)) {
    throw new Error(`Transicion invalida: ${input.currentStatus} -> ${input.nextStatus}`);
  }

  // El guard de margen NO aplica cuando la propuesta ya fue enviada al cliente (estado "sent").
  // En ese escenario, "aprobada" registra la aceptación del cliente; la propuesta ya pasó
  // validación de margen cuando fue aprobada internamente antes de enviarse.
  if (
    input.nextStatus === "approved" &&
    input.currentStatus !== "approved" &&
    !input.marginCanAuthorizeFinal &&
    input.currentStatus !== "sent" &&
    !input.bypassMarginGuard
  ) {
    throw new Error("La politica de margen bloquea la autorizacion final de esta propuesta.");
  }
}

export function shouldClearProposalApprovals(input: {
  approvalCount: number;
  currentStatus: ProposalStatus;
  hasContentUpdate: boolean;
  nextStatus: ProposalStatus;
}): boolean {
  if (input.approvalCount === 0) {
    return false;
  }

  // Reabrir a borrador desde cualquier otro estado limpia las decisiones de
  // inmediato -- evita la ventana confusa de "estoy en borrador pero sigue
  // apareciendo aprobado/rechazado por alguien".
  if (input.nextStatus === "draft" && input.currentStatus !== "draft") {
    return true;
  }

  return input.hasContentUpdate;
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