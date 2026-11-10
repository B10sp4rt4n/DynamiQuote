// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProposalWorkflowDetail } from "@/lib/db/proposals";

vi.mock("./proposal-outcome-actions", () => ({ ProposalOutcomeActions: () => null }));
vi.mock("./proposal-payment-panel", () => ({ ProposalPaymentPanel: () => <p>REP conservado · saldo $0</p> }));
vi.mock("./proposal-cancellation-panel", () => ({ ProposalCancellationPanel: () => <p>Cancelación confirmada</p> }));
vi.mock("./proposal-correction-panel", () => ({ ProposalCorrectionPanel: () => <p>Historial de sustituciones</p> }));
import { ProposalDetailView } from "./proposal-detail-view";

let root: Root, host: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn>;
const history = { status: "stamped", draftId: "draft-1", uuid: "synthetic-invoice", stampedAt: "2026-11-10T10:00:00Z" };
const basis = { currency: "MXN", fingerprint: "synthetic-basis", items: [] };
const proposal = (outcome: ProposalWorkflowDetail["outcome"]): ProposalWorkflowDetail => ({
  proposalId: "p1", status: "approved", createdAt: "2026-11-10T10:00:00Z", outcome,
  outcomeAt: null, items: [], formal: null, salesOwner: "Synthetic user",
  approvals: [], approvalGate: { canAuthorizeFinal: true, missingRoles: [], observerApproved: true, ownerApproved: true },
  hasOpenMarginOverrideWindow: false, isPendingOverrideTarget: false, issuanceStatus: "normal", origin: null,
  marginEvaluation: { averageMarginPct: 25, canAuthorizeFinal: true, canShareInformative: true, grossProfit: 25,
    highPreapprovalMarginPct: 75, marginBand: "standard", maxMarginPct: 60, minMarginPct: 19,
    ownerRequired: true, releaseMode: "standard", requireObserverApproval: false, summary: "Synthetic fixture",
    tenantId: "synthetic-tenant", totalCost: 75, totalRevenue: 100 },
});
async function show(outcome: ProposalWorkflowDetail["outcome"], enabled = true) {
  await act(async () => root.render(<ProposalDetailView proposal={proposal(outcome)}
    derivationInfo={{ basedOn: null, supersededBy: null }} digestorFiscalEnabled={enabled}
    tenantName="Synthetic tenant" tenantAddress={null} tenantRfc={null} tenantWebsite={null} />));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ invoice: history,
    ppdEnabled: true, cancellationEnabled: true, correctionsEnabled: true, fiscalBasis: basis }) });
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it.each([null, "lost", "discarded"] as const)("keeps XML, REP, cancellation and correction history when outcome is %s", async outcome => {
  await show("won"); await show(outcome);
  expect(host.querySelector('a[href="/api/proposals/p1/invoice/xml"]')).not.toBeNull();
  expect(host.textContent).toContain("REP conservado");
  expect(host.textContent).toContain("Cancelación confirmada");
  expect(host.textContent).toContain("Historial de sustituciones");
  expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
});

it("does not load fiscal data when the tenant capability is disabled", async () => {
  await show(null, false);
  expect(fetcher).not.toHaveBeenCalled();
  expect(host.querySelector("#facturacion")).toBeNull();
});

it("does not offer invoice preparation for an unwon proposal without fiscal history", async () => {
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ invoice: { status: null, draftId: null }, fiscalBasis: basis }) });
  await show(null);
  expect(host.querySelectorAll("#facturacion button")).toHaveLength(0);
  expect(host.textContent).not.toContain("Datos del receptor para timbrar");
});

it("preserves an old draft preview without allowing issuance after removing the win", async () => {
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ invoice: { status: "draft", draftId: "draft-1" }, fiscalBasis: basis }) });
  await show(null);
  expect(host.textContent).toContain("La prefactura se conserva para consulta");
  const buttons = [...host.querySelectorAll<HTMLButtonElement>("#facturacion button")];
  expect(buttons.map(button => button.textContent)).toEqual(["Ver vista previa"]);
  await act(async () => buttons[0].click());
  expect(host.querySelector('iframe[src="/api/proposals/p1/invoice/preview"]')).not.toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("keeps reconciliation accessible for an uncertain stamp without issuing again", async () => {
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ invoice: { status: "stamping", draftId: "draft-1" } }) });
  await show("lost");
  expect(host.textContent).toContain("Timbrado pendiente de confirmación");
  expect(host.textContent).toContain("Consultar estado (sin timbrar)");
  expect(host.textContent).not.toContain("Timbrar (irreversible)");
});
