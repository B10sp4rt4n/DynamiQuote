import { describe, expect, it } from "vitest";

import {
  assertApprovalActorEligibility,
  assertProposalWorkflowGuard,
  canTransitionProposalStatus,
  resolveApprovalGateError,
  shouldClearProposalApprovals,
} from "@/lib/domain/proposal-workflow-guard";

describe("proposal-workflow-guard", () => {
  it("bloquea editar propuesta aprobada sin reabrir estado", () => {
    expect(() =>
      assertProposalWorkflowGuard({
        allowApprovedTermsUpdate: false,
        currentStatus: "approved",
        hasContentUpdate: true,
        marginCanAuthorizeFinal: true,
        nextStatus: "approved",
      }),
    ).toThrow("La propuesta ya esta autorizada");
  });

  it("bloquea transiciones invalidas", () => {
    // draft → rejected no es una transicion valida
    expect(canTransitionProposalStatus("draft", "rejected")).toBe(false);

    expect(() =>
      assertProposalWorkflowGuard({
        allowApprovedTermsUpdate: false,
        currentStatus: "draft",
        hasContentUpdate: false,
        marginCanAuthorizeFinal: true,
        nextStatus: "rejected",
      }),
    ).toThrow("Transicion invalida");
  });

  it("permite transicion draft a in_review (solicitud de revision interna)", () => {
    expect(canTransitionProposalStatus("draft", "in_review")).toBe(true);

    expect(() =>
      assertProposalWorkflowGuard({
        allowApprovedTermsUpdate: false,
        currentStatus: "draft",
        hasContentUpdate: false,
        marginCanAuthorizeFinal: false,
        nextStatus: "in_review",
      }),
    ).not.toThrow();
  });

  it("handleSendToApproval: draft a in_review no falla cuando margen no autoriza", () => {
    // Simula el targetStatus que elige handleSendToApproval cuando marginAllowsFinalAuthorization=false
    const targetStatus = false ? "approved" : "in_review";
    expect(canTransitionProposalStatus("draft", targetStatus)).toBe(true);
  });

  it("permite transicion draft a approved cuando margen pre-autoriza (auto-aprobacion)", () => {
    expect(canTransitionProposalStatus("draft", "approved")).toBe(true);

    // El guard de margen protege: si margen NO permite, sigue bloqueando
    expect(() =>
      assertProposalWorkflowGuard({
        allowApprovedTermsUpdate: false,
        currentStatus: "draft",
        hasContentUpdate: false,
        marginCanAuthorizeFinal: false,
        nextStatus: "approved",
      }),
    ).toThrow("La politica de margen bloquea la autorizacion final");

    // Si margen SI permite, la transicion es valida
    expect(() =>
      assertProposalWorkflowGuard({
        allowApprovedTermsUpdate: false,
        currentStatus: "draft",
        hasContentUpdate: false,
        marginCanAuthorizeFinal: true,
        nextStatus: "approved",
      }),
    ).not.toThrow();
  });

  it("bloquea autorizacion final cuando margen no autoriza", () => {
    expect(() =>
      assertProposalWorkflowGuard({
        allowApprovedTermsUpdate: false,
        currentStatus: "in_review",
        hasContentUpdate: false,
        marginCanAuthorizeFinal: false,
        nextStatus: "approved",
      }),
    ).toThrow("La politica de margen bloquea la autorizacion final");
  });

  it("define cuando limpiar aprobaciones por cambios materiales", () => {
    expect(shouldClearProposalApprovals(true, 2)).toBe(true);
    expect(shouldClearProposalApprovals(true, 0)).toBe(false);
    expect(shouldClearProposalApprovals(false, 3)).toBe(false);
  });

  it("permite editar terminos en propuesta aprobada sin reabrir estado", () => {
    expect(() =>
      assertProposalWorkflowGuard({
        allowApprovedTermsUpdate: true,
        currentStatus: "approved",
        hasContentUpdate: true,
        marginCanAuthorizeFinal: true,
        nextStatus: "approved",
      }),
    ).not.toThrow();
  });

  it("valida elegibilidad del actor aprobador", () => {
    expect(() =>
      assertApprovalActorEligibility({
        approverRole: "owner",
        userId: null,
      }),
    ).toThrow("No se pudo identificar al aprobador");

    expect(() =>
      assertApprovalActorEligibility({
        approverRole: "user",
        userId: "u-1",
      }),
    ).toThrow("Solo Owner, Admin o Superadmin pueden participar");
  });

  it("resuelve mensajes de gate por rol faltante", () => {
    expect(resolveApprovalGateError(["owner"]))
      .toBe("Falta la aprobacion de Owner para autorizar la propuesta.");
    expect(resolveApprovalGateError(["superadmin"]))
      .toBe("Este tenant requiere observador Superadmin para autorizacion final.");
    expect(resolveApprovalGateError([])).toBeNull();
  });
});