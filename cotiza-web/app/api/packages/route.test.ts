import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentTenantContextMock,
  getPackagesSummaryByTenantMock,
  createPackageForTenantMock,
  enforceRateLimitMock,
  getRequestIdentityMock,
} = vi.hoisted(() => ({
  getCurrentTenantContextMock: vi.fn(),
  getPackagesSummaryByTenantMock: vi.fn(),
  createPackageForTenantMock: vi.fn(),
  enforceRateLimitMock: vi.fn(),
  getRequestIdentityMock: vi.fn(),
}));

vi.mock("@/lib/auth/tenant-context", () => ({
  getCurrentTenantContext: getCurrentTenantContextMock,
}));

vi.mock("@/lib/db/packages", () => ({
  createPackageForTenant: createPackageForTenantMock,
  getPackagesSummaryByTenant: getPackagesSummaryByTenantMock,
}));

vi.mock("@/lib/utils/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
  getRequestIdentity: getRequestIdentityMock,
}));

import { GET, POST } from "@/app/api/packages/route";

describe("/api/packages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimitMock.mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() + 10_000 });
    getRequestIdentityMock.mockReturnValue("ip-1");
  });

  it("GET devuelve 401 sin tenant", async () => {
    getCurrentTenantContextMock.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/packages"));
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(body.error).toBe("No autorizado");
  });

  it("GET devuelve 429 cuando excede rate-limit", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1" });
    enforceRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 10_000 });

    const res = await GET(new Request("http://localhost/api/packages"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("GET devuelve listado de paquetes", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1" });
    getPackagesSummaryByTenantMock.mockResolvedValue([{ packageId: "p1", name: "Base" }]);

    const res = await GET(new Request("http://localhost/api/packages"));
    const body = (await res.json()) as { packages: Array<{ packageId: string }> };

    expect(res.status).toBe(200);
    expect(body.packages).toHaveLength(1);
    expect(getPackagesSummaryByTenantMock).toHaveBeenCalledWith("t1");
  });

  it("POST devuelve 422 con payload invalido", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });

    const res = await POST(
      new Request("http://localhost/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "", lines: [] }),
      }),
    );

    expect(res.status).toBe(422);
  });

  it("POST devuelve 201 con payload valido", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });
    createPackageForTenantMock.mockResolvedValue({ packageId: "p1", name: "Paquete" });

    const res = await POST(
      new Request("http://localhost/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Paquete",
          lines: [{ description: "Linea", quantity: 1, costUnit: 10, priceUnit: 20 }],
        }),
      }),
    );

    const body = (await res.json()) as { package: { packageId: string } };

    expect(res.status).toBe(201);
    expect(body.package.packageId).toBe("p1");
    expect(createPackageForTenantMock).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ name: "Paquete" }),
    );
  });
});
