import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), file: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/won-consolidation", () => ({ getCustomerEvidenceFile: m.file, WinError: class extends Error { status = 404; } }));
import { GET } from "./route";
const id = "00000000-0000-4000-8000-000000000001";
const ctx = { params: Promise.resolve({ proposalId: "p1", evidenceId: id }) };
const request = new Request("https://cotiza.test/api/proposals/p1/consolidation/evidence/" + id);
beforeEach(() => { vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "tenant-a", userId: "seller", authMode: "clerk" }); });
it("requires a real session and a valid file identifier", async () => {
  m.tenant.mockResolvedValueOnce(null); expect((await GET(request, ctx)).status).toBe(401);
  expect((await GET(request, { params: Promise.resolve({ proposalId: "p1", evidenceId: "../other" }) })).status).toBe(404);
  expect(m.file).not.toHaveBeenCalled();
});
it("uses tenant and exact proposal permissions and forces a non-cacheable download", async () => {
  m.file.mockResolvedValue({ filename: 'confirmación "cliente".eml', mimeType: "message/rfc822", bytes: new Uint8Array([65, 66, 67]) });
  const result = await GET(request, ctx);
  expect(m.file).toHaveBeenCalledWith("tenant-a", "p1", id, expect.objectContaining({ userId: "seller" }));
  expect(result.headers.get("content-disposition")).toMatch(/^attachment;/);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(result.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await result.text()).toBe("ABC");
});
it("returns no file when it belongs to another proposal", async () => {
  m.file.mockResolvedValue(null); expect((await GET(request, ctx)).status).toBe(404);
});
