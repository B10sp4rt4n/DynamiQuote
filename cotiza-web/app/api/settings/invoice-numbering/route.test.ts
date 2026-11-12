import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ tenant: vi.fn(), enabled: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: mock.tenant }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({ isDigestorFiscalEnabledForTenant: mock.enabled,
  getInvoiceNumbering: mock.read, updateInvoiceNumbering: mock.save }));
import { GET, PUT } from "./route";
import { DigestorHttpError } from "@/lib/integrations/digestor-error";
const body = { prefix: "FAC", include_year: true, reset_annually: false, digits: 6, next_number: 125, expected_revision: 0 };
const request = (changes = {}, headers = {}) => new Request("https://cotiza.test/api/settings/invoice-numbering", {
  method: "PUT", headers: { origin: "https://cotiza.test", "X-Tenant-Context": "a", ...headers }, body: JSON.stringify({ ...body, ...changes }) });
beforeEach(() => {
  vi.resetAllMocks(); mock.tenant.mockResolvedValue({ id: "a", userId: "owner-a", authMode: "clerk", userRole: "owner", isSuperAdmin: false });
  mock.enabled.mockReturnValue(true); mock.save.mockResolvedValue({ available: true });
});
it("requires a real session, owner and enabled fiscal connection before remote writes", async () => {
  for (const tenant of [null, { id: "a", userId: "bootstrap:a", authMode: "bootstrap", userRole: "owner" },
    { id: "a", userId: "seller", authMode: "clerk", userRole: "user" },
    { id: "a", userId: "admin", authMode: "clerk", userRole: "admin" }]) {
    mock.tenant.mockResolvedValue(tenant); expect([401, 403]).toContain((await PUT(request())).status);
  }
  expect(mock.save).not.toHaveBeenCalled(); expect(mock.read).not.toHaveBeenCalled();
});
it("binds visible tenant and origin, forbids payload tenancy and forged actor", async () => {
  expect((await PUT(request({}, { "X-Tenant-Context": "b" }))).status).toBe(409);
  expect((await PUT(request({}, { origin: "https://other.test" }))).status).toBe(403);
  expect((await PUT(request({ company_id: "b" }))).status).toBe(422);
  expect((await PUT(request({ declared_actor: "other" }))).status).toBe(422);
  expect(mock.save).not.toHaveBeenCalled();
});
it("forwards only validated policy and the session actor", async () => {
  expect((await PUT(request())).status).toBe(200);
  expect(mock.save).toHaveBeenCalledWith(body, "owner-a");
});
it("retains remote conflicts and treats transport failure as uncertain", async () => {
  mock.save.mockRejectedValueOnce(new DigestorHttpError("Recarga", 409));
  expect((await PUT(request())).status).toBe(409);
  mock.save.mockRejectedValueOnce(new Error("timeout"));
  expect((await PUT(request())).status).toBe(502);
});
it("never reads another tenant and marks responses no-store", async () => {
  mock.read.mockResolvedValue({ available: true, year: 2026, policy: null });
  const response = await GET(request()); expect(response.headers.get("cache-control")).toBe("no-store");
  mock.enabled.mockReturnValue(false); expect((await GET(request())).status).toBe(403);
  expect(mock.read).toHaveBeenCalledOnce();
});
