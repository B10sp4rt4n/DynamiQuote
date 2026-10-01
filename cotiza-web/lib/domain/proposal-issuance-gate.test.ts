import { describe, expect, it } from "vitest";

import { resolveProposalEmailReleaseGate, resolveProposalIssuanceGate } from "@/lib/domain/proposal-issuance-gate";

describe("proposal-issuance-gate", () => {
  it("permite borrador con marca de agua", () => {
    const result = resolveProposalIssuanceGate({
      issuanceStatus: "normal",
      status: "draft",
    });

    expect(result).toEqual({ kind: "allowed", watermark: true, forced: false });
  });

  it("permite aprobada sin marca de agua", () => {
    const result = resolveProposalIssuanceGate({
      issuanceStatus: "normal",
      status: "approved",
    });

    expect(result).toEqual({ kind: "allowed", watermark: false, forced: false });
  });

  it("bloquea otros estados sin forzamiento", () => {
    const result = resolveProposalIssuanceGate({
      issuanceStatus: "normal",
      status: "sent",
    });

    expect(result.kind).toBe("blocked");
  });

  it("permite otros estados con forzamiento activo", () => {
    const result = resolveProposalIssuanceGate({
      issuanceStatus: "force_pending",
      status: "sent",
    });

    expect(result).toEqual({ kind: "allowed", watermark: false, forced: true });
  });

  it("permite enviada sin marca de agua cuando el margen ya calificaba", () => {
    const result = resolveProposalIssuanceGate({
      issuanceStatus: "normal",
      marginCanAuthorizeFinal: true,
      status: "sent",
    });

    expect(result).toEqual({ kind: "allowed", watermark: false, forced: false });
  });

  it("bloquea enviada si el margen no calificaba, aunque no haya forzamiento", () => {
    const result = resolveProposalIssuanceGate({
      issuanceStatus: "normal",
      marginCanAuthorizeFinal: false,
      status: "sent",
    });

    expect(result.kind).toBe("blocked");
  });
});

describe("resolveProposalEmailReleaseGate", () => {
  it("permite enviar por correo una propuesta ya aprobada", () => {
    const result = resolveProposalEmailReleaseGate({
      issuanceStatus: "normal",
      marginCanAuthorizeFinal: false,
      status: "approved",
    });

    expect(result).toEqual({ kind: "allowed", watermark: false, forced: false });
  });

  it("permite enviar por correo un borrador cuyo margen ya calificaba", () => {
    const result = resolveProposalEmailReleaseGate({
      issuanceStatus: "normal",
      marginCanAuthorizeFinal: true,
      status: "draft",
    });

    expect(result).toEqual({ kind: "allowed", watermark: false, forced: false });
  });

  it("bloquea enviar por correo un borrador fuera de politica de margen -- a diferencia de PDF/Excel, que si se puede descargar", () => {
    const result = resolveProposalEmailReleaseGate({
      issuanceStatus: "normal",
      marginCanAuthorizeFinal: false,
      status: "draft",
    });

    expect(result.kind).toBe("blocked");
  });

  it("bloquea enviar por correo una propuesta en revision sin margen calificado", () => {
    const result = resolveProposalEmailReleaseGate({
      issuanceStatus: "normal",
      marginCanAuthorizeFinal: false,
      status: "in_review",
    });

    expect(result.kind).toBe("blocked");
  });

  it("permite enviar por correo con un forzamiento activo del dueño", () => {
    const result = resolveProposalEmailReleaseGate({
      issuanceStatus: "force_pending",
      marginCanAuthorizeFinal: false,
      status: "draft",
    });

    expect(result).toEqual({ kind: "allowed", watermark: false, forced: true });
  });

  it("bloquea rechazada aunque el margen calificara", () => {
    const result = resolveProposalEmailReleaseGate({
      issuanceStatus: "normal",
      marginCanAuthorizeFinal: true,
      status: "rejected",
    });

    expect(result.kind).toBe("blocked");
  });

  it("bloquea vencida aunque haya un forzamiento activo", () => {
    const result = resolveProposalEmailReleaseGate({
      issuanceStatus: "force_pending",
      marginCanAuthorizeFinal: false,
      status: "expired",
    });

    expect(result.kind).toBe("blocked");
  });
});
