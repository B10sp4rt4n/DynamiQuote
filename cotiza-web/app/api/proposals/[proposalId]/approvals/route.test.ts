import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentTenantContextMock,
  registerProposalApprovalByTenantMock,
  enforceRateLimitMock,
  getRequestIdentityMock,
} = vi.hoisted(() => ({
  getCurrentTenantContextMock: vi.fn(),
  registerProposalApprovalByTenantMock: vi.fn(),
  enforceRateLimitMock: vi.fn(),
  getRequestIdentityMock: vi.fn(),
}));

vi.mock("@/lib/auth/tenant-context", () => ({
  getCurrentTenantContext: getCurrentTenantContextMock,
}));

vi.mock("@/lib/db/proposals", () => ({
  registerProposalApprovalByTenant: registerProposalApprovalByTenantMock,
}));

vi.mock("@/lib/utils/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
  getRequestIdentity: getRequestIdentityMock,
}));

import { POST } from "@/app/api/proposals/[proposalId]/approvals/route";

const ctx = (proposalId: string) => ({ params: Promise.resolve({ proposalId }) });

describe("POST /api/proposals/[proposalId]/approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimitMock.mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() + 10_000 });
    getRequestIdentityMock.mockReturnValue("ip-1");
  });

  it("devuelve 401 sin tenant", async () => {
    getCurrentTenantContextMock.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/proposals/p1/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(401);
  });

  it("devuelve 429 cuando excede rate-limit", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });
    enforceRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 10_000 });

    const res = await POST(
      new Request("http://localhost/api/proposals/p1/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(429);
  });

  it("devuelve 400 con payload invalido", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });

    const res = await POST(
      new Request("http://localhost/api/proposals/p1/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "rejected" }),
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
    registerProposalApprovalByTenantMock.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/proposals/p1/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(404);
  });

  it("devuelve 400 cuando dominio lanza error", async () => {
    getCurrentTenantContextMock.mockResolvedValue({
      id: "t1",
      isSuperAdmin: false,
      userId: "u1",
      userRole: "owner",
    });
    registerProposalApprovalByTenantMock.mockRejectedValue(new Error("No se pudo identificar al aprobador."));

    const res = await POST(
      new Request("http://localhost/api/proposals/p1/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(400);
  });

  it("devuelve 200 y pasa actor tenant-scoped", async () => {
    getCurrentTenantContextMock.mockResolvedValue({
      id: "t1",
      isSuperAdmin: true,
      userId: "u1",
      userRole: "superadmin",
    });
    registerProposalApprovalByTenantMock.mockResolvedValue({ proposalId: "p1", status: "in_review" });

    const res = await POST(
      new Request("http://localhost/api/proposals/p1/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(200);
    expect(registerProposalApprovalByTenantMock).toHaveBeenCalledWith(
      "t1",
      "p1",
      expect.objectContaining({ decision: "approved" }),
      {
        isSuperAdmin: true,
        userId: "u1",
        userRole: "superadmin",
      },
    );
  });
});
