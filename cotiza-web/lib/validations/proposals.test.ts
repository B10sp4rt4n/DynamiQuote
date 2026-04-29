import { describe, expect, it } from "vitest";

import {
  proposalImportItemSchema,
  proposalImportPayloadSchema,
  proposalStatusSchema,
  updateProposalWorkflowSchema,
} from "@/lib/validations/proposals";

describe("proposalStatusSchema", () => {
  it("acepta todos los estados validos", () => {
    const validStatuses = ["draft", "sent", "in_review", "approved", "rejected", "expired"];
    for (const status of validStatuses) {
      expect(proposalStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rechaza estado no definido", () => {
    expect(proposalStatusSchema.safeParse("pendiente").success).toBe(false);
    expect(proposalStatusSchema.safeParse("").success).toBe(false);
  });
});

describe("updateProposalWorkflowSchema", () => {
  it("acepta solo status", () => {
    const result = updateProposalWorkflowSchema.safeParse({ status: "sent" });
    expect(result.success).toBe(true);
  });

  it("acepta solo termsAndConditions", () => {
    const result = updateProposalWorkflowSchema.safeParse({
      termsAndConditions: "Pago a 30 dias",
    });
    expect(result.success).toBe(true);
  });

  it("acepta ambos campos", () => {
    const result = updateProposalWorkflowSchema.safeParse({
      status: "approved",
      termsAndConditions: "Sin condiciones especiales",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza payload vacio (requiere al menos uno)", () => {
    const result = updateProposalWorkflowSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rechaza termsAndConditions mayor de 12000 chars", () => {
    const result = updateProposalWorkflowSchema.safeParse({
      termsAndConditions: "x".repeat(12001),
    });
    expect(result.success).toBe(false);
  });
});

describe("proposalImportItemSchema", () => {
  const base = {
    costUnit: 100,
    itemNumber: 1,
    priceUnit: 150,
    quantity: 2,
  };

  it("acepta fila minima valida", () => {
    expect(proposalImportItemSchema.safeParse(base).success).toBe(true);
  });

  it("aplica defaults correctamente", () => {
    const result = proposalImportItemSchema.safeParse(base);
    if (!result.success) throw new Error("Fallo parse");
    expect(result.data.status).toBe("active");
    expect(result.data.sku).toBe("");
    expect(result.data.description).toBe("");
  });

  it("rechaza costUnit negativo", () => {
    expect(proposalImportItemSchema.safeParse({ ...base, costUnit: -1 }).success).toBe(false);
  });

  it("rechaza quantity <= 0", () => {
    expect(proposalImportItemSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
  });

  it("rechaza itemNumber no entero", () => {
    expect(proposalImportItemSchema.safeParse({ ...base, itemNumber: 1.5 }).success).toBe(false);
  });
});

describe("proposalImportPayloadSchema", () => {
  const validItem = {
    costUnit: 100,
    itemNumber: 1,
    priceUnit: 150,
    quantity: 1,
  };

  it("acepta array de una fila", () => {
    expect(proposalImportPayloadSchema.safeParse({ items: [validItem] }).success).toBe(true);
  });

  it("rechaza array vacio", () => {
    expect(proposalImportPayloadSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it("rechaza fila invalida dentro del array", () => {
    const result = proposalImportPayloadSchema.safeParse({
      items: [{ ...validItem, costUnit: -5 }],
    });
    expect(result.success).toBe(false);
  });
});
