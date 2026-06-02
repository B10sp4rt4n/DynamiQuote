import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted antes de cualquier import del módulo bajo test.
// ---------------------------------------------------------------------------

const {
  getCurrentTenantContextMock,
  hasClerkCredentialsMock,
  validateClerkEnvironmentMock,
  getPublicAppUrlMock,
  createManagedUserByTenantMock,
  relinkManagedUserIdByTenantMock,
  updateManagedUserByTenantMock,
  deleteManagedUserByTenantMock,
  getAppUsersByTenantMock,
  getAppUsersForSuperAdminMock,
  sendInvitationEmailMock,
  prismaFindFirstMock,
  clerkGetUserListMock,
  clerkGetUserMock,
  clerkUpdateUserMetadataMock,
  clerkCreateInvitationMock,
} = vi.hoisted(() => ({
  getCurrentTenantContextMock: vi.fn(),
  hasClerkCredentialsMock: vi.fn(),
  validateClerkEnvironmentMock: vi.fn(),
  getPublicAppUrlMock: vi.fn(),
  createManagedUserByTenantMock: vi.fn(),
  relinkManagedUserIdByTenantMock: vi.fn(),
  updateManagedUserByTenantMock: vi.fn(),
  deleteManagedUserByTenantMock: vi.fn(),
  getAppUsersByTenantMock: vi.fn(),
  getAppUsersForSuperAdminMock: vi.fn(),
  sendInvitationEmailMock: vi.fn(),
  prismaFindFirstMock: vi.fn(),
  clerkGetUserListMock: vi.fn(),
  clerkGetUserMock: vi.fn(),
  clerkUpdateUserMetadataMock: vi.fn(),
  clerkCreateInvitationMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/tenant-context", () => ({
  getCurrentTenantContext: getCurrentTenantContextMock,
}));

vi.mock("@/lib/auth/clerk", () => ({
  hasClerkCredentials: hasClerkCredentialsMock,
}));

vi.mock("@/lib/utils/app-url", () => ({
  validateClerkEnvironment: validateClerkEnvironmentMock,
  getPublicAppUrl: getPublicAppUrlMock,
}));

vi.mock("@/lib/db/settings", () => ({
  createManagedUserByTenant: createManagedUserByTenantMock,
  relinkManagedUserIdByTenant: relinkManagedUserIdByTenantMock,
  updateManagedUserByTenant: updateManagedUserByTenantMock,
  deleteManagedUserByTenant: deleteManagedUserByTenantMock,
  getAppUsersByTenant: getAppUsersByTenantMock,
  getAppUsersForSuperAdmin: getAppUsersForSuperAdminMock,
}));

vi.mock("@/lib/email/send-invitation", () => ({
  sendInvitationEmail: sendInvitationEmailMock,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    tenant: {
      findFirst: prismaFindFirstMock,
    },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn().mockResolvedValue({
    users: {
      getUserList: clerkGetUserListMock,
      getUser: clerkGetUserMock,
      updateUserMetadata: clerkUpdateUserMetadataMock,
    },
    invitations: {
      createInvitation: clerkCreateInvitationMock,
    },
  }),
}));

// ---------------------------------------------------------------------------
// Import del handler después de todos los mocks.
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/settings/users/route";

// ---------------------------------------------------------------------------
// Fixtures comunes.
// ---------------------------------------------------------------------------

const TENANT = {
  id: "tenant-abc",
  isSuperAdmin: false,
  userId: "user_admin123",
  userDisplayName: "Admin Test",
};

const TARGET_TENANT = {
  name: "SynAppsSys",
  slug: "synappssys",
  tenant_id: "tenant-abc",
};

const CREATED_USER = {
  userId: `pending_00000000-0000-0000-0000-000000000001`,
  alias: "s.ruiz",
  firstName: "Salvador",
  lastName: "Ruiz",
  email: "salvador@gmail.com",
  role: "user",
};

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/settings/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  firstName: "Salvador",
  lastName: "Ruiz",
  alias: "s.ruiz",
  email: "salvador@gmail.com",
  role: "user",
};

// ---------------------------------------------------------------------------
// Setup por defecto antes de cada test.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  getCurrentTenantContextMock.mockResolvedValue(TENANT);
  hasClerkCredentialsMock.mockReturnValue(true);
  validateClerkEnvironmentMock.mockReturnValue({ ok: true });
  getPublicAppUrlMock.mockReturnValue({ ok: true, url: "https://dynami-quote.vercel.app" });
  prismaFindFirstMock.mockResolvedValue(TARGET_TENANT);
  createManagedUserByTenantMock.mockResolvedValue(CREATED_USER);
  sendInvitationEmailMock.mockResolvedValue({ sent: true, warning: null });

  // Por defecto: ningún usuario Clerk existente con ese correo
  clerkGetUserListMock.mockResolvedValue({ data: [] });
  // Por defecto: createInvitation OK
  clerkCreateInvitationMock.mockResolvedValue({ id: "inv_123" });
  // Por defecto: getUser OK (para BCC del admin)
  clerkGetUserMock.mockResolvedValue({
    emailAddresses: [{ id: "ea_1", emailAddress: "admin@test.com" }],
    primaryEmailAddressId: "ea_1",
  });
  clerkUpdateUserMetadataMock.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Tests: flujo Clerk sin usuario existente → createInvitation directo.
// ---------------------------------------------------------------------------

describe("POST /api/settings/users — flujo Clerk sin usuario previo", () => {
  it("A: nuevo usuario → llama createInvitation, NO createUser, invitationSent=true, sin clerkWarning", async () => {
    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.invitationSent).toBe(true);
    expect(json.clerkSynced).toBe(false);
    expect(json.clerkWarning).toBeNull();
    expect(clerkCreateInvitationMock).toHaveBeenCalledOnce();
    expect(clerkCreateInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: "salvador@gmail.com",
        redirectUrl: expect.stringContaining("/sign-up"),
      }),
    );
  });

  it("B: la invitación incluye metadata de rol y tenant", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(clerkCreateInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        publicMetadata: expect.objectContaining({
          role: "user",
          tenantId: "tenant-abc",
          tenantSlug: "synappssys",
        }),
      }),
    );
  });

  it("C: invitación duplicada (duplicate_record) → invitationSent=true con warning informativo", async () => {
    clerkCreateInvitationMock.mockRejectedValue({
      errors: [{ code: "duplicate_record", message: "ya existe" }],
    });

    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.invitationSent).toBe(true);
    expect(json.clerkWarning).toMatch(/pendiente/i);
  });

  it("D: error genérico en createInvitation → invitationSent=false, clerkWarning con detalle", async () => {
    clerkCreateInvitationMock.mockRejectedValue(new Error("Clerk 500 Internal"));

    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.invitationSent).toBe(false);
    expect(json.clerkWarning).toContain("Clerk 500 Internal");
  });
});

// ---------------------------------------------------------------------------
// Tests: flujo Clerk con usuario existente → sync metadata, sin invitación.
// ---------------------------------------------------------------------------

describe("POST /api/settings/users — flujo Clerk usuario ya existente", () => {
  it("E: correo ya existe en Clerk → clerkSynced=true, NO createInvitation", async () => {
    clerkGetUserListMock.mockResolvedValue({
      data: [{ id: "user_existing123" }],
    });
    relinkManagedUserIdByTenantMock.mockResolvedValue({
      ...CREATED_USER,
      userId: "user_existing123",
    });

    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.clerkSynced).toBe(true);
    expect(json.invitationSent).toBe(false);
    expect(clerkCreateInvitationMock).not.toHaveBeenCalled();
    expect(clerkUpdateUserMetadataMock).toHaveBeenCalledOnce();
  });

  it("F: admin pasa userId user_xxx explícito → enlaza directamente sin buscar por email", async () => {
    relinkManagedUserIdByTenantMock.mockResolvedValue({
      ...CREATED_USER,
      userId: "user_explicit999",
    });

    const res = await POST(makeRequest({ ...VALID_BODY, userId: "user_explicit999" }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.clerkSynced).toBe(true);
    // No busca por email si ya tiene clerkUserId
    expect(clerkGetUserListMock).not.toHaveBeenCalled();
    expect(clerkCreateInvitationMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: sin credenciales Clerk → flujo degradado (solo Resend).
// ---------------------------------------------------------------------------

describe("POST /api/settings/users — sin credenciales Clerk", () => {
  it("G: hasClerkCredentials=false → no llama Clerk, envía solo correo Resend, status 201", async () => {
    hasClerkCredentialsMock.mockReturnValue(false);

    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.clerkSynced).toBe(false);
    expect(json.invitationSent).toBe(false);
    expect(json.emailSent).toBe(true);
    expect(clerkCreateInvitationMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: guards de autenticación y validación.
// ---------------------------------------------------------------------------

describe("POST /api/settings/users — guards", () => {
  it("H: sin contexto de tenant → 401", async () => {
    getCurrentTenantContextMock.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("I: payload inválido (falta email) → 422", async () => {
    const res = await POST(makeRequest({ firstName: "X", lastName: "Y", alias: "xy" }));
    expect(res.status).toBe(422);
  });

  it("J: tenant destino no encontrado → 422", async () => {
    prismaFindFirstMock.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(422);
  });

  it("K: createManagedUserByTenant devuelve null (conflicto) → 409", async () => {
    createManagedUserByTenantMock.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
  });
});
