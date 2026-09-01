import { describe, expect, it } from "vitest";

import { resolveProposalIssuanceGate } from "@/lib/domain/proposal-issuance-gate";

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
});
