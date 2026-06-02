import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentTenantContextMock,
  getProposalWorkflowByTenantMock,
  updateProposalWorkflowByTenantMock,
  enforceRateLimitMock,
  getRequestIdentityMock,
} = vi.hoisted(() => ({
  getCurrentTenantContextMock: vi.fn(),
  getProposalWorkflowByTenantMock: vi.fn(),
  updateProposalWorkflowByTenantMock: vi.fn(),
  enforceRateLimitMock: vi.fn(),
  getRequestIdentityMock: vi.fn(),
}));

vi.mock("@/lib/auth/tenant-context", () => ({
  getCurrentTenantContext: getCurrentTenantContextMock,
}));

vi.mock("@/lib/db/proposals", () => ({
  getProposalWorkflowByTenant: getProposalWorkflowByTenantMock,
  updateProposalWorkflowByTenant: updateProposalWorkflowByTenantMock,
}));

vi.mock("@/lib/utils/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
  getRequestIdentity: getRequestIdentityMock,
}));

import { PUT } from "@/app/api/proposals/[proposalId]/route";

const ctx = (proposalId: string) => ({ params: Promise.resolve({ proposalId }) });

describe("PUT /api/proposals/[proposalId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimitMock.mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() + 10_000 });
    getRequestIdentityMock.mockReturnValue("ip-1");
  });

  it("devuelve 401 sin tenant", async () => {
    getCurrentTenantContextMock.mockResolvedValue(null);

    const res = await PUT(
      new Request("http://localhost/api/proposals/p1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sent" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(401);
  });

  it("devuelve 429 cuando excede rate-limit", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });
    enforceRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 10_000 });

    const res = await PUT(
      new Request("http://localhost/api/proposals/p1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sent" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("devuelve 400 con payload inválido", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });

    const res = await PUT(
      new Request("http://localhost/api/proposals/p1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(400);
  });

  it("devuelve 404 cuando propuesta no existe", async () => {
    getCurrentTenantContextMock.mockResolvedValue({
      id: "t1",
      isSuperAdmin: false,
      userId: "u1",
      userRole: "owner",
    });
    updateProposalWorkflowByTenantMock.mockResolvedValue(null);

    const res = await PUT(
      new Request("http://localhost/api/proposals/p1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sent" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(404);
  });

  it("devuelve 400 cuando dominio rechaza la transición", async () => {
    getCurrentTenantContextMock.mockResolvedValue({
      id: "t1",
      isSuperAdmin: false,
      userId: "u1",
      userRole: "owner",
    });
    updateProposalWorkflowByTenantMock.mockRejectedValue(new Error("Transicion invalida"));

    const res = await PUT(
      new Request("http://localhost/api/proposals/p1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Transicion invalida");
  });

  it("devuelve 200 y pasa actor tenant-scoped", async () => {
    getCurrentTenantContextMock.mockResolvedValue({
      id: "t1",
      isSuperAdmin: true,
      userId: "u1",
      userRole: "superadmin",
    });
    updateProposalWorkflowByTenantMock.mockResolvedValue({ proposalId: "p1", status: "approved" });

    const res = await PUT(
      new Request("http://localhost/api/proposals/p1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(200);
    expect(updateProposalWorkflowByTenantMock).toHaveBeenCalledWith(
      "t1",
      "p1",
      expect.objectContaining({ status: "approved" }),
      {
        isSuperAdmin: true,
        userId: "u1",
        userRole: "superadmin",
      },
    );
  });
});
