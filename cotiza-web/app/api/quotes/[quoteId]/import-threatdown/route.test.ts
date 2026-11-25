import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), visible: vi.fn(), read: vi.fn(), write: vi.fn(), rate: vi.fn(), capability: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: m.capability, THREATDOWN_PDF_IMPORT: "threatdown_pdf_import" }));
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
const apply = { action: "apply", operationId, expectedHash: hash, confirmed: "yes" };
describe("ThreatDown PDF route", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "tenant-1", userId: "u1", userRole: "seller", isSuperAdmin: false });
    m.capability.mockResolvedValue(true); m.visible.mockResolvedValue(true); m.rate.mockReturnValue({ allowed: true }); m.read.mockResolvedValue(source);
    m.write.mockResolvedValue({ quote: { quoteId: "new-v3" }, replayed: false });
  });
  afterEach(() => vi.restoreAllMocks());
  it("requires a session", async () => {
    m.tenant.mockResolvedValue(null); expect((await POST(request(),ctx)).status).toBe(401); expect(m.read).not.toHaveBeenCalled();
  });
  it("checks tenant and seller ownership before parsing any file", async () => {
    m.visible.mockResolvedValue(false); expect((await POST(request(),ctx)).status).toBe(404);
    expect(m.visible).toHaveBeenCalledWith("tenant-1","quote-v2","u1",false); expect(m.read).not.toHaveBeenCalled();
  });
  it.each([false, true])("blocks preview and apply for disabled tenants even when superadmin=%s", async (isSuperAdmin) => {
    m.tenant.mockResolvedValue({ id: "disabled-tenant", userId: "u1", userRole: "owner", isSuperAdmin });
    m.capability.mockResolvedValue(false);
    for (const fields of [{}, apply]) expect((await POST(request(fields),ctx)).status).toBe(403);
    expect(m.capability).toHaveBeenCalledWith("disabled-tenant", "threatdown_pdf_import");
    expect(m.read).not.toHaveBeenCalled(); expect(m.write).not.toHaveBeenCalled();
    expect(m.visible).not.toHaveBeenCalled();
  });
  it("rate limits parsing", async () => {
    m.rate.mockReturnValue({ allowed:false, resetAt:Date.now()+5000 });
    expect((await POST(request(),ctx)).status).toBe(429); expect(m.read).not.toHaveBeenCalled();
  });
  it("previews source fields and the actual file hash without writing", async () => {
    const r = await POST(request(),ctx); expect(r.status).toBe(200); expect(await r.json()).toEqual({ source, fileHash: hash }); expect(m.write).not.toHaveBeenCalled();
  });
  it("imports trusted product fields without costs, prices, exchange rates or margins", async () => {
    const r = await POST(request({ ...apply, tenantId:"other", lines:'[{"costUnit":123}]', exchangeRate:"20", marginPct:"35" }),ctx);
    expect(r.status).toBe(200);
    const value = m.write.mock.calls[0][0];
    expect(value).toMatchObject({ tenantId:"tenant-1", quoteId:"quote-v2", operationId, mode:"replace",
      lines:[{ sku:"TDADV", description:"ThreatDown Advanced", quantity:2, costUnit:0, priceUnit:0, marginPct:0 }],
      source:{ kind:"threatdown-pdf",id:"Q-123",revision:hash,importMode:"items-only",reviewedBy:"u1" } });
    expect(value.source).not.toHaveProperty("commercial");
    expect(value).not.toHaveProperty("evidence");
  });
  it.each([["USD", "1", 10], ["MXN", "20", 200]])("imports reviewed net costs in %s, ignoring client prices and costs", async (currency, exchangeRate, costUnit) => {
    const r = await POST(request({ ...apply, includeCosts: "yes", costCurrency: String(currency), exchangeRate: String(exchangeRate),
      costUnit: "99999", priceUnit: "99999", marginPct: "35" }), ctx);
    expect(r.status).toBe(200);
    expect(m.write.mock.lastCall?.[0]).toMatchObject({
      lines: [{ sku: "TDADV", quantity: 2, costUnit, priceUnit: 0, marginPct: 0 }],
      source: { importMode: "items-with-costs", pricing: { sourceCurrency: "USD", currency, exchangeRate: Number(exchangeRate) } },
    });
    expect(m.write.mock.lastCall?.[0]).not.toHaveProperty("evidence");
  });
  it.each([
    { costCurrency: "EUR", exchangeRate: "1" }, { costCurrency: "USD", exchangeRate: "20" },
    { costCurrency: "MXN", exchangeRate: "0" }, { costCurrency: "MXN", exchangeRate: "" },
    { costCurrency: "MXN", exchangeRate: "NaN" },
  ])("rejects incomplete or inconsistent conversion %s before reading or writing", async options => {
    const r = await POST(request({ ...apply, includeCosts: "yes", ...options }), ctx);
    expect(r.status).toBe(422); expect(m.read).not.toHaveBeenCalled(); expect(m.write).not.toHaveBeenCalled();
  });
  it("accepts evidence only with a separate tenant entitlement and explicit consent", async () => {
    m.capability.mockImplementation(async (_tenant, capability) => capability === "threatdown_pdf_import");
    expect((await POST(request({ ...apply, saveCommercialEvidence: "yes" }), ctx)).status).toBe(403);
    expect(m.write).not.toHaveBeenCalled();
    expect((await POST(request(apply), ctx)).status).toBe(200);
    expect(m.write.mock.lastCall?.[0]).not.toHaveProperty("evidence");
    m.capability.mockResolvedValue(true);
    expect((await POST(request({ ...apply, saveCommercialEvidence: "yes" }), ctx)).status).toBe(200);
    expect(m.write.mock.lastCall?.[0].evidence).toEqual({ userId: "u1", filename: "quote.pdf",
      bytes: new TextEncoder().encode(pdf), supplier: "ThreatDown", reference: "Q-123", expiresOn: "2026-11-19" });
  });
  it.each([{confirmed:"no"},{confirmed:""},{operationId:"bad"}])("rejects unconfirmed or invalid operations %s", async (bad) => {
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
  it("reports an unconfirmed import without blaming a PDF that was read successfully", async () => {
    m.write.mockRejectedValue(new TypeError("private database arguments"));
    const r = await POST(request(apply), ctx);
    expect(r.status).toBe(500);
    const body = await r.json();
    expect(body.error).toContain("La lectura del PDF se completó");
    expect(body.error).toContain("misma operación");
    expect(body.error).not.toContain("contraseña");
    expect(body.error).not.toContain("private");
    expect(console.error).toHaveBeenCalledWith("[threatdown:import]", { stage: "import", action: "apply", name: "TypeError" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private");
  });
  it("reports unexpected reader errors as internal errors and never writes", async () => {
    m.read.mockRejectedValue(new TypeError("private PDF contents"));
    const r = await POST(request(), ctx);
    expect(r.status).toBe(500);
    expect((await r.json()).error).toContain("error interno al leer");
    expect(m.write).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[threatdown:import]", { stage: "read", action: "preview", name: "TypeError" });
  });
  it.each(["PasswordException", "InvalidPDFException"])("identifies a real %s as a document error", async name => {
    const error = new Error("private PDF contents"); error.name = name;
    m.read.mockRejectedValue(error);
    const r = await POST(request(), ctx);
    expect(r.status).toBe(422);
    expect((await r.json()).error).toContain(name === "PasswordException" ? "protegido con contraseña" : "PDF válido");
    expect(m.write).not.toHaveBeenCalled();
  });
});
