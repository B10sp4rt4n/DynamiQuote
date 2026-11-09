import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ tenant: vi.fn(), visible: vi.fn(), proposal: vi.fn(), invoice: vi.fn(), memory: vi.fn(), saved: vi.fn(), record: vi.fn(), enabled: vi.fn(), search: vi.fn(), validate: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/proposals", () => ({ getProposalWorkflowByTenant: m.proposal, isProposalVisibleToViewer: m.visible }));
vi.mock("@/lib/db/proposal-invoices", () => ({ getProposalInvoiceStatusByTenant: m.invoice }));
vi.mock("@/lib/db/fiscal-classifications", () => ({ classificationMemory: m.memory, savedClassification: m.saved, recordClassification: m.record }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({ isDigestorFiscalEnabledForTenant: m.enabled, searchSatCatalog: m.search, validateSatClassifications: m.validate }));
import { GET, POST } from "./route";
import { invoiceBasisFingerprint } from "@/lib/domain/invoice-profile";
const proposal = { proposalId: "p1", formal: { currency: "MXN" }, items: [{ itemNumber: 1, sku: "SKU-1", description: "EDR", quantity: 1, priceUnit: 10 }] };
const ctx = { params: Promise.resolve({ proposalId: "p1" }) };
const body = { itemNumber: 1, expectedFingerprint: invoiceBasisFingerprint(proposal), nature: "license", satProductCode: "43233205", unitCode: "E48", catalogVersion: "b".repeat(64), confirm: true, remember: true };
const req = (value = body) => new Request("https://cotiza.test/api", { method: "POST", body: JSON.stringify(value) });
const query = () => new Request("https://cotiza.test/api?itemNumber=1&nature=license&kind=product&q=EDR");
beforeEach(() => {
  vi.resetAllMocks(); m.tenant.mockResolvedValue({ id: "t1", userId: "u1", userRole: "user" }); m.visible.mockResolvedValue(true);
  m.enabled.mockReturnValue(true); m.proposal.mockResolvedValue(proposal); m.invoice.mockResolvedValue({ status: "draft" });
  m.validate.mockResolvedValue({ valid: true }); m.record.mockResolvedValue({ id: "fcl_" + "c".repeat(64), confirmedAt: "2026-11-08" });
  m.search.mockResolvedValue({ results: [] });
});
it.each(["GET", "POST"])("enforces authentication, tenant capability and proposal visibility for %s", async method => {
  const run = () => method === "GET" ? GET(query(), ctx) : POST(req(), ctx);
  m.tenant.mockResolvedValue(null); expect((await run()).status).toBe(401);
  m.tenant.mockResolvedValue({ id: "t1", userId: "u1" }); m.enabled.mockReturnValue(false); expect((await run()).status).toBe(403);
  m.enabled.mockReturnValue(true); m.visible.mockResolvedValue(false); expect((await run()).status).toBe(404);
  expect(m.record).not.toHaveBeenCalled(); expect(m.search).not.toHaveBeenCalled();
});
it("uses the server's item and explicit operator identity for the decision", async () => {
  expect((await POST(req(), ctx)).status).toBe(200);
  expect(m.record.mock.calls[0][0]).toMatchObject({ tenantId: "t1", actorUserId: "u1", item: proposal.items[0], fingerprint: body.expectedFingerprint });
  expect(m.validate).toHaveBeenCalledWith([{ itemNumber: 1, satProductCode: "43233205", unitCode: "E48" }], body.catalogVersion);
});
it("rejects stale revisions, changed SKUs, stamped documents, bad keys and changed catalogs", async () => {
  expect((await POST(req({ ...body, expectedFingerprint: "0".repeat(64) }), ctx)).status).toBe(409);
  m.proposal.mockResolvedValue({ ...proposal, items: [{ ...proposal.items[0], sku: "OTHER" }] });
  expect((await POST(req(), ctx)).status).toBe(409); m.proposal.mockResolvedValue(proposal);
  m.invoice.mockResolvedValue({ status: "stamped" }); expect((await POST(req(), ctx)).status).toBe(409);
  m.invoice.mockResolvedValue({ status: "draft" }); m.validate.mockResolvedValue({ valid: false }); expect((await POST(req(), ctx)).status).toBe(422);
  m.validate.mockResolvedValue({ valid: false, error: "El catálogo cambió" }); expect((await POST(req(), ctx)).status).toBe(409);
  expect(m.record).not.toHaveBeenCalled();
});
it("fails confirmation when recording is unavailable", async () => {
  m.record.mockRejectedValue(new Error("DB down")); expect((await POST(req(), ctx)).status).toBe(503);
});
it("never records a decision on search or memory read", async () => {
  expect((await GET(query(), ctx)).status).toBe(200);
  expect(m.search).toHaveBeenCalledWith("product", "EDR", "license");
  m.memory.mockResolvedValue(null);
  await GET(new Request("https://cotiza.test/api?itemNumber=1&mode=memory&nature=license"), ctx);
  expect(m.memory).toHaveBeenCalledWith("t1", proposal.items[0], "license"); expect(m.record).not.toHaveBeenCalled();
});

it("recovers only the exact reviewed receipt and revalidates its catalog without caching", async () => {
  const classification = { itemNumber: 1, satProductCode: body.satProductCode, unitCode: body.unitCode,
    catalogVersion: body.catalogVersion, classificationEventId: "fcl_" + "c".repeat(64) };
  m.saved.mockResolvedValue({ classification, nature: "license", remember: false });
  m.validate.mockResolvedValue({ valid: true, catalog: { sourceSha256: body.catalogVersion },
    items: [{ itemNumber: 1, valid: true, product: { code: body.satProductCode, valid: true }, unit: { code: "E48", valid: true } }] });
  const url = `https://cotiza.test/api?itemNumber=1&mode=resume&expectedFingerprint=${body.expectedFingerprint}&eventId=${classification.classificationEventId}`;
  const result = await GET(new Request(url), ctx);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  expect((await result.json()).saved.classification).toEqual(classification);
  expect(m.saved).toHaveBeenCalledWith({ tenantId: "t1", actorUserId: "u1", proposalId: "p1", itemNumber: 1,
    fingerprint: body.expectedFingerprint, eventId: classification.classificationEventId });
  expect(m.record).not.toHaveBeenCalled();
  m.validate.mockResolvedValue({ valid: false, error: "Catalog changed" });
  expect(await (await GET(new Request(url), ctx)).json()).toMatchObject({ saved: null, reviewRequired: true });
  m.validate.mockRejectedValue(new Error("Unavailable"));
  expect((await GET(new Request(url), ctx)).status).toBe(503);
});

it("rejects a stale resume fingerprint or an invalid receipt before reading persisted decisions", async () => {
  const base = "https://cotiza.test/api?itemNumber=1&mode=resume&expectedFingerprint=";
  expect((await GET(new Request(base + "0".repeat(64)), ctx)).status).toBe(409);
  expect((await GET(new Request(base + body.expectedFingerprint + "&eventId=invalid"), ctx)).status).toBe(422);
  expect(m.saved).not.toHaveBeenCalled();
});
