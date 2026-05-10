import type { ProposalStatus } from "@/lib/validations/proposals";

export type ProposalApproverRole = "superadmin" | "owner" | "admin" | "user";

const allowedTransitions: Record<ProposalStatus, ProposalStatus[]> = {
  approved: ["approved", "in_review", "sent"],
  draft: ["draft", "sent"],
  expired: ["expired"],
  in_review: ["in_review", "approved", "rejected", "expired"],
  rejected: ["rejected"],
  sent: ["sent", "in_review", "approved", "rejected", "expired"],
};

export type ProposalWorkflowGuardInput = {
  currentStatus: ProposalStatus;
  hasContentUpdate: boolean;
  marginCanAuthorizeFinal: boolean;
  nextStatus: ProposalStatus;
};

export function canTransitionProposalStatus(current: ProposalStatus, next: ProposalStatus): boolean {
  return allowedTransitions[current].includes(next);
}

export function assertProposalWorkflowGuard(input: ProposalWorkflowGuardInput): void {
  if (input.currentStatus === "approved" && input.hasContentUpdate && input.nextStatus === "approved") {
    throw new Error("La propuesta ya esta autorizada. Cambia el estado a En revision o Enviada para editarla.");
  }

  if (!canTransitionProposalStatus(input.currentStatus, input.nextStatus)) {
    throw new Error(`Transicion invalida: ${input.currentStatus} -> ${input.nextStatus}`);
  }

  if (input.nextStatus === "approved" && !input.marginCanAuthorizeFinal) {
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