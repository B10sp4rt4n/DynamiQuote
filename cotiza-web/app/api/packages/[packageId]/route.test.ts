import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentTenantContextMock,
  getPackageDetailByTenantMock,
  togglePackageActiveForTenantMock,
  updatePackageMetaForTenantMock,
  insertPackageIntoQuoteMock,
  enforceRateLimitMock,
  getRequestIdentityMock,
} = vi.hoisted(() => ({
  getCurrentTenantContextMock: vi.fn(),
  getPackageDetailByTenantMock: vi.fn(),
  togglePackageActiveForTenantMock: vi.fn(),
  updatePackageMetaForTenantMock: vi.fn(),
  insertPackageIntoQuoteMock: vi.fn(),
  enforceRateLimitMock: vi.fn(),
  getRequestIdentityMock: vi.fn(),
}));

vi.mock("@/lib/auth/tenant-context", () => ({
  getCurrentTenantContext: getCurrentTenantContextMock,
}));

vi.mock("@/lib/db/packages", () => ({
  getPackageDetailByTenant: getPackageDetailByTenantMock,
  insertPackageIntoQuote: insertPackageIntoQuoteMock,
  togglePackageActiveForTenant: togglePackageActiveForTenantMock,
  updatePackageMetaForTenant: updatePackageMetaForTenantMock,
}));

vi.mock("@/lib/utils/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
  getRequestIdentity: getRequestIdentityMock,
}));

import { GET, PATCH } from "@/app/api/packages/[packageId]/route";

const ctx = (packageId: string) => ({ params: Promise.resolve({ packageId }) });

describe("/api/packages/[packageId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimitMock.mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() + 10_000 });
    getRequestIdentityMock.mockReturnValue("ip-1");
  });

  it("GET devuelve 401 sin tenant", async () => {
    getCurrentTenantContextMock.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/packages/p1"), ctx("p1"));

    expect(res.status).toBe(401);
  });

  it("GET devuelve 404 si paquete no existe", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1" });
    getPackageDetailByTenantMock.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/packages/p1"), ctx("p1"));

    expect(res.status).toBe(404);
  });

  it("GET devuelve 429 si excede rate-limit", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1" });
    enforceRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 10_000 });

    const res = await GET(new Request("http://localhost/api/packages/p1"), ctx("p1"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("GET devuelve 200 con detalle del paquete", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1" });
    getPackageDetailByTenantMock.mockResolvedValue({
      packageId: "p1",
      name: "Paquete Base",
      lineCount: 2,
    });

    const res = await GET(new Request("http://localhost/api/packages/p1"), ctx("p1"));
    const body = (await res.json()) as { package: { lineCount: number; name: string; packageId: string } };

    expect(res.status).toBe(200);
    expect(body.package).toEqual({
      packageId: "p1",
      name: "Paquete Base",
      lineCount: 2,
    });
    expect(getPackageDetailByTenantMock).toHaveBeenCalledWith("t1", "p1");
  });

  it("PATCH toggle devuelve 429 cuando excede rate-limit", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });
    enforceRateLimitMock.mockImplementation((key: string) => {
      if (key.startsWith("packages:toggle")) {
        return { allowed: false, remaining: 0, resetAt: Date.now() + 10_000 };
      }
      return { allowed: true, remaining: 10, resetAt: Date.now() + 10_000 };
    });

    const res = await PATCH(
      new Request("http://localhost/api/packages/p1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(429);
  });

  it("PATCH insert devuelve 422 con quoteId invalido", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });

    const res = await PATCH(
      new Request("http://localhost/api/packages/p1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "insert", quoteId: "COT-0001" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(422);
  });

  it("PATCH insert devuelve 404 cuando no inserta lineas", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });
    insertPackageIntoQuoteMock.mockResolvedValue(0);

    const res = await PATCH(
      new Request("http://localhost/api/packages/p1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "insert",
          quoteId: "8f71c0f5-5cc5-4de4-beb3-7da4c8f3e5ca",
        }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(404);
  });

  it("PATCH insert devuelve 200 con cantidad insertada", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });
    insertPackageIntoQuoteMock.mockResolvedValue(3);

    const res = await PATCH(
      new Request("http://localhost/api/packages/p1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "insert",
          quoteId: "8f71c0f5-5cc5-4de4-beb3-7da4c8f3e5ca",
        }),
      }),
      ctx("p1"),
    );

    const body = (await res.json()) as { inserted: number };

    expect(res.status).toBe(200);
    expect(body.inserted).toBe(3);
    expect(insertPackageIntoQuoteMock).toHaveBeenCalledWith(
      "t1",
      "p1",
      "8f71c0f5-5cc5-4de4-beb3-7da4c8f3e5ca",
    );
  });

  it("PATCH metadata devuelve 404 si paquete no existe", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });
    updatePackageMetaForTenantMock.mockResolvedValue(null);

    const res = await PATCH(
      new Request("http://localhost/api/packages/p1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nuevo nombre" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(404);
  });

  it("PATCH metadata devuelve 200 cuando actualiza correctamente", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });
    updatePackageMetaForTenantMock.mockResolvedValue({
      packageId: "p1",
      name: "Paquete Renombrado",
      description: "Nueva descripcion",
    });

    const res = await PATCH(
      new Request("http://localhost/api/packages/p1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Paquete Renombrado",
          description: "Nueva descripcion",
        }),
      }),
      ctx("p1"),
    );

    const body = (await res.json()) as { package: { description: string; name: string; packageId: string } };

    expect(res.status).toBe(200);
    expect(body.package).toEqual({
      packageId: "p1",
      name: "Paquete Renombrado",
      description: "Nueva descripcion",
    });
    expect(updatePackageMetaForTenantMock).toHaveBeenCalledWith(
      "t1",
      "p1",
      expect.objectContaining({
        name: "Paquete Renombrado",
        description: "Nueva descripcion",
      }),
    );
  });
});
