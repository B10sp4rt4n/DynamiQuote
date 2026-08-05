import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyWebhookMock, syncManagedUserFromClerkUserCreatedMock, updateUserMetadataMock } = vi.hoisted(() => ({
  verifyWebhookMock: vi.fn(),
  syncManagedUserFromClerkUserCreatedMock: vi.fn(),
  updateUserMetadataMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: verifyWebhookMock,
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn().mockResolvedValue({
    users: { updateUserMetadata: updateUserMetadataMock },
  }),
}));

vi.mock("@/lib/db/settings", () => ({
  syncManagedUserFromClerkUserCreated: syncManagedUserFromClerkUserCreatedMock,
}));

import { POST } from "./route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/clerk", { method: "POST" });
}

function baseUserCreatedPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_test123",
    first_name: null,
    last_name: null,
    external_id: null,
    email_addresses: [
      { id: "email_1", email_address: "andres@ksalsa.com.mx" },
    ],
    primary_email_address_id: "email_1",
    public_metadata: {
      role: "user",
      tenantId: "tenant-salsa",
      ...overrides,
    },
  };
}

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncManagedUserFromClerkUserCreatedMock.mockResolvedValue({ userId: "local-1" });
    updateUserMetadataMock.mockResolvedValue({});
  });

  it("A: Clerk manda first_name/last_name reales -> se usan tal cual", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.created",
      data: { ...baseUserCreatedPayload(), first_name: "Andrea", last_name: "Gonzalez" },
    });

    await POST(makeRequest());

    expect(syncManagedUserFromClerkUserCreatedMock).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Andrea", lastName: "Gonzalez" }),
    );
  });

  it("B: Clerk sin nombre, pero publicMetadata trae el nombre capturado al invitar -> se usa ese", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.created",
      data: baseUserCreatedPayload({ firstName: "Andres", lastName: "Fernandez" }),
    });

    await POST(makeRequest());

    expect(syncManagedUserFromClerkUserCreatedMock).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Andres", lastName: "Fernandez" }),
    );
  });

  it("C: Clerk sin nombre y sin metadata de nombre -> cae al placeholder (comportamiento legado)", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.created",
      data: baseUserCreatedPayload(),
    });

    await POST(makeRequest());

    expect(syncManagedUserFromClerkUserCreatedMock).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Usuario", lastName: "Invitado" }),
    );
  });

  it("D: eventos que no son user.created se ignoran", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.updated",
      data: baseUserCreatedPayload(),
    });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(json.ignored).toBe(true);
    expect(syncManagedUserFromClerkUserCreatedMock).not.toHaveBeenCalled();
  });

  it("E: sincroniza publicMetadata hacia Clerk tras crear el usuario local", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.created",
      data: baseUserCreatedPayload({ tenantSlug: "salsa", localUserId: "pending_abc123" }),
    });

    await POST(makeRequest());

    expect(updateUserMetadataMock).toHaveBeenCalledWith(
      "user_test123",
      {
        publicMetadata: {
          localUserId: "pending_abc123",
          role: "user",
          tenantId: "tenant-salsa",
          tenantSlug: "salsa",
        },
      },
    );
  });

  it("F: si falla la sincronizacion hacia Clerk, no tumba el webhook y queda logueado (no silencioso)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    updateUserMetadataMock.mockRejectedValue(new Error("Clerk API caida"));

    verifyWebhookMock.mockResolvedValue({
      type: "user.created",
      data: baseUserCreatedPayload(),
    });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(syncManagedUserFromClerkUserCreatedMock).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("FALLO al sincronizar publicMetadata"),
      expect.objectContaining({ clerkUserId: "user_test123" }),
    );

    consoleErrorSpy.mockRestore();
  });
});
