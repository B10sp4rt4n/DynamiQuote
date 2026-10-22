import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tenant: vi.fn(), visible: vi.fn(), create: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: mocks.tenant }));
vi.mock("@/lib/db/quotes", () => ({ isQuoteVisibleToViewer: mocks.visible }));
vi.mock("@/lib/db/packages", () => ({ createPackageFromQuote: mocks.create }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: mocks.rate }));
import { POST } from "./route";
import { QuoteInputError } from "@/lib/domain/quote-input";
const body = { name: "Renovación", quoteId: "quote-v3-abcd", operationId: "8f71c0f5-5cc5-4de4-beb3-7da4c8f3e5ca" };
const request = (payload: unknown = body) => new Request("http://localhost/api/packages/from-quote", { method: "POST", body: JSON.stringify(payload) });
describe("save quotation as template", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.tenant.mockResolvedValue({ id: "tenant-1", userId: "seller-1", userRole: "user", isSuperAdmin: false }); mocks.rate.mockReturnValue({ allowed: true }); mocks.visible.mockResolvedValue(true); });
  it("uses server tenant/actor and accepts a versioned quotation ID", async () => {
    mocks.create.mockResolvedValue({ packageId: "pkg-1" });
    expect((await POST(request({ ...body, tenantId: "foreign", createdBy: "forged" }))).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith("tenant-1", "seller-1", body);
    expect(mocks.visible).toHaveBeenCalledWith("tenant-1", body.quoteId, "seller-1", false);
  });
  it("blocks a quotation owned by another seller before copying any lines", async () => {
    mocks.visible.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(404); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("requires authentication, a name, and a retry key", async () => {
    mocks.tenant.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    mocks.tenant.mockResolvedValue({ id: "tenant-1" });
    expect((await POST(request({ ...body, name: " " }))).status).toBe(422);
    expect((await POST(request({ ...body, operationId: undefined }))).status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("returns conflict for an operation reused with changed inputs", async () => {
    mocks.create.mockRejectedValue(new QuoteInputError("Datos distintos", 409));
    expect((await POST(request())).status).toBe(409);
  });
});
