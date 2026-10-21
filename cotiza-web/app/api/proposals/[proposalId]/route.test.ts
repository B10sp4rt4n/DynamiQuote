import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentTenantContextMock,
  getProposalWorkflowByTenantMock,
  isProposalVisibleToViewerMock,
  updateProposalWorkflowByTenantMock,
  setProposalOutcomeByTenantMock,
  enforceRateLimitMock,
  getRequestIdentityMock,
  getProposalStatusForAuditMock,
  recordProposalAuditEventMock,
} = vi.hoisted(() => ({
  getCurrentTenantContextMock: vi.fn(),
  getProposalWorkflowByTenantMock: vi.fn(),
  isProposalVisibleToViewerMock: vi.fn(),
  updateProposalWorkflowByTenantMock: vi.fn(),
  setProposalOutcomeByTenantMock: vi.fn(),
  enforceRateLimitMock: vi.fn(),
  getRequestIdentityMock: vi.fn(),
  getProposalStatusForAuditMock: vi.fn(),
  recordProposalAuditEventMock: vi.fn(),
}));

vi.mock("@/lib/auth/tenant-context", () => ({
  getCurrentTenantContext: getCurrentTenantContextMock,
}));

vi.mock("@/lib/db/proposals", () => ({
  getProposalWorkflowByTenant: getProposalWorkflowByTenantMock,
  isProposalVisibleToViewer: isProposalVisibleToViewerMock,
  updateProposalWorkflowByTenant: updateProposalWorkflowByTenantMock,
  setProposalOutcomeByTenant: setProposalOutcomeByTenantMock,
}));

vi.mock("@/lib/db/proposal-audit", () => ({
  getProposalStatusForAudit: getProposalStatusForAuditMock,
  recordProposalAuditEvent: recordProposalAuditEventMock,
}));

vi.mock("@/lib/utils/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
  getRequestIdentity: getRequestIdentityMock,
}));

import { PATCH, PUT } from "@/app/api/proposals/[proposalId]/route";

const ctx = (proposalId: string) => ({ params: Promise.resolve({ proposalId }) });

describe("PATCH commercial close date", () => {
  const request = (body: unknown) => new Request("http://localhost/api/proposals/p1", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "seller1", userRole: "user", isSuperAdmin: false });
    enforceRateLimitMock.mockReturnValue({ allowed: true });
    getRequestIdentityMock.mockReturnValue("seller1");
    setProposalOutcomeByTenantMock.mockResolvedValue("updated");
  });
  it("requires a calendar choice for won/lost and rejects dates on untagging", async () => {
    for (const body of [{ outcome: "won" }, { outcome: "lost" }, { outcome: null, closedOn: "2026-09-01" }]) {
      expect((await PATCH(request(body), ctx("p1"))).status).toBe(422);
    }
    expect(setProposalOutcomeByTenantMock).not.toHaveBeenCalled();
  });
  it("forwards the selected day and edit reference within the current tenant/seller scope", async () => {
    const result = await PATCH(request({ outcome: "won", closedOn: "2026-09-01", expectedOutcome: "won", expectedOutcomeAt: null }), ctx("p1"));
    expect(result.status).toBe(200);
    expect(setProposalOutcomeByTenantMock).toHaveBeenCalledWith("t1", "p1", "won",
      { isSuperAdmin: false, userId: "seller1", userRole: "user" }, false,
      { closedOn: "2026-09-01", expectedOutcome: "won", expectedOutcomeAt: null });
    expect(await result.json()).toMatchObject({ outcome: "won", outcomeAt: "2026-09-01T06:00:00.000Z" });
  });
  it.each([["invalid_date", 422], ["conflict", 409], ["forbidden", 403], ["not_found", 404], ["invalid_status", 409]])("maps %s without reporting success", async (result, status) => {
    setProposalOutcomeByTenantMock.mockResolvedValue(result);
    expect((await PATCH(request({ outcome: "won", closedOn: "2026-09-01" }), ctx("p1"))).status).toBe(status);
  });
  it("does not write without a signed-in tenant", async () => {
    getCurrentTenantContextMock.mockResolvedValue(null);
    expect((await PATCH(request({ outcome: "won", closedOn: "2026-09-01" }), ctx("p1"))).status).toBe(401);
    expect(setProposalOutcomeByTenantMock).not.toHaveBeenCalled();
  });
});

describe("PUT /api/proposals/[proposalId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimitMock.mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() + 10_000 });
    getRequestIdentityMock.mockReturnValue("ip-1");
    isProposalVisibleToViewerMock.mockResolvedValue(true);
    getProposalStatusForAuditMock.mockResolvedValue("draft");
    recordProposalAuditEventMock.mockResolvedValue(undefined);
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

  it("devuelve 404 cuando isProposalVisibleToViewer indica que no es del viewer (scoping por dueno)", async () => {
    getCurrentTenantContextMock.mockResolvedValue({
      id: "t1",
      isSuperAdmin: false,
      userId: "u2",
      userRole: "user",
    });
    isProposalVisibleToViewerMock.mockResolvedValue(false);

    const res = await PUT(
      new Request("http://localhost/api/proposals/p1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sent" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(404);
    expect(isProposalVisibleToViewerMock).toHaveBeenCalledWith("t1", "p1", "u2", false);
    expect(updateProposalWorkflowByTenantMock).not.toHaveBeenCalled();
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

  it("audita la solicitud de aprobacion (borrador -> aprobada) con actor, origen y resultado", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", isSuperAdmin: false, userId: "u1", userRole: "user" });
    updateProposalWorkflowByTenantMock.mockResolvedValue({
      marginEvaluation: { averageMarginPct: 30.86 },
      proposalId: "p1",
      status: "approved",
    });

    const res = await PUT(
      new Request("http://localhost/api/proposals/p1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(200);
    expect(recordProposalAuditEventMock).toHaveBeenCalledWith({
      actorUserId: "u1",
      eventType: "status_change_requested",
      payload: { fromStatus: "draft", marginPct: 30.86, ok: true, requestedStatus: "approved", resultStatus: "approved" },
      proposalId: "p1",
      tenantId: "t1",
    });
  });

  it("audita tambien el intento fallido con el motivo", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", isSuperAdmin: false, userId: "u1", userRole: "user" });
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
    expect(recordProposalAuditEventMock).toHaveBeenCalledWith({
      actorUserId: "u1",
      eventType: "status_change_requested",
      payload: { error: "Transicion invalida", fromStatus: "draft", ok: false, requestedStatus: "approved" },
      proposalId: "p1",
      tenantId: "t1",
    });
  });

  it("no audita ediciones de contenido que no piden cambio de estatus", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", isSuperAdmin: false, userId: "u1", userRole: "user" });
    updateProposalWorkflowByTenantMock.mockResolvedValue({ proposalId: "p1", status: "draft" });

    const res = await PUT(
      new Request("http://localhost/api/proposals/p1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: "Nuevo asunto" }),
      }),
      ctx("p1"),
    );

    expect(res.status).toBe(200);
    expect(recordProposalAuditEventMock).not.toHaveBeenCalled();
  });
});
