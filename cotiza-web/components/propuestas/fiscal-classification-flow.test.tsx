// @vitest-environment jsdom
// Real React panel -> real route handlers -> real confirmation/receipt logic.
// Auth, persistence and Digestor/PAC boundaries are isolated; no real fiscal calls.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  tenant: vi.fn(), visible: vi.fn(), proposal: vi.fn(), invoice: vi.fn(), fiscalData: vi.fn(),
  profile: vi.fn(), saveDraft: vi.fn(), updateClient: vi.fn(), enabled: vi.fn(), search: vi.fn(),
  validate: vi.fn(), createDraft: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(),
}));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/proposals", () => ({ getProposalWorkflowByTenant: m.proposal, isProposalVisibleToViewer: m.visible }));
vi.mock("@/lib/db/proposal-invoices", () => ({ getProposalInvoiceStatusByTenant: m.invoice,
  getClientFiscalDataForProposalByTenant: m.fiscalData, saveProposalInvoiceDraftByTenant: m.saveDraft }));
vi.mock("@/lib/db/tenants", () => ({ getTenantProfileByTenant: m.profile }));
vi.mock("@/lib/db/clients", () => ({ updateClientForTenant: m.updateClient }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { proposal_audit_events: { findMany: m.findMany, findFirst: m.findFirst, upsert: m.upsert } } }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({ isDigestorFiscalEnabledForTenant: m.enabled,
  searchSatCatalog: m.search, validateSatClassifications: m.validate, createBillingDraft: m.createDraft }));
vi.mock("@/lib/integrations/proposal-payments", () => ({ isPpdCaptureEnabled: () => false }));
import { GET as classificationsGet, POST as classificationsPost } from "@/app/api/proposals/[proposalId]/fiscal-classifications/route";
import { GET as invoiceGet, POST as invoicePost } from "@/app/api/proposals/[proposalId]/invoice/route";
import { ProposalInvoicePanel } from "./proposal-invoice-panel";

const catalog = { cfdiVersion: "4.0", source: "SAT", sourceUrl: "https://sat.gob.mx/catalogo.xls", sourceFile: "synthetic-test.xls",
  publishedAt: "2026-11-06", checkedAt: "2026-11-08", sourceSha256: "b".repeat(64), counts: { product: 52513, unit: 2418 } };
const product = { code: "43233205", description: "Software de seguridad de transacciones y de protección contra virus", valid: true };
const unit = { code: "E48", description: "Unidad de servicio", valid: true };
const proposal = { proposalId: "p1", outcome: "won", formal: { currency: "MXN" },
  items: [{ itemNumber: 1, sku: "SYNTHETIC-EDR", description: "ThreatDown EDR 12 meses", quantity: 2, priceUnit: 100 }] };
const context = { params: Promise.resolve({ proposalId: "p1" }) };
type StoredEvent = { event_id: string; tenant_id: string; payload: string; event_hash: string; created_at: Date };
let root: Root, host: HTMLDivElement, events: StoredEvent[], version: string;
let fetcher: ReturnType<typeof vi.fn>;
const buttons = () => [...host.querySelectorAll("button")];
function button(text: string) {
  const found = buttons().find(row => row.textContent === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
function setValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
async function click(text: string) { await act(async () => button(text).click()); }
async function mount() { await act(async () => root.render(<ProposalInvoicePanel proposalId="p1" recipientCompany="EMPRESA SINTÉTICA" />)); }
async function nature() {
  await act(async () => {
    const select = host.querySelector<HTMLSelectElement>('select[id]')!;
    select.value = "license"; select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function chooseKeys() {
  await nature();
  await act(async () => buttons().filter(row => row.textContent === "Buscar")[0].click());
  await act(async () => buttons().find(row => row.textContent?.includes(product.code))!.click());
  const inputs = [...host.querySelectorAll<HTMLInputElement>('input[id]')];
  await act(async () => setValue(inputs[1], "E48"));
  await act(async () => buttons().filter(row => row.textContent === "Buscar")[1].click());
  await act(async () => buttons().find(row => row.textContent?.includes("E48"))!.click());
}
async function review() {
  await act(async () => [...host.querySelectorAll("label")].find(row => row.textContent?.startsWith("Revisé la descripción"))!.querySelector("input")!.click());
}
function postCount(suffix: string) {
  return fetcher.mock.calls.filter(([url, init]) => String(url).endsWith(suffix) && init?.method === "POST").length;
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  events = []; version = catalog.sourceSha256;
  m.tenant.mockResolvedValue({ id: "tenant-a", name: "EMISOR SINTÉTICO", userId: "actor-a", userRole: "owner", authMode: "clerk" });
  m.visible.mockResolvedValue(true); m.enabled.mockReturnValue(true); m.proposal.mockResolvedValue(proposal);
  m.invoice.mockResolvedValue({ status: null, draftId: null, stampedAt: null, uuid: null });
  m.fiscalData.mockResolvedValue({ company: "EMPRESA SINTÉTICA", rfc: "AAA010101AAA", fiscalRegime: "601", zipCode: "01000", cfdiUse: "G03" });
  m.profile.mockResolvedValue({ rfc: "AAA010101AAA", fiscalRegime: "601", fiscalZipCode: "01000" });
  m.createDraft.mockResolvedValue({ id: "synthetic-draft", missingFields: [] }); m.saveDraft.mockResolvedValue(true);
  m.updateClient.mockResolvedValue(null);
  m.search.mockImplementation(async (kind: string) => ({ catalog: { ...catalog, sourceSha256: version }, results: [kind === "product" ? product : unit] }));
  m.validate.mockImplementation(async (_items, expected?: string) => expected && expected !== version
    ? { valid: false, error: "El catálogo cambió. Revisa y confirma otra vez la clasificación." }
    : { valid: true, catalog: { ...catalog, sourceSha256: version }, items: [{ itemNumber: 1, valid: true, product, unit }] });
  m.upsert.mockImplementation(async ({ create }) => { const found = events.find(row => row.event_id === create.event_id); if (found) return found; events.push(create); return create; });
  m.findFirst.mockImplementation(async ({ where }) => events.find(row => row.event_id === where.event_id && row.tenant_id === where.tenant_id) ?? null);
  m.findMany.mockImplementation(async ({ where }) => events.filter(row => row.tenant_id === where.tenant_id && row.payload.includes(where.payload.contains)).reverse());
  fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const request = new Request(new URL(url, "https://cotiza.test"), init);
    if (new URL(request.url).pathname.endsWith("/fiscal-classifications"))
      return init?.method === "POST" ? classificationsPost(request, context) : classificationsGet(request, context);
    if (new URL(request.url).pathname.endsWith("/invoice"))
      return init?.method === "POST" ? invoicePost(request, context) : invoiceGet(request, context);
    throw new Error(`Unexpected external call: ${request.url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("requires review, makes one confirmation/draft on double click, and blocks stamping after editing a key", async () => {
  await mount(); expect(button("Generar prefactura").disabled).toBe(true);
  await chooseKeys(); expect(events).toHaveLength(0); expect(m.createDraft).not.toHaveBeenCalled();
  expect(button("Confirmar clasificación").disabled).toBe(true); await review();
  await act(async () => { button("Confirmar clasificación").click(); button("Confirmar clasificación").click(); });
  expect(postCount("/fiscal-classifications")).toBe(1); expect(events).toHaveLength(1);
  expect(button("Generar prefactura").disabled).toBe(false);
  await act(async () => { button("Generar prefactura").click(); button("Generar prefactura").click(); });
  expect(postCount("/invoice")).toBe(1); expect(m.createDraft).toHaveBeenCalledTimes(1);
  expect(m.createDraft.mock.calls[0][0]).toMatchObject({ currency: "MXN", items: [{ quantity: 2, unitPrice: 100, satProductCode: product.code, unitCode: "E48" }] });
  expect(button("Timbrar (irreversible)").disabled).toBe(false);
  await act(async () => setValue(host.querySelector<HTMLInputElement>('input[id]')!, "Otra operación"));
  expect(button("Regenerar prefactura").disabled).toBe(true);
  expect(button("Timbrar (irreversible)").disabled).toBe(true);
});

it("retrieves tenant memory as a candidate and requires a new confirmation before draft generation", async () => {
  await mount(); await chooseKeys(); await review(); await click("Confirmar clasificación");
  await act(async () => root.unmount()); root = createRoot(host); await mount(); await nature();
  expect(host.textContent).toContain("Selección anterior de tu empresa");
  expect(button("Generar prefactura").disabled).toBe(true);
  await click("Revisar selección anterior");
  expect(button("Generar prefactura").disabled).toBe(true); expect(button("Confirmar clasificación").disabled).toBe(true);
  await review(); await click("Confirmar clasificación");
  expect(postCount("/fiscal-classifications")).toBe(2);
  expect(button("Generar prefactura").disabled).toBe(false);
  expect(m.createDraft).not.toHaveBeenCalled();
});

it("shows catalog drift and keeps draft generation blocked until both keys are searched and reviewed again", async () => {
  await mount(); await chooseKeys(); await review(); version = "d".repeat(64);
  await click("Confirmar clasificación");
  expect(host.textContent).toContain("El catálogo cambió"); expect(events).toHaveLength(0);
  expect(button("Generar prefactura").disabled).toBe(true);
  await chooseKeys(); await review(); await click("Confirmar clasificación");
  expect(events).toHaveLength(1); expect(JSON.parse(events[0].payload).catalogVersion).toBe(version);
  await click("Generar prefactura"); expect(m.createDraft).toHaveBeenCalledTimes(1);
});

it("allows a reviewed retry after confirmation or draft creation fails without unlocking stamping", async () => {
  await mount(); await chooseKeys(); await review();
  m.upsert.mockRejectedValueOnce(new Error("Isolated storage failure"));
  await click("Confirmar clasificación");
  expect(host.textContent).toContain("No se pudo confirmar la clasificación");
  expect(button("Generar prefactura").disabled).toBe(true); expect(events).toHaveLength(0);
  await review(); await click("Confirmar clasificación");
  expect(events).toHaveLength(1);
  m.createDraft.mockRejectedValueOnce(new Error("Servicio de prefactura no disponible"));
  await click("Generar prefactura");
  expect(host.textContent).toContain("Servicio de prefactura no disponible");
  expect(button("Generar prefactura").disabled).toBe(false);
  expect(buttons().some(row => row.textContent === "Timbrar (irreversible)")).toBe(false);
  await click("Generar prefactura");
  expect(m.createDraft).toHaveBeenCalledTimes(2);
  expect(m.saveDraft).toHaveBeenCalledTimes(1);
  expect(button("Timbrar (irreversible)").disabled).toBe(false);
});
