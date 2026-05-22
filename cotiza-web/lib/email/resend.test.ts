import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// resend.ts usa "server-only" — mock para tests sin runtime de Next.js.
vi.mock("server-only", () => ({}));

// Resend constructor mock — hoisted para que funcione como new Resend().
const { ResendMock } = vi.hoisted(() => {
  const ResendMock = vi.fn(function (this: Record<string, unknown>) {
    this["emails"] = { send: vi.fn() };
  });
  return { ResendMock };
});

// Mock de Clerk — resolveClerkEmailSettings depende de auth() y clerkClient().
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ orgId: null, userId: null }),
  clerkClient: vi.fn().mockResolvedValue({
    organizations: { getOrganization: vi.fn() },
    users: { getUser: vi.fn() },
  }),
}));

// Mock de Resend para no hacer llamadas reales.
vi.mock("resend", () => ({
  Resend: ResendMock,
}));

const getAppEnvMock = vi.fn<() => string>();

vi.mock("@/lib/utils/app-url", () => ({
  getAppEnv: getAppEnvMock,
}));

// ---------------------------------------------------------------------------
// Helpers para manipular process.env entre tests.
// ---------------------------------------------------------------------------

type EnvSnapshot = Record<string, string | undefined>;

function setEnv(vars: EnvSnapshot): void {
  const env = process.env as Record<string, string | undefined>;
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
}

async function getModule() {
  // Importación dinámica para que cada describe/it vea el mock actualizado de getAppEnv.
  return await import("@/lib/email/resend");
}

// ---------------------------------------------------------------------------
// validateResendFrom — función pura, no depende de env
// ---------------------------------------------------------------------------

describe("validateResendFrom", () => {
  it("acepta email simple", async () => {
    const { validateResendFrom } = await getModule();
    expect(validateResendFrom("noreply@send.synappssys.com", "production")).toEqual({ valid: true });
  });

  it("acepta formato 'Nombre <correo@dominio>'", async () => {
    const { validateResendFrom } = await getModule();
    expect(validateResendFrom("Cotiza <noreply@send.synappssys.com>", "demo")).toEqual({ valid: true });
  });

  it("rechaza string vacío en production", async () => {
    const { validateResendFrom } = await getModule();
    const result = validateResendFrom("", "production");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("onboarding@resend.dev");
  });

  it("rechaza string sin '@' en pilot", async () => {
    const { validateResendFrom } = await getModule();
    const result = validateResendFrom("correo-invalido", "pilot");
    expect(result.valid).toBe(false);
  });

  it("rechaza onboarding@resend.dev en pilot", async () => {
    const { validateResendFrom } = await getModule();
    const result = validateResendFrom("Cotiza <onboarding@resend.dev>", "pilot");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("onboarding@resend.dev");
  });

  it("rechaza onboarding@resend.dev en demo", async () => {
    const { validateResendFrom } = await getModule();
    const result = validateResendFrom("onboarding@resend.dev", "demo");
    expect(result.valid).toBe(false);
  });

  it("rechaza onboarding@resend.dev en production", async () => {
    const { validateResendFrom } = await getModule();
    const result = validateResendFrom("Cotiza <onboarding@resend.dev>", "production");
    expect(result.valid).toBe(false);
  });

  it("acepta onboarding@resend.dev en development", async () => {
    const { validateResendFrom } = await getModule();
    // En development el dominio resend.dev está permitido.
    expect(validateResendFrom("Cotiza Dev <onboarding@resend.dev>", "development")).toEqual({
      valid: true,
    });
  });

  it("devuelve valid=false con error de fallback en development con from vacío", async () => {
    const { validateResendFrom } = await getModule();
    const result = validateResendFrom("", "development");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("fallback de desarrollo");
  });
});

// ---------------------------------------------------------------------------
// extractFromDomain
// ---------------------------------------------------------------------------

describe("extractFromDomain", () => {
  it("extrae dominio de formato ángulo", async () => {
    const { extractFromDomain } = await getModule();
    expect(extractFromDomain("Cotiza <noreply@send.synappssys.com>")).toBe("send.synappssys.com");
  });

  it("extrae dominio de email plano", async () => {
    const { extractFromDomain } = await getModule();
    expect(extractFromDomain("noreply@send.synappssys.com")).toBe("send.synappssys.com");
  });

  it("devuelve (desconocido) si no hay dominio", async () => {
    const { extractFromDomain } = await getModule();
    expect(extractFromDomain("correo-invalido")).toBe("(desconocido)");
  });
});

// ---------------------------------------------------------------------------
// resolveResendConfig — pruebas de configuración con env vars
// ---------------------------------------------------------------------------

describe("resolveResendConfig", () => {
  let saved: EnvSnapshot;

  beforeEach(() => {
    saved = {
      RESEND_API_KEY: process.env["RESEND_API_KEY"],
      RESEND_FROM: process.env["RESEND_FROM"],
      NODE_ENV: process.env["NODE_ENV"],
      VERCEL_ENV: process.env["VERCEL_ENV"],
      APP_ENV: process.env["APP_ENV"],
    };
    delete process.env["RESEND_API_KEY"];
    delete process.env["RESEND_FROM"];
    delete process.env["VERCEL_ENV"];
    delete process.env["APP_ENV"];
    vi.resetModules();
  });

  afterEach(() => {
    setEnv(saved);
    vi.resetModules();
  });

  // Caso A: APP_ENV=development + from vacío → fallback dev permitido con warning
  it("A: development + from vacío → fallback dev, no error", async () => {
    getAppEnvMock.mockReturnValue("development");
    (process.env as Record<string, string>)["NODE_ENV"] = "development";
    process.env["RESEND_API_KEY"] = "re_test_123";
    // RESEND_FROM no configurado

    const { resolveResendConfig } = await getModule();
    const result = await resolveResendConfig();

    expect(result.error).toBeNull();
    expect(result.from).toContain("onboarding@resend.dev");
    expect(result.configSource).toBe("fallback_dev_only");
    expect(result.client).not.toBeNull();
  });

  // Caso B: APP_ENV=pilot + from vacío → error
  it("B: pilot + from vacío → error, no client", async () => {
    getAppEnvMock.mockReturnValue("pilot");
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    process.env["RESEND_API_KEY"] = "re_live_123";
    // RESEND_FROM no configurado

    const { resolveResendConfig } = await getModule();
    const result = await resolveResendConfig();

    expect(result.client).toBeNull();
    expect(result.error).toContain("onboarding@resend.dev");
  });

  // Caso C: APP_ENV=pilot + from onboarding@resend.dev → error
  it("C: pilot + from=onboarding@resend.dev → error, no client", async () => {
    getAppEnvMock.mockReturnValue("pilot");
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    process.env["RESEND_API_KEY"] = "re_live_123";
    process.env["RESEND_FROM"] = "Cotiza <onboarding@resend.dev>";

    const { resolveResendConfig } = await getModule();
    const result = await resolveResendConfig();

    expect(result.client).toBeNull();
    expect(result.error).toContain("onboarding@resend.dev");
  });

  // Caso D: APP_ENV=demo + from válido → permitido
  it("D: demo + from válido → cliente Resend activo", async () => {
    getAppEnvMock.mockReturnValue("demo");
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    process.env["RESEND_API_KEY"] = "re_test_abc";
    process.env["RESEND_FROM"] = "Cotiza <noreply@send.synappssys.com>";

    const { resolveResendConfig } = await getModule();
    const result = await resolveResendConfig();

    expect(result.error).toBeNull();
    expect(result.client).not.toBeNull();
    expect(result.from).toBe("Cotiza <noreply@send.synappssys.com>");
    expect(result.configSource).toBe("env");
  });

  // Caso E: APP_ENV=production + from válido → permitido
  it("E: production + from válido → cliente Resend activo", async () => {
    getAppEnvMock.mockReturnValue("production");
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    process.env["RESEND_API_KEY"] = "re_live_abc";
    process.env["RESEND_FROM"] = "Cotiza <noreply@send.synappssys.com>";

    const { resolveResendConfig } = await getModule();
    const result = await resolveResendConfig();

    expect(result.error).toBeNull();
    expect(result.client).not.toBeNull();
    expect(result.configSource).toBe("env");
  });

  // Caso F: APP_ENV=production + from sin "@" → error
  it("F: production + from sin '@' → error, no client", async () => {
    getAppEnvMock.mockReturnValue("production");
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    process.env["RESEND_API_KEY"] = "re_live_abc";
    process.env["RESEND_FROM"] = "dominio-invalido-sin-arroba";

    const { resolveResendConfig } = await getModule();
    const result = await resolveResendConfig();

    expect(result.client).toBeNull();
    expect(result.error).toBeTruthy();
  });

  // Caso G: Metadata Clerk trae onboarding@resend.dev, .env trae dominio válido → usar .env
  it("G: metadata Clerk con onboarding ignorada si .env trae from válido", async () => {
    getAppEnvMock.mockReturnValue("pilot");
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    process.env["RESEND_API_KEY"] = "re_live_abc";
    process.env["RESEND_FROM"] = "Cotiza <noreply@send.synappssys.com>";
    // Aunque Clerk devolviera onboarding@resend.dev, el env gana siempre.

    const { resolveResendConfig } = await getModule();
    const result = await resolveResendConfig();

    expect(result.error).toBeNull();
    expect(result.from).toBe("Cotiza <noreply@send.synappssys.com>");
    expect(result.configSource).toBe("env");
  });

  // Caso H: Metadata Clerk trae API key pero .env también la trae → .env gana
  it("H: API key de .env tiene prioridad sobre metadata de Clerk", async () => {
    getAppEnvMock.mockReturnValue("pilot");
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    process.env["RESEND_API_KEY"] = "re_env_key";
    process.env["RESEND_FROM"] = "Cotiza <noreply@send.synappssys.com>";
    // Clerk mock devuelve { apiKey: "", from: "" } porque no hay sesión activa.

    const { resolveResendConfig } = await getModule();
    const result = await resolveResendConfig();

    // Clerk no debería llegar a llamarse cuando ambas env vars están presentes.
    expect(result.error).toBeNull();
    expect(result.configSource).toBe("env");
  });

  // Caso extra: API key faltante retorna error claro
  it("sin API key → error aunque from sea válido", async () => {
    getAppEnvMock.mockReturnValue("demo");
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    // RESEND_API_KEY no configurado
    process.env["RESEND_FROM"] = "Cotiza <noreply@send.synappssys.com>";

    const { resolveResendConfig } = await getModule();
    const result = await resolveResendConfig();

    expect(result.client).toBeNull();
    expect(result.error).toContain("RESEND_API_KEY");
    // from y configSource sí deben resolverse
    expect(result.from).toBe("Cotiza <noreply@send.synappssys.com>");
  });
});
