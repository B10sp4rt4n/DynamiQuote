import type { ProposalStatus } from "@/lib/validations/proposals";

// El estado de emision vive en proposals.issuance_status: "normal" | "force_pending".
// No se representa con NULL/presencia de dato -- ver CLAUDE.md, "Regla dura"
// sobre por que se evito esa forma para este campo.
export type ProposalIssuanceStatus = "normal" | "force_pending";

export type ProposalIssuanceDecision =
  | { kind: "allowed"; watermark: boolean; forced: boolean }
  | { kind: "blocked"; reason: string };

// Gate de emision de documentos (PDF, email, exportacion Excel) segun el
// estado de la propuesta:
// - draft: permitido siempre, con marca de "no validado" en el documento.
// - approved: permitido siempre, sin marca.
// - cualquier otro estado (sent, in_review, rejected, expired): bloqueado
//   por default, salvo que haya un forzamiento activo (issuance_status
//   === "force_pending") autorizado por Owner/Superadmin via el endpoint
//   dedicado -- ese forzamiento es de un solo uso, lo consume quien primero
//   lo use de las 3 rutas de entrega.
//
// La moneda NO es parte de este gate -- es un switch que se resuelve en el
// momento de imprimir/emitir (ver proposal-shell.tsx: si no esta elegida,
// se pregunta ahi mismo antes de continuar la accion), no una condicion
// que bloquee la propuesta completa.
export function resolveProposalIssuanceGate(input: {
  status: ProposalStatus;
  issuanceStatus: ProposalIssuanceStatus;
}): ProposalIssuanceDecision {
  if (input.status === "draft") {
    return { kind: "allowed", watermark: true, forced: false };
  }

  if (input.status === "approved") {
    return { kind: "allowed", watermark: false, forced: false };
  }

  if (input.issuanceStatus === "force_pending") {
    return { kind: "allowed", watermark: false, forced: true };
  }

  return {
    kind: "blocked",
    reason:
      "La propuesta debe estar aprobada para emitir este documento. Un Owner o Superadmin puede forzar la emision.",
  };
}

// Rol elegible para forzar la emision -- Owner o Superadmin exclusivamente,
// mismo criterio ya usado en evaluateApprovalGate.ownerApproved (admin no
// cuenta como aprobador ahi tampoco).
export function isForceIssuanceEligibleRole(role: "superadmin" | "owner" | "admin" | "user"): boolean {
  return role === "superadmin" || role === "owner";
}
