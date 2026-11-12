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
import { preparationEvent } from "@/lib/db/invoice-preparations";
import { ProposalInvoicePanel } from "./proposal-invoice-panel";

const catalog = { cfdiVersion: "4.0", source: "SAT", sourceUrl: "https://sat.gob.mx/catalogo.xls", sourceFile: "synthetic-test.xls",
  publishedAt: "2026-11-06", checkedAt: "2026-11-08", sourceSha256: "b".repeat(64), counts: { product: 52513, unit: 2418 } };
const product = { code: "43233205", description: "Software de seguridad de transacciones y de protección contra virus", valid: true };
const unit = { code: "E48", description: "Unidad de servicio", valid: true };
const proposal = { proposalId: "p1", outcome: "won", formal: { currency: "MXN" },
  items: [{ itemNumber: 1, sku: "SYNTHETIC-EDR", description: "ThreatDown EDR 12 meses", quantity: 2, priceUnit: 100 }] };
const context = { params: Promise.resolve({ proposalId: "p1" }) };
type StoredEvent = { event_id: string; tenant_id: string; proposal_id: string; event_type: string; payload: string; event_hash: string; created_at: Date };
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
async function mount() { await act(async () => root.render(<ProposalInvoicePanel canPrepareInvoice proposalId="p1" recipientCompany="EMPRESA SINTÉTICA" />)); }
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
  m.createDraft.mockResolvedValue({ id: "synthetic-draft", missingFields: [] });
  m.saveDraft.mockImplementation(async (tenantId, proposalId, draftId, _previous, preparation) => {
    events.push(preparationEvent(tenantId, proposalId, draftId, preparation));
    m.invoice.mockResolvedValue({ status: "draft", draftId, stampedAt: null, uuid: null }); return true;
  });
  m.updateClient.mockResolvedValue(null);
  m.search.mockImplementation(async (kind: string) => ({ catalog: { ...catalog, sourceSha256: version }, results: [kind === "product" ? product : unit] }));
  m.validate.mockImplementation(async (_items, expected?: string) => expected && expected !== version
    ? { valid: false, error: "El catálogo cambió. Revisa y confirma otra vez la clasificación." }
    : { valid: true, catalog: { ...catalog, sourceSha256: version }, items: [{ itemNumber: 1, valid: true, product, unit }] });
  m.upsert.mockImplementation(async ({ create }) => { const found = events.find(row => row.event_id === create.event_id); if (found) return found; events.push(create); return create; });
  m.findFirst.mockImplementation(async ({ where }) => events.find(row => row.event_id === where.event_id && row.tenant_id === where.tenant_id) ?? null);
  m.findMany.mockImplementation(async ({ where, take }) => events.filter(row => row.tenant_id === where.tenant_id
    && (!where.event_id || row.event_id === where.event_id)
    && row.event_type === where.event_type && (!where.proposal_id || row.proposal_id === where.proposal_id)
    && (!where.payload || row.payload.includes(where.payload.contains))
    && (!where.AND || where.AND.every((part: { payload: { contains: string } }) => row.payload.includes(part.payload.contains))))
    .reverse().slice(0, take));
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
  expect(m.createDraft.mock.calls[0][0]).toMatchObject({ currency: "MXN", customerName: "EMPRESA SINTÉTICA",
    customerRfc: "AAA010101AAA", customerRegimen: "601", customerZip: "01000", customerUseCfdi: "G03",
    paymentMethod: "PUE", paymentForm: "03", items: [{ description: proposal.items[0].description,
      quantity: 2, unitPrice: 100, taxRate: 0.16, satProductCode: product.code, unitCode: "E48" }] });
  expect(host.textContent).toContain("Prefactura preparada. Puedes revisar su vista previa.");
  expect(host.querySelector('a[href="/api/proposals/p1/invoice/pdf?download=1"]')?.textContent).toBe("Descargar PDF de prefactura");
  expect(button("Timbrar (irreversible)").disabled).toBe(false);
  await act(async () => setValue(host.querySelector<HTMLInputElement>('input[id]')!, "Otra operación"));
  expect(button("Regenerar prefactura").disabled).toBe(true);
  expect(button("Timbrar (irreversible)").disabled).toBe(true);
  expect(host.querySelector('a[href="/api/proposals/p1/invoice/pdf?download=1"]')).toBeNull();
});

it("uses commercial memory only as a candidate after the document revision changes", async () => {
  await mount(); await chooseKeys(); await review(); await click("Confirmar clasificación");
  await act(async () => root.unmount());
  m.proposal.mockResolvedValue({ ...proposal, items: [{ ...proposal.items[0], quantity: 3 }] });
  root = createRoot(host); await mount(); await nature();
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

it("links pending entries to the actual controls and explains recipient validation before any draft request", async () => {
  await mount();
  expect(host.textContent).toContain("0 de 1 partidas confirmadas");
  await act(async () => buttons().find(row => row.textContent?.startsWith("Revisar partida 1:"))!.click());
  expect(document.activeElement?.tagName).toBe("FIELDSET");
  await chooseKeys(); await review(); await click("Confirmar clasificación");
  expect(host.textContent).toContain("Todo listo para generar la prefactura.");
  await act(async () => setValue(host.querySelector<HTMLInputElement>('[data-invoice-field="customerZip"]')!, "01"));
  expect(button("Generar prefactura").disabled).toBe(true);
  await click("El código postal debe tener cinco dígitos");
  expect(document.activeElement).toBe(host.querySelector('[data-invoice-field="customerZip"]'));
  expect(postCount("/invoice")).toBe(0);
  await act(async () => setValue(document.activeElement as HTMLInputElement, "01000"));
  await click("Generar prefactura");
  expect(m.createDraft).toHaveBeenCalledTimes(1);
  await click("Ver vista previa");
  expect(host.querySelector('iframe')?.getAttribute("src")).toBe("/api/proposals/p1/invoice/preview");
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/stamp"))).toBe(false);
});

it("keeps unsupported currency blocked even when the classification is confirmed", async () => {
  m.proposal.mockResolvedValue({ ...proposal, formal: { currency: "USD" } });
  await mount(); await chooseKeys(); await review(); await click("Confirmar clasificación");
  expect(button("Generar prefactura").disabled).toBe(true);
  expect(host.textContent).toContain("La moneda de esta propuesta aún no está habilitada");
  expect(postCount("/invoice")).toBe(0);
});

it("recovers confirmed selections and the exact prepared form after a full unmount without another confirmation or draft", async () => {
  await mount(); await chooseKeys(); await review(); await click("Confirmar clasificación");
  await act(async () => {
    const select = host.querySelectorAll<HTMLSelectElement>("select")[1];
    select.value = "28"; select.dispatchEvent(new Event("change", { bubbles: true }));
    setValue(host.querySelector<HTMLInputElement>('[data-invoice-field="customerZip"]')!, "02000");
  });
  await click("Generar prefactura");
  expect(events).toHaveLength(2);
  await act(async () => root.unmount()); root = createRoot(host);
  m.fiscalData.mockResolvedValue({ company: "CATÁLOGO MODIFICADO", rfc: "BBB010101BBB", fiscalRegime: "601", zipCode: "03000", cfdiUse: "G01" });
  await mount();
  expect(host.querySelector<HTMLInputElement>('[data-invoice-field="customerName"]')!.value).toBe("EMPRESA SINTÉTICA");
  expect(host.querySelector<HTMLInputElement>('[data-invoice-field="customerZip"]')!.value).toBe("02000");
  expect(host.querySelectorAll<HTMLSelectElement>("select")[1].value).toBe("28");
  expect(host.textContent).toContain("Prefactura preparada. Puedes revisar su vista previa.");
  expect(host.textContent).toContain("Claves vigentes y confirmadas para esta revisión.");
  expect(button("Timbrar (irreversible)").disabled).toBe(false);
  await click("Ver vista previa");
  expect(host.querySelector("iframe")!.getAttribute("src")).toBe("/api/proposals/p1/invoice/preview");
  expect(postCount("/fiscal-classifications")).toBe(1); expect(postCount("/invoice")).toBe(1);
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/stamp"))).toBe(false);
});

it.each(["actor", "catalog", "proposal", "emitter", "receipt"])("keeps stamping blocked on reopen when %s changed", async changed => {
  await mount(); await chooseKeys(); await review(); await click("Confirmar clasificación"); await click("Generar prefactura");
  await act(async () => root.unmount()); root = createRoot(host);
  if (changed === "actor") m.tenant.mockResolvedValue({ id: "tenant-a", name: "EMISOR SINTÉTICO", userId: "actor-b", userRole: "owner", authMode: "clerk" });
  if (changed === "catalog") version = "d".repeat(64);
  if (changed === "proposal") m.proposal.mockResolvedValue({ ...proposal, items: [{ ...proposal.items[0], quantity: 3 }] });
  if (changed === "emitter") m.profile.mockResolvedValue({ rfc: "BBB010101BBB", fiscalRegime: "601", fiscalZipCode: "01000" });
  if (changed === "receipt") events[0].payload += " ";
  await mount();
  expect(button("Timbrar (irreversible)").disabled).toBe(true);
  expect(postCount("/invoice")).toBe(1);
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/stamp"))).toBe(false);
});

it("sends one confirmed stamp for the exact prepared draft on a double click", async () => {
  await mount(); await chooseKeys(); await review(); await click("Confirmar clasificación"); await click("Generar prefactura");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  let finish!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  const boundary = fetcher.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
  fetcher.mockImplementation((url: string, init?: RequestInit) => String(url).endsWith("/stamp") ? pending : boundary(url, init));
  await act(async () => { button("Timbrar (irreversible)").click(); button("Timbrar (irreversible)").click(); });
  expect(confirm).toHaveBeenCalledTimes(1); expect(postCount("/stamp")).toBe(1);
  const [, payload] = fetcher.mock.calls.find(([url]) => String(url).endsWith("/stamp"))!;
  expect(JSON.parse(payload!.body as string)).toEqual({ expectedDraftId: "synthetic-draft", confirm: true });
  await act(async () => finish(Response.json({ ok: true, uuid: "11111111-2222-4333-8444-555555555555" })));
  expect(host.textContent).toContain("Factura timbrada");
  expect(host.querySelector('a[href$="/xml"]')).not.toBeNull();
  expect(host.querySelector('a[href$="/pdf"]')).not.toBeNull();
  confirm.mockRestore();
});

it("keeps uncertainty blocked, confirms recovery, and sends one read-only UUID request", async () => {
  m.invoice.mockResolvedValue({ status: "stamping", draftId: "synthetic-draft", uuid: null, stampedAt: null });
  await mount(); expect(host.textContent).toContain("Timbrado pendiente de confirmación");
  expect(buttons().some(row => row.textContent === "Timbrar (irreversible)")).toBe(false);
  expect(button("Recuperar XML por UUID (sin timbrar)").disabled).toBe(true);
  const uuid = "11111111-2222-4333-8444-555555555555";
  await act(async () => setValue(host.querySelector<HTMLInputElement>('input[id$="recovery-uuid"]')!, uuid));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await click("Recuperar XML por UUID (sin timbrar)"); expect(postCount("/invoice/reconcile")).toBe(0);
  confirm.mockReturnValue(true);
  let finish!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  const boundary = fetcher.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
  fetcher.mockImplementation((url: string, init?: RequestInit) => String(url).endsWith("/reconcile") ? pending : boundary(url, init));
  await act(async () => { button("Recuperar XML por UUID (sin timbrar)").click(); button("Recuperar XML por UUID (sin timbrar)").click(); });
  expect(postCount("/invoice/reconcile")).toBe(1);
  const [, payload] = fetcher.mock.calls.find(([url]) => String(url).endsWith("/reconcile"))!;
  expect(JSON.parse(payload!.body as string)).toEqual({ expectedDraftId: "synthetic-draft", invoiceUuid: uuid, confirm: true });
  m.invoice.mockResolvedValue({ status: "stamped", draftId: "synthetic-draft", uuid, stampedAt: new Date().toISOString() });
  await act(async () => finish(Response.json({ status: "stamped", uuid })));
  expect(host.textContent).toContain("Factura timbrada"); expect(postCount("/stamp")).toBe(0);
  confirm.mockRestore();
});
