import { describe, expect, it } from "vitest";

import { evaluateProposalLiberation } from "./proposal-liberation";

describe("evaluateProposalLiberation", () => {
  const policy = {
    highPreapprovalMarginPct: 55,
    maxMarginPct: 35,
    minMarginPct: 10,
    ownerRequired: true as const,
    requireObserverApproval: false,
    tenantId: "tenant-1",
  };

  it("bloquea propuestas por debajo del margen minimo", () => {
    const evaluation = evaluateProposalLiberation(policy, [
      { costUnit: 100, priceUnit: 80, quantity: 1 },
    ]);

    expect(evaluation.releaseMode).toBe("blocked");
    expect(evaluation.canAuthorizeFinal).toBe(false);
    expect(evaluation.canShareInformative).toBe(false);
    expect(evaluation.marginBand).toBe("below_min");
  });

  it("marca preaprobacion informativa cuando supera el umbral alto", () => {
    const evaluation = evaluateProposalLiberation(policy, [
      { costUnit: 60, priceUnit: 150, quantity: 1 },
    ]);

    expect(evaluation.releaseMode).toBe("informative");
    expect(evaluation.canAuthorizeFinal).toBe(true);
    expect(evaluation.canShareInformative).toBe(true);
    expect(evaluation.marginBand).toBe("high_preapproval");
  });

  it("mantiene la propuesta dentro de politica cuando el margen es intermedio", () => {
    const evaluation = evaluateProposalLiberation(policy, [
      { costUnit: 60, priceUnit: 100, quantity: 1 },
    ]);

    expect(evaluation.releaseMode).toBe("standard");
    expect(evaluation.canAuthorizeFinal).toBe(true);
    expect(evaluation.canShareInformative).toBe(false);
    expect(evaluation.marginBand).toBe("elevated");
  });

  it("margen exactamente igual al minimo cuenta como dentro de politica (limite inclusivo)", () => {
    const evaluation = evaluateProposalLiberation(policy, [
      { costUnit: 90, priceUnit: 100, quantity: 1 },
    ]);

    expect(evaluation.averageMarginPct).toBe(10);
    expect(evaluation.releaseMode).toBe("standard");
    expect(evaluation.canAuthorizeFinal).toBe(true);
    expect(evaluation.marginBand).toBe("standard");
  });

  it("margen exactamente igual al maximo cae en banda elevated, no en high_preapproval", () => {
    const evaluation = evaluateProposalLiberation(policy, [
      { costUnit: 65, priceUnit: 100, quantity: 1 },
    ]);

    expect(evaluation.averageMarginPct).toBe(35);
    expect(evaluation.marginBand).toBe("elevated");
    expect(evaluation.releaseMode).toBe("standard");
    expect(evaluation.canAuthorizeFinal).toBe(true);
    expect(evaluation.canShareInformative).toBe(false);
  });

  it("margen exactamente igual al umbral alto ya activa preaprobacion informativa", () => {
    const evaluation = evaluateProposalLiberation(policy, [
      { costUnit: 45, priceUnit: 100, quantity: 1 },
    ]);

    expect(evaluation.averageMarginPct).toBe(55);
    expect(evaluation.marginBand).toBe("high_preapproval");
    expect(evaluation.releaseMode).toBe("informative");
    expect(evaluation.canShareInformative).toBe(true);
  });

  it("con min=10/max=35/umbral=55 la banda elevated SI es alcanzable con un margen intermedio (45%)", () => {
    const evaluation = evaluateProposalLiberation(policy, [
      { costUnit: 55, priceUnit: 100, quantity: 1 },
    ]);

    expect(evaluation.averageMarginPct).toBe(45);
    expect(evaluation.marginBand).toBe("elevated");
    expect(evaluation.releaseMode).toBe("standard");
    expect(evaluation.canAuthorizeFinal).toBe(true);
    expect(evaluation.canShareInformative).toBe(false);
  });
});