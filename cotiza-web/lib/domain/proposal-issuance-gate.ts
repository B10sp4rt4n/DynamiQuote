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
// - sent (enviada al cliente por correo): permitido, sin marca, SOLO si el
//   margen ya calificaba para autorizacion final (marginCanAuthorizeFinal).
//   "sent" es alcanzable directo desde "draft" sin pasar por aprobacion
//   interna -- si el margen ya estaba dentro de politica en ese momento, no
//   tiene sentido bloquear la re-emision del mismo documento que ya se
//   entrego. Esto NO cambia el estatus a "approved": ese salto sigue
//   reservado a que el cliente decida ("Cliente acepto"/"Cliente rechazo"
//   en proposal-shell.tsx) o a una aprobacion formal -- aqui solo se deja
//   de bloquear la emision del documento.
// - cualquier otro estado (sent bloqueada por margen, in_review, rejected,
//   expired): bloqueado por default, salvo que haya un forzamiento activo
//   (issuance_status === "force_pending") autorizado por Owner/Superadmin
//   via el endpoint dedicado -- ese forzamiento es de un solo uso, lo
//   consume quien primero lo use de las 3 rutas de entrega.
//
// La moneda NO es parte de este gate -- es un switch que se resuelve en el
// momento de imprimir/emitir (ver proposal-shell.tsx: si no esta elegida,
// se pregunta ahi mismo antes de continuar la accion), no una condicion
// que bloquee la propuesta completa.
export function resolveProposalIssuanceGate(input: {
  status: ProposalStatus;
  issuanceStatus: ProposalIssuanceStatus;
  marginCanAuthorizeFinal?: boolean;
}): ProposalIssuanceDecision {
  if (input.status === "draft") {
    return { kind: "allowed", watermark: true, forced: false };
  }

  if (input.status === "approved") {
    return { kind: "allowed", watermark: false, forced: false };
  }

  if (input.status === "sent" && input.marginCanAuthorizeFinal) {
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

// Gate del CORREO (liberar la propuesta), distinto del gate de PDF/Excel de
// arriba -- esos son vista previa interna (un borrador sin aprobar se puede
// seguir descargando en PDF con marca de agua, para revision). El correo en
// cambio libera la propuesta de verdad, asi que exige que ya este aprobada:
// - approved: permitido.
// - margen ya calificaba (marginCanAuthorizeFinal): permitido -- se
//   autoaprueba justo antes de enviar (ver autoApproveProposalByMarginPolicy
//   en lib/db/proposals.ts), asi que para cuando el correo sale, ya quedo
//   aprobada formalmente, no solo "de facto".
// - forzamiento activo (issuance_status === "force_pending") por Owner/
//   Superadmin: permitido, es una autorizacion explicita equivalente.
// - rechazada o vencida: bloqueado siempre, sin excepcion -- no tiene
//   sentido liberar por correo algo que ya se cerro en negativo, aunque el
//   margen calificara.
// - cualquier otro caso (borrador o en revision sin margen calificado, sin
//   forzamiento): bloqueado -- "no puedes enviar algo que no se aprobo"
//   (Salvador, 2026-10-01).
export function resolveProposalEmailReleaseGate(input: {
  status: ProposalStatus;
  issuanceStatus: ProposalIssuanceStatus;
  marginCanAuthorizeFinal: boolean;
}): ProposalIssuanceDecision {
  if (input.status === "rejected" || input.status === "expired") {
    return {
      kind: "blocked",
      reason: "No se puede enviar por correo una propuesta rechazada o vencida.",
    };
  }

  if (input.status === "approved" || input.marginCanAuthorizeFinal) {
    return { kind: "allowed", watermark: false, forced: false };
  }

  if (input.issuanceStatus === "force_pending") {
    return { kind: "allowed", watermark: false, forced: true };
  }

  return {
    kind: "blocked",
    reason:
      "La propuesta debe estar aprobada para enviarse por correo. Solicita la aprobación o pide a un Owner/Superadmin que fuerce la emisión.",
  };
}
