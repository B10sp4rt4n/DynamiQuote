import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), visible: vi.fn(), read: vi.fn(), write: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/quotes", () => ({ isQuoteVisibleToViewer: m.visible }));
vi.mock("@/lib/db/quote-input", () => ({ createDraftFromQuoteInput: m.write }));
vi.mock("@/lib/import/threatdown-pdf", () => ({ readThreatDownPdf: m.read }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: m.rate, getRequestIdentity: () => "u1" }));
import { POST } from "./route";

const pdf = "%PDF-fixture";
const hash = createHash("sha256").update(pdf).digest("hex");
const operationId = "48bc6a1e-c041-490b-92ae-aa0347c69a2e";
const ctx = { params: Promise.resolve({ quoteId: "quote-v2" }) };
const source = { quoteNumber: "Q-123", currency: "USD", licenseTo: "Cliente origen", expiresOn: "2026-11-19", startsOn: "2026-10-23", endsOn: "2027-10-22", termMonths: 12,
  preliminary: true, netTotal: 20, lines: [{ sku: "TDADV", description: "ThreatDown Advanced", quantity: 2, costUnit: 10, netTotal: 20 }] };
function request(fields: Record<string, string> = {}, filename = "quote.pdf") {
  const body = new FormData(); body.set("file", new File([pdf], filename)); body.set("action", "preview");
  Object.entries(fields).forEach(([k,v]) => body.set(k,v));
  return new Request("http://localhost/api/quotes/quote-v2/import-threatdown", { method: "POST", body });
}
const apply = { action: "apply", operationId, expectedHash: hash, exchangeRate: "20", marginPct: "20", confirmed: "yes" };
describe("ThreatDown PDF route", () => {
  beforeEach(() => {
    vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "tenant-1", userId: "u1", userRole: "seller", isSuperAdmin: false });
    m.visible.mockResolvedValue(true); m.rate.mockReturnValue({ allowed: true }); m.read.mockResolvedValue(source);
    m.write.mockResolvedValue({ quote: { quoteId: "new-v3" }, replayed: false });
  });
  it("requires a session", async () => {
    m.tenant.mockResolvedValue(null); expect((await POST(request(),ctx)).status).toBe(401); expect(m.read).not.toHaveBeenCalled();
  });
  it("checks tenant and seller ownership before parsing any file", async () => {
    m.visible.mockResolvedValue(false); expect((await POST(request(),ctx)).status).toBe(404);
    expect(m.visible).toHaveBeenCalledWith("tenant-1","quote-v2","u1",false); expect(m.read).not.toHaveBeenCalled();
  });
  it("rate limits parsing", async () => {
    m.rate.mockReturnValue({ allowed:false, resetAt:Date.now()+5000 });
    expect((await POST(request(),ctx)).status).toBe(429); expect(m.read).not.toHaveBeenCalled();
  });
  it("previews source fields and the actual file hash without writing", async () => {
    const r = await POST(request(),ctx); expect(r.status).toBe(200); expect(await r.json()).toEqual({ source, fileHash: hash }); expect(m.write).not.toHaveBeenCalled();
  });
  it("rereads PDF and prices from trusted extraction, with original USD provenance and server actor", async () => {
    const r = await POST(request({ ...apply, tenantId:"other", lines:'[{"costUnit":0}]' }),ctx); expect(r.status).toBe(200);
    const value = m.write.mock.calls[0][0];
    expect(value).toMatchObject({ tenantId:"tenant-1", quoteId:"quote-v2", operationId, mode:"replace", lines:[{ quantity:2,costUnit:200,priceUnit:250 }],
      source:{ kind:"threatdown-pdf",id:"Q-123",revision:hash,commercial:{ currency:"USD",targetCurrency:"MXN",exchangeRate:20,marginPct:20,reviewedBy:"u1",lines:[{ costUnit:10 }] } } });
    expect(value.source.commercial).not.toHaveProperty("licenseTo");
  });
  it.each([{confirmed:"no"},{confirmed:""},{exchangeRate:""},{exchangeRate:"0"},{marginPct:"100"},{marginPct:""},{operationId:"bad"}])("rejects unreviewed or invalid pricing %s", async (bad) => {
    expect((await POST(request({...apply,...bad}),ctx)).status).toBe(422); expect(m.write).not.toHaveBeenCalled();
  });
  it("rejects a changed file before extraction and write", async () => {
    expect((await POST(request({...apply, expectedHash:"a".repeat(64)}),ctx)).status).toBe(409); expect(m.read).not.toHaveBeenCalled(); expect(m.write).not.toHaveBeenCalled();
  });
  it("uses the same operation key and returns writer replay results", async () => {
    m.write.mockResolvedValue({ quote:{quoteId:"new-v3"},replayed:true });
    expect(await (await POST(request(apply),ctx)).json()).toMatchObject({ replayed:true,quote:{quoteId:"new-v3"} });
    expect(m.write.mock.calls[0][0].operationId).toBe(operationId);
  });
  it("rejects wrong extensions", async () => {
    expect((await POST(request({},"quote.xlsx"),ctx)).status).toBe(422); expect(m.read).not.toHaveBeenCalled();
  });
});
