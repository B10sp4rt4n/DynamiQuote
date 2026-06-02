import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — todos hoisted antes de cualquier import del módulo bajo test.
// ---------------------------------------------------------------------------

const {
  getCurrentTenantContextMock,
  enforceRateLimitMock,
  getRequestIdentityMock,
  hasClerkCredentialsMock,
  validateClerkEnvironmentMock,
  getPublicAppUrlMock,
  resolveResendConfigMock,
  dbFindFirstMock,
  clerkGetUserMock,
  clerkGetInvitationListMock,
  clerkCreateSignInTokenMock,
  clerkRevokeInvitationMock,
  clerkCreateInvitationMock,
  authMock,
  buildClerkTicketUrlMock,
} = vi.hoisted(() => ({
  getCurrentTenantContextMock: vi.fn(),
  enforceRateLimitMock: vi.fn(),
  getRequestIdentityMock: vi.fn(),
  hasClerkCredentialsMock: vi.fn(),
  validateClerkEnvironmentMock: vi.fn(),
  getPublicAppUrlMock: vi.fn(),
  resolveResendConfigMock: vi.fn(),
  dbFindFirstMock: vi.fn(),
  clerkGetUserMock: vi.fn(),
  clerkGetInvitationListMock: vi.fn(),
  clerkCreateSignInTokenMock: vi.fn(),
  clerkRevokeInvitationMock: vi.fn(),
  clerkCreateInvitationMock: vi.fn(),
  authMock: vi.fn(),
  buildClerkTicketUrlMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/tenant-context", () => ({
  getCurrentTenantContext: getCurrentTenantContextMock,
}));

vi.mock("@/lib/auth/clerk", () => ({
  hasClerkCredentials: hasClerkCredentialsMock,
}));

vi.mock("@/lib/utils/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/lib/utils/app-url", () => ({
  validateClerkEnvironment: validateClerkEnvironmentMock,
  getPublicAppUrl: getPublicAppUrlMock,
  buildClerkTicketUrl: buildClerkTicketUrlMock,
}));

vi.mock("@/lib/email/resend", () => ({
  resolveResendConfig: resolveResendConfigMock,
  extractFromDomain: vi.fn().mockImplementation((from: string) => {
    const match = from.match(/<([^>]+)>/);
    const email = match?.[1] ?? from;
    return email.split("@")[1]?.toLowerCase() ?? "(desconocido)";
  }),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    app_users: {
      findFirst: dbFindFirstMock,
    },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: vi.fn().mockResolvedValue({
    users: {
      getUser: clerkGetUserMock,
    },
    invitations: {
      getInvitationList: clerkGetInvitationListMock,
      revokeInvitation: clerkRevokeInvitationMock,
      createInvitation: clerkCreateInvitationMock,
    },
    signInTokens: {
      createSignInToken: clerkCreateSignInTokenMock,
    },
  }),
}));

// ---------------------------------------------------------------------------
// Import del handler después de todos los mocks.
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/settings/users/[userId]/resend-access/route";

// ---------------------------------------------------------------------------
// Helpers de test.
// ---------------------------------------------------------------------------

function makeRequest(userId: string, query?: string): Request {
  const url = `http://localhost/api/settings/users/${userId}/resend-access${query ? `?${query}` : ""}`;
  return new Request(url, { method: "POST" });
}

const ctx = (userId: string) => ({ params: Promise.resolve({ userId }) });

// ---------------------------------------------------------------------------
// Setup por defecto — reutilizable en todos los tests.
// ---------------------------------------------------------------------------

const VALID_TENANT = {
  id: "tenant-1",
  isSuperAdmin: true,
  userId: "user_admin",
  name: "Empresa Test",
  userDisplayName: "Admin",
};

const VALID_DB_USER = {
  first_name: "Andrés",
  tenants: { name: "Empresa Test", tenant_id: "tenant-1" },
};

const VALID_RESEND_CONFIG = {
  client: { emails: { send: vi.fn() } },
  error: null,
  from: "Cotiza <noreply@send.synappssys.com>",
  configSource: "env" as const,
};

const VALID_CLERK_USER = {
  primaryEmailAddressId: "ea_1",
  emailAddresses: [{ id: "ea_1", emailAddress: "andres@cliente.com" }],
};

function setupValidDefaults() {
  getCurrentTenantContextMock.mockResolvedValue(VALID_TENANT);
  enforceRateLimitMock.mockReturnValue({ allowed: true, remaining: 5, resetAt: Date.now() + 60_000 });
  getRequestIdentityMock.mockReturnValue("ip-1");
  hasClerkCredentialsMock.mockReturnValue(true);
  validateClerkEnvironmentMock.mockReturnValue({ ok: true });
  getPublicAppUrlMock.mockReturnValue({ ok: true, url: "https://dynami-quote.vercel.app" });
  resolveResendConfigMock.mockResolvedValue(VALID_RESEND_CONFIG);
  dbFindFirstMock.mockResolvedValue(VALID_DB_USER);
  clerkGetUserMock.mockResolvedValue(VALID_CLERK_USER);
  authMock.mockResolvedValue({ sessionClaims: { email: "admin@empresa.com" } });
  buildClerkTicketUrlMock.mockReturnValue({ ok: true, url: "https://dynami-quote.vercel.app/sign-in?ticket=tok_abc" });
  clerkCreateSignInTokenMock.mockResolvedValue({ token: "tok_abc" });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/settings/users/[userId]/resend-access — dry run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupValidDefaults();
  });

  // Caso A: dry run con configuración válida → wouldSend=true, sent=false
  it("A: dryRun con config válida → wouldSend=true, sent=false", async () => {
    const res = await POST(makeRequest("user_abc", "dryRun=true"), ctx("user_abc"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body["dryRun"]).toBe(true);
    expect(body["wouldSend"]).toBe(true);
    expect(body["sent"]).toBe(false);
    expect(body["messageType"]).toBe("resend_access");
    expect((body["sender"] as Record<string, unknown>)["usesResendDevDomain"]).toBe(false);
    expect((body["checks"] as Record<string, unknown>)["hasValidFrom"]).toBe(true);
    expect((body["checks"] as Record<string, unknown>)["fromIsNotResendDev"]).toBe(true);
  });

  // Caso B: dry run con onboarding@resend.dev → wouldSend=false
  it("B: dryRun con from=onboarding@resend.dev → wouldSend=false, sent=false", async () => {
    resolveResendConfigMock.mockResolvedValue({
      client: null,
      error: "RESEND_FROM no está configurado con un dominio verificado.",
      from: "Cotiza <onboarding@resend.dev>",
      configSource: "fallback_dev_only",
    });

    const res = await POST(makeRequest("user_abc", "dryRun=true"), ctx("user_abc"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(body["dryRun"]).toBe(true);
    expect(body["wouldSend"]).toBe(false);
    expect(body["sent"]).toBe(false);
    expect((body["sender"] as Record<string, unknown>)["usesResendDevDomain"]).toBe(true);
    expect((body["checks"] as Record<string, unknown>)["resendConfigValid"]).toBe(false);
  });

  // Caso C: dry run sin RESEND_FROM (client=null, from="") → wouldSend=false
  it("C: dryRun sin RESEND_FROM → wouldSend=false, sent=false", async () => {
    resolveResendConfigMock.mockResolvedValue({
      client: null,
      error: "RESEND_FROM no está configurado con un dominio verificado.",
      from: "",
      configSource: "fallback_dev_only",
    });

    const res = await POST(makeRequest("user_abc", "dryRun=true"), ctx("user_abc"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(body["wouldSend"]).toBe(false);
    expect(body["sent"]).toBe(false);
    expect((body["checks"] as Record<string, unknown>)["hasValidFrom"]).toBe(false);
  });

  // Caso D: dry run con APP_URL apuntando a localhost → appUrlValid=false, wouldSend=false
  it("D: dryRun con APP_URL localhost → appUrlValid=false, wouldSend=false", async () => {
    getPublicAppUrlMock.mockReturnValue({ ok: true, url: "http://localhost:3000" });

    const res = await POST(makeRequest("user_abc", "dryRun=true"), ctx("user_abc"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(body["wouldSend"]).toBe(false);
    expect((body["access"] as Record<string, unknown>)["usesLocalhost"]).toBe(true);
    expect((body["checks"] as Record<string, unknown>)["appUrlValid"]).toBe(false);
  });

  // Caso E: dry run nunca llama a emails.send
  it("E: dryRun nunca llama a resendClient.client.emails.send", async () => {
    const sendMock = vi.fn();
    resolveResendConfigMock.mockResolvedValue({
      ...VALID_RESEND_CONFIG,
      client: { emails: { send: sendMock } },
    });

    await POST(makeRequest("user_abc", "dryRun=true"), ctx("user_abc"));

    expect(sendMock).not.toHaveBeenCalled();
  });

  // Dry run no crea tokens de sign-in en Clerk
  it("dryRun no llama a createSignInToken", async () => {
    await POST(makeRequest("user_abc", "dryRun=true"), ctx("user_abc"));
    expect(clerkCreateSignInTokenMock).not.toHaveBeenCalled();
  });

  // Dry run no revoca ni recrea invitaciones pendientes
  it("dryRun no revoca ni recrea invitaciones", async () => {
    const pendingUserId = "pending_abc";
    dbFindFirstMock.mockResolvedValue({ ...VALID_DB_USER });
    clerkGetInvitationListMock.mockResolvedValue({
      data: [
        {
          id: "inv_1",
          emailAddress: "pendiente@cliente.com",
          publicMetadata: { localUserId: pendingUserId },
        },
      ],
    });

    await POST(makeRequest(pendingUserId, "dryRun=true"), ctx(pendingUserId));

    expect(clerkRevokeInvitationMock).not.toHaveBeenCalled();
    expect(clerkCreateInvitationMock).not.toHaveBeenCalled();
  });

  // La respuesta dry run enmascara el token del access URL
  it("accessUrlPreview enmascara el token real", async () => {
    const res = await POST(makeRequest("user_abc", "dryRun=true"), ctx("user_abc"));
    const body = (await res.json()) as Record<string, unknown>;
    const access = body["access"] as Record<string, unknown>;

    const preview = access["accessUrlPreview"] as string | null;
    // El mock de buildClerkTicketUrl devuelve .../sign-in?ticket=tok_abc
    // El dry run debe reemplazar el token con la cadena de placeholder
    if (preview && preview.includes("ticket")) {
      expect(preview).not.toContain("tok_abc");
      expect(preview).toContain("***masked***");
    } else {
      // Para el caso dry-run, se usa placeholder directamente
      expect(preview).toContain("***dry-run***");
    }
  });

  // El envío real sigue funcionando cuando dryRun no está activo
  it("envío real sigue funcionando sin dryRun", async () => {
    const sendMock = vi.fn().mockResolvedValue({ data: { id: "email_1" }, error: null });
    resolveResendConfigMock.mockResolvedValue({
      ...VALID_RESEND_CONFIG,
      client: { emails: { send: sendMock } },
    });

    const res = await POST(makeRequest("user_abc"), ctx("user_abc"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body["ok"]).toBe(true);
    expect(sendMock).toHaveBeenCalledOnce();
  });

  // Clerk env inválido en dry run → wouldSend=false pero no 500
  it("Clerk env inválido en dryRun → wouldSend=false, no 500", async () => {
    validateClerkEnvironmentMock.mockReturnValue({ ok: false, error: "Test keys not allowed" });

    const res = await POST(makeRequest("user_abc", "dryRun=true"), ctx("user_abc"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body["dryRun"]).toBe(true);
    expect(body["wouldSend"]).toBe(false);
    expect((body["checks"] as Record<string, unknown>)["clerkEnvironmentValid"]).toBe(false);
  });

  // Solo superadmin puede ejecutar dry run
  it("devuelve 403 si no es superAdmin", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ ...VALID_TENANT, isSuperAdmin: false });

    const res = await POST(makeRequest("user_abc", "dryRun=true"), ctx("user_abc"));
    expect(res.status).toBe(403);
  });

  // 401 sin tenant
  it("devuelve 401 sin tenant", async () => {
    getCurrentTenantContextMock.mockResolvedValue(null);

    const res = await POST(makeRequest("user_abc", "dryRun=true"), ctx("user_abc"));
    expect(res.status).toBe(401);
  });
});
