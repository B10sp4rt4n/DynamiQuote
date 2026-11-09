import { describe, expect, it } from "vitest";
import { businessAmountCurrency, businessDocumentSummary, getBusinessFollowUp, isProposalAuthorized, proposalBillingLabel, type WorkspaceProposal } from "./business-follow-up";

const proposal = (changes: Partial<WorkspaceProposal> = {}): WorkspaceProposal => ({
  proposal_id: "proposal-a", status: "approved", outcome: "won", formal_proposals: [{ status: "approved", currency: "USD" }], ...changes,
});
const base = { opportunityId: "opp-a", clientId: "client-a", stage: "won" as const, quotes: [], proposals: [proposal()], billingEnabled: true };

describe("business follow-up from recorded evidence", () => {
  it("treats a won business without visible documents as a recorded close rather than a new sale", () => {
    const result = getBusinessFollowUp({ ...base, proposals: [] });
    expect(result).toMatchObject({ label: "Revisar documentos del cierre", href: "/oportunidades/opp-a#propuestas" });
    expect(result.message).toContain("en esta vista");
    expect(result.message).not.toMatch(/primera cotización|preparar la propuesta/);
  });
  it("counts quote groups separately from revisions and uses current document authorization", () => {
    expect(businessDocumentSummary([
      { quote_id: "q1", quote_group_id: "COT-1", status: "draft" },
      { quote_id: "q2", quote_group_id: "COT-1", status: "draft" },
    ], [proposal(), proposal({ status: "approved", formal_proposals: [{ status: "in_review" }] })]))
      .toEqual({ quotes: "1 cotización · 2 revisiones", proposals: "2 propuestas · 1 autorizada" });
  });
  it.each([
    [{}, "Preparar prefactura"],
    [{ invoice_draft_id: "draft-a", invoice_status: "draft" }, "Revisar prefactura"],
    [{ invoice_status: "rejected" }, "Revisar prefactura"],
    [{ invoice_status: "stamping" }, "Verificar resultado del timbrado"],
    [{ invoice_status: "stamped" }, "Verificar resultado del timbrado"],
    [{ invoice_stamped_at: "2026-11-01T12:00:00Z" }, "Verificar resultado del timbrado"],
    [{ invoice_uuid: "uuid-a", invoice_status: "stamped" }, "Revisar factura y pagos"],
  ] as [Partial<WorkspaceProposal>, string][])("selects the appropriate invoice follow-up for %j", (changes, label) => {
    const result = getBusinessFollowUp({ ...base, proposals: [proposal(changes)] });
    expect(result.label).toBe(label); expect(result.href).toBe("/propuestas/proposal-a#facturacion");
    expect(result.message).not.toMatch(/vigente|pagada|saldo cero/);
  });
  it("respects billing availability, current authorization and ambiguous alternative decisions", () => {
    expect(getBusinessFollowUp({ ...base, billingEnabled: false }).label).toBe("Consultar propuesta ganada");
    const reopened = proposal({ formal_proposals: [{ status: "draft" }] });
    expect(isProposalAuthorized(reopened)).toBe(false);
    expect(getBusinessFollowUp({ ...base, proposals: [reopened] }).label).toContain("autorización");
    expect(getBusinessFollowUp({ ...base, alternativesNeedReview: true }).label).toBe("Revisar alternativas ganadas");
    expect(getBusinessFollowUp({ ...base, proposals: [proposal(), proposal({ proposal_id: "proposal-b" })] }).href).toBe("/oportunidades/opp-a#propuestas");
  });
  it.each(["paused", "lost", "no_decision"] as const)("keeps %s businesses out of the create-quote path", (stage) => {
    expect(getBusinessFollowUp({ ...base, stage, proposals: [] }).href).toMatch(/^\/oportunidades\/opp-a#/);
  });
  it("guides open opportunities using existing documents and leaves imported proposals usable", () => {
    expect(getBusinessFollowUp({ ...base, stage: "open", proposals: [] }).label).toBe("Crear primera cotización");
    expect(getBusinessFollowUp({ ...base, stage: "open", proposals: [proposal({ outcome: null })] }).label).toBe("Revisar propuesta autorizada");
    expect(getBusinessFollowUp({ ...base, stage: "open", proposals: [], quotes: [{ quote_id: "q1", quote_group_id: "COT-1", status: "archived" }] }).label).toContain("archivadas");
  });
  it("uses the winning documents' currency and leaves missing or mixed currency explicit", () => {
    expect(businessAmountCurrency([proposal(), proposal({ outcome: "lost", formal_proposals: [{ currency: "MXN", status: "approved" }] })], "won").currency).toBe("USD");
    expect(businessAmountCurrency([proposal({ formal_proposals: [] })], "won").currency).toBeNull();
    expect(businessAmountCurrency([proposal(), proposal({ formal_proposals: [{ currency: "MXN", status: "approved" }] })], "won"))
      .toEqual({ currency: null, label: "Varias monedas; revisar importes", mixed: true });
  });
  it("describes a UUID as a recorded CFDI without claiming its current SAT or payment status", () => {
    expect(proposalBillingLabel(proposal({ invoice_uuid: "uuid-a" }))).toBe("CFDI registrado");
    expect(proposalBillingLabel(proposal({ invoice_status: "stamped" }))).toBe("Registro fiscal incompleto");
  });
});
