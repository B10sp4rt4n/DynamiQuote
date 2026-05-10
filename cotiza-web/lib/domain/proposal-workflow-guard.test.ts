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
        currentStatus: "approved",
        hasContentUpdate: true,
        marginCanAuthorizeFinal: true,
        nextStatus: "approved",
      }),
    ).toThrow("La propuesta ya esta autorizada");
  });

  it("bloquea transiciones invalidas", () => {
    expect(canTransitionProposalStatus("draft", "approved")).toBe(false);

    expect(() =>
      assertProposalWorkflowGuard({
        currentStatus: "draft",
        hasContentUpdate: false,
        marginCanAuthorizeFinal: true,
        nextStatus: "approved",
      }),
    ).toThrow("Transicion invalida");
  });

  it("bloquea autorizacion final cuando margen no autoriza", () => {
    expect(() =>
      assertProposalWorkflowGuard({
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