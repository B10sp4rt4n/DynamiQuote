import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const context = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: context }));
const primary = "https://digestor-primary.test", sandbox = "https://digestor-qa.test";
let provider: Record<string, unknown>, calls: Array<{ url: string; authorization?: string; body?: string }>;
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); calls = [];
  for (const [key, value] of Object.entries({ DIGESTOR_FISCAL_BASE_URL: primary, DIGESTOR_FISCAL_USERNAME: "live-user", DIGESTOR_FISCAL_PASSWORD: "live-password",
    DIGESTOR_FISCAL_TENANT_ID: "live", DIGESTOR_FISCAL_SANDBOX_ENABLED: "true", DIGESTOR_FISCAL_SANDBOX_TENANT_ID: "lab",
    DIGESTOR_FISCAL_SANDBOX_BASE_URL: sandbox, DIGESTOR_FISCAL_SANDBOX_USERNAME: "qa-user", DIGESTOR_FISCAL_SANDBOX_PASSWORD: "qa-password" })) vi.stubEnv(key, value);
  context.mockResolvedValue({ id: "lab", authMode: "clerk" });
  provider = { environment: "sandbox", configured: true, production_configured: false, base_url: "https://pruebas.timbracfdi33.mx:1444/api/v2" };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, authorization: (init?.headers as Record<string, string>)?.Authorization, body: typeof init?.body === "string" ? init.body : undefined });
    if (url.endsWith("/auth/login")) return response({ access_token: url.startsWith(sandbox) ? "qa-token" : "live-token", expires_in: 3600, tenant_id: url.startsWith(sandbox) ? "lab" : "live" });
    if (url.endsWith("/provider/status?probe=false")) return response(provider);
    if (url.endsWith("/preview")) return new Response("<h1>PRUEBA</h1>");
    if (url.endsWith("/pdf")) return new Response(new Uint8Array([37, 80, 68, 70]));
    return response({ stamp_status: "not_sent", uuid: null, xml_base64: null, fields: {}, job_id: "qa-job" });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("enables only the primary and explicitly configured laboratory tenants", async () => {
  const api = await import("./digestor-fiscal");
  expect(api.isDigestorFiscalEnabledForTenant("live")).toBe(true);
  expect(api.isDigestorFiscalEnabledForTenant("lab")).toBe(true);
  expect(api.isDigestorFiscalEnabledForTenant("other")).toBe(false);
});
it("separates backend credentials and cached tokens across tenant switches", async () => {
  const api = await import("./digestor-fiscal");
  await api.getBillingDraftStampResult("qa-draft");
  context.mockResolvedValue({ id: "live", authMode: "clerk" }); await api.getBillingDraftStampResult("live-draft");
  context.mockResolvedValue({ id: "lab", authMode: "clerk" }); await api.getBillingDraftStampResult("qa-draft");
  const logins = calls.filter(call => call.url.endsWith("/auth/login"));
  expect(logins.map(call => [call.url, JSON.parse(call.body!).username])).toEqual([[sandbox + "/auth/login", "qa-user"], [primary + "/auth/login", "live-user"]]);
  const documents = calls.filter(call => call.url.includes("/drafts/"));
  expect(documents.map(call => call.authorization)).toEqual(["Bearer qa-token", "Bearer live-token", "Bearer qa-token"]);
  expect(calls.filter(call => call.url.endsWith("?probe=false"))).toHaveLength(2);
});
it.each([
  { environment: "production" }, { production_configured: true }, { configured: false },
  { base_url: "https://timbracfdi33.mx:1444/api/v2" }, { base_url: "https://pruebas.timbracfdi33.mx.evil.test:1444/api/v2" },
  { base_url: "http://pruebas.timbracfdi33.mx:1444/api/v2" }, { base_url: "https://pruebas.timbracfdi33.mx:1444/api/v2?redirect=production" },
])("blocks a sandbox service with an unsafe provider configuration %j", async change => {
  Object.assign(provider, change); const api = await import("./digestor-fiscal");
  await expect(api.getBillingDraftStampResult("qa-draft")).rejects.toThrow(/pruebas/);
  expect(calls.some(call => call.url.includes("/drafts/"))).toBe(false);
});
it("rechecks provider state even when the login token is cached", async () => {
  const api = await import("./digestor-fiscal"); await api.getBillingDraftStampResult("qa-draft");
  provider.environment = "production";
  await expect(api.getBillingDraftStampResult("second-draft")).rejects.toThrow(/pruebas/);
  expect(calls.some(call => call.url.includes("second-draft"))).toBe(false);
});
it.each(["DIGESTOR_FISCAL_SANDBOX_PASSWORD", "DIGESTOR_FISCAL_SANDBOX_BASE_URL"])("never falls back to live credentials when %s is missing", async key => {
  vi.stubEnv(key, ""); const api = await import("./digestor-fiscal");
  expect(api.isDigestorFiscalEnabledForTenant("lab")).toBe(false);
  await expect(api.getBillingDraftStampResult("qa-draft")).rejects.toThrow(/pruebas/); expect(calls).toHaveLength(0);
});
it.each([primary, primary + "/", "http://digestor-qa.test", sandbox + "/unsafe"])("rejects a shared or invalid sandbox destination %s", async url => {
  vi.stubEnv("DIGESTOR_FISCAL_SANDBOX_BASE_URL", url); const api = await import("./digestor-fiscal");
  expect(api.isDigestorFiscalEnabledForTenant("lab")).toBe(false);
  await expect(api.getBillingDraftStampResult("qa-draft")).rejects.toThrow(); expect(calls).toHaveLength(0);
});
it("rejects a sandbox account whose token belongs to a different tenant", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response({ access_token: "wrong", expires_in: 3600, tenant_id: "foreign" })));
  const api = await import("./digestor-fiscal"); await expect(api.getBillingDraftStampResult("qa-draft")).rejects.toThrow(/no corresponde/);
});
it.each([null, { id: "lab", authMode: "bootstrap" }])("requires session context for the sandbox", async tenant => {
  context.mockResolvedValue(tenant); const api = await import("./digestor-fiscal");
  await expect(api.getBillingDraftStampResult("qa-draft")).rejects.toThrow(); expect(calls).toHaveLength(0);
});
it("routes preview, PDF and CSF uploads to the same guarded sandbox", async () => {
  const api = await import("./digestor-fiscal");
  expect(await api.fetchBillingDraftPreviewHtml("qa-draft")).toContain("PRUEBA");
  expect((await api.fetchBillingDraftPdf("qa-draft")).toString()).toBe("%PDF");
  await api.uploadCsfDocument(Buffer.from("synthetic PDF"), "qa.pdf");
  expect(calls.every(call => call.url.startsWith(sandbox))).toBe(true);
  expect(calls.filter(call => call.url.includes("?probe=false"))).toHaveLength(3);
});
