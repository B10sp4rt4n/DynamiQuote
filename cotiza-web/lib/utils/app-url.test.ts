import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// app-url.ts usa "server-only" — mock para tests sin runtime de Next.js
vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Las funciones leen process.env directamente, así que manipulamos el entorno
// antes de cada test y restauramos después.
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

// Importación dinámica para que process.env sea leído al llamar la función,
// no en tiempo de import del módulo.
async function getModule() {
  return await import("@/lib/utils/app-url");
}

describe("getPublicAppUrl", () => {
  let saved: EnvSnapshot;

  beforeEach(() => {
    saved = {
      APP_URL: process.env["APP_URL"],
      NEXT_PUBLIC_APP_URL: process.env["NEXT_PUBLIC_APP_URL"],
      NEXT_PUBLIC_SITE_URL: process.env["NEXT_PUBLIC_SITE_URL"],
      VERCEL_ENV: process.env["VERCEL_ENV"],
      NODE_ENV: process.env["NODE_ENV"],
      APP_ENV: process.env["APP_ENV"],
      ALLOWED_APP_URL_HOSTS: process.env["ALLOWED_APP_URL_HOSTS"],
    };
    // Resetear todas las variables relevantes
    delete process.env["APP_URL"];
    delete process.env["NEXT_PUBLIC_APP_URL"];
    delete process.env["NEXT_PUBLIC_SITE_URL"];
    delete process.env["VERCEL_ENV"];
    delete process.env["APP_ENV"];
    delete process.env["ALLOWED_APP_URL_HOSTS"];
  });

  afterEach(() => {
    setEnv(saved);
  });

  it("usa NEXT_PUBLIC_APP_URL cuando está configurada", async () => {
    process.env["NEXT_PUBLIC_APP_URL"] = "https://dynami-quote.vercel.app";
    (process.env as Record<string, string>)["NODE_ENV"] = "development";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result).toEqual({ ok: true, url: "https://dynami-quote.vercel.app" });
  });

  it("prioriza APP_URL sobre NEXT_PUBLIC_APP_URL", async () => {
    process.env["APP_URL"] = "https://cotiza.example.com";
    process.env["NEXT_PUBLIC_APP_URL"] = "https://dynami-quote.vercel.app";
    (process.env as Record<string, string>)["NODE_ENV"] = "development";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result).toEqual({ ok: true, url: "https://cotiza.example.com" });
  });

  it("elimina slash final", async () => {
    process.env["NEXT_PUBLIC_APP_URL"] = "https://dynami-quote.vercel.app/";
    (process.env as Record<string, string>)["NODE_ENV"] = "development";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result).toEqual({ ok: true, url: "https://dynami-quote.vercel.app" });
  });

  it("devuelve localhost en desarrollo cuando no hay URL configurada", async () => {
    (process.env as Record<string, string>)["NODE_ENV"] = "development";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result).toEqual({ ok: true, url: "http://localhost:3000" });
  });

  it("falla si no hay URL configurada en VERCEL_ENV=production", async () => {
    process.env["VERCEL_ENV"] = "production";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/no está configurada/i);
  });

  it("bloquea localhost en VERCEL_ENV=production", async () => {
    process.env["VERCEL_ENV"] = "production";
    process.env["NEXT_PUBLIC_APP_URL"] = "http://localhost:3000";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/localhost/i);
  });

  it("bloquea URL de preview de Vercel en producción", async () => {
    process.env["VERCEL_ENV"] = "production";
    process.env["NEXT_PUBLIC_APP_URL"] = "https://dynami-quote-abc1234d.vercel.app";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/preview/i);
  });

  it("bloquea URL de preview con -git- en producción", async () => {
    process.env["VERCEL_ENV"] = "production";
    process.env["NEXT_PUBLIC_APP_URL"] = "https://dynami-quote-git-feat-branch.vercel.app";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/preview/i);
  });

  it("acepta el dominio canónico .vercel.app en producción", async () => {
    process.env["VERCEL_ENV"] = "production";
    process.env["NEXT_PUBLIC_APP_URL"] = "https://dynami-quote.vercel.app";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result).toEqual({ ok: true, url: "https://dynami-quote.vercel.app" });
  });

  it("acepta localhost en desarrollo aunque preview sería bloqueado en producción", async () => {
    process.env["VERCEL_ENV"] = "development";
    process.env["NEXT_PUBLIC_APP_URL"] = "http://localhost:3000";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result).toEqual({ ok: true, url: "http://localhost:3000" });
  });

  it("falla con una URL malformada", async () => {
    process.env["NEXT_PUBLIC_APP_URL"] = "not-a-url";
    (process.env as Record<string, string>)["NODE_ENV"] = "development";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/válida/i);
  });

  // ── Entorno PILOT: bloqueos de URL ────────────────────────────────────────

  it("bloquea localhost en APP_ENV=pilot", async () => {
    process.env["APP_ENV"] = "pilot";
    process.env["NEXT_PUBLIC_APP_URL"] = "http://localhost:3000";
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/localhost/i);
  });

  it("bloquea URL de preview de Vercel en APP_ENV=pilot", async () => {
    process.env["APP_ENV"] = "pilot";
    process.env["NEXT_PUBLIC_APP_URL"] = "https://cotiza-git-feat-branch.vercel.app";
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/preview/i);
  });

  it("falla si no hay URL configurada en APP_ENV=pilot", async () => {
    process.env["APP_ENV"] = "pilot";
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/no está configurada/i);
  });

  it("acepta URL válida en APP_ENV=pilot", async () => {
    process.env["APP_ENV"] = "pilot";
    process.env["NEXT_PUBLIC_APP_URL"] = "https://dynami-quote.vercel.app";
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    const { getPublicAppUrl } = await getModule();
    expect(getPublicAppUrl()).toEqual({ ok: true, url: "https://dynami-quote.vercel.app" });
  });

  it("bloquea URL cuyo host no está en ALLOWED_APP_URL_HOSTS en APP_ENV=pilot", async () => {
    process.env["APP_ENV"] = "pilot";
    process.env["NEXT_PUBLIC_APP_URL"] = "https://otro-dominio.com";
    process.env["ALLOWED_APP_URL_HOSTS"] = "dynami-quote.vercel.app";
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    const { getPublicAppUrl } = await getModule();
    const result = getPublicAppUrl();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/no autorizada/i);
  });

  it("acepta URL que está en ALLOWED_APP_URL_HOSTS en APP_ENV=pilot", async () => {
    process.env["APP_ENV"] = "pilot";
    process.env["NEXT_PUBLIC_APP_URL"] = "https://dynami-quote.vercel.app";
    process.env["ALLOWED_APP_URL_HOSTS"] = "dynami-quote.vercel.app,otra-empresa.com";
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    const { getPublicAppUrl } = await getModule();
    expect(getPublicAppUrl()).toEqual({ ok: true, url: "https://dynami-quote.vercel.app" });
  });
});

describe("buildClerkTicketUrl", () => {
  let saved: EnvSnapshot;

  beforeEach(() => {
    saved = {
      NEXT_PUBLIC_APP_URL: process.env["NEXT_PUBLIC_APP_URL"],
      VERCEL_ENV: process.env["VERCEL_ENV"],
      NODE_ENV: process.env["NODE_ENV"],
    };
    delete process.env["VERCEL_ENV"];
    (process.env as Record<string, string>)["NODE_ENV"] = "development";
    process.env["NEXT_PUBLIC_APP_URL"] = "https://dynami-quote.vercel.app";
  });

  afterEach(() => {
    setEnv(saved);
  });

  it("construye URL con hash fragment del token", async () => {
    const { buildClerkTicketUrl } = await getModule();
    const result = buildClerkTicketUrl("tok_abc123");
    expect(result.ok).toBe(true);
    expect((result as { ok: true; url: string }).url).toBe(
      "https://dynami-quote.vercel.app/sign-in#__clerk_ticket=tok_abc123",
    );
  });

  it("codifica caracteres especiales en el token", async () => {
    const { buildClerkTicketUrl } = await getModule();
    const result = buildClerkTicketUrl("tok/abc+xyz=");
    expect(result.ok).toBe(true);
    const url = (result as { ok: true; url: string }).url;
    expect(url).toContain("__clerk_ticket=");
    expect(url).not.toContain("/abc+xyz=");
  });

  it("falla si getPublicAppUrl falla", async () => {
    delete process.env["NEXT_PUBLIC_APP_URL"];
    process.env["VERCEL_ENV"] = "production";
    const { buildClerkTicketUrl } = await getModule();
    const result = buildClerkTicketUrl("tok_abc123");
    expect(result.ok).toBe(false);
  });
});

describe("validateClerkEnvironment", () => {
  let saved: EnvSnapshot;

  beforeEach(() => {
    saved = {
      CLERK_SECRET_KEY: process.env["CLERK_SECRET_KEY"],
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
      VERCEL_ENV: process.env["VERCEL_ENV"],
      NODE_ENV: process.env["NODE_ENV"],
      APP_ENV: process.env["APP_ENV"],
      NEXT_PUBLIC_APP_ENV: process.env["NEXT_PUBLIC_APP_ENV"],
      ALLOW_CLERK_TEST_KEYS: process.env["ALLOW_CLERK_TEST_KEYS"],
    };
    delete process.env["VERCEL_ENV"];
    delete process.env["APP_ENV"];
    delete process.env["NEXT_PUBLIC_APP_ENV"];
    delete process.env["ALLOW_CLERK_TEST_KEYS"];
    delete process.env["ALLOWED_APP_URL_HOSTS"];
    (process.env as Record<string, string>)["NODE_ENV"] = "development";
  });

  afterEach(() => {
    setEnv(saved);
  });

  // ── Mezclas — siempre bloqueadas ────────────────────────────────────────

  it("bloquea mezcla sk_live + pk_test siempre", async () => {
    process.env["CLERK_SECRET_KEY"] = "sk_live_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_xxxx";
    const { validateClerkEnvironment } = await getModule();
    const result = validateClerkEnvironment();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/mezcla/i);
  });

  it("bloquea mezcla sk_test + pk_live siempre", async () => {
    process.env["CLERK_SECRET_KEY"] = "sk_test_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_live_xxxx";
    const { validateClerkEnvironment } = await getModule();
    const result = validateClerkEnvironment();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/mezcla/i);
  });

  // ── Producción real: VERCEL_ENV=production + APP_ENV=production ─────────

  it("bloquea claves test en producción real (VERCEL_ENV=production + APP_ENV=production)", async () => {
    process.env["VERCEL_ENV"] = "production";
    process.env["APP_ENV"] = "production";
    process.env["CLERK_SECRET_KEY"] = "sk_test_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_xxxx";
    const { validateClerkEnvironment } = await getModule();
    const result = validateClerkEnvironment();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/requiere claves live/i);
  });

  it("acepta claves live en producción real", async () => {
    process.env["VERCEL_ENV"] = "production";
    process.env["APP_ENV"] = "production";
    process.env["CLERK_SECRET_KEY"] = "sk_live_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_live_xxxx";
    const { validateClerkEnvironment } = await getModule();
    expect(validateClerkEnvironment()).toEqual({ ok: true });
  });

  // ── VERCEL_ENV=production pero APP_ENV != production (demo / staging) ───

  it("acepta claves test en Vercel prod con APP_ENV=demo y ALLOW_CLERK_TEST_KEYS=true", async () => {
    process.env["VERCEL_ENV"] = "production";
    process.env["APP_ENV"] = "demo";
    process.env["ALLOW_CLERK_TEST_KEYS"] = "true";
    process.env["CLERK_SECRET_KEY"] = "sk_test_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_xxxx";
    const { validateClerkEnvironment } = await getModule();
    expect(validateClerkEnvironment()).toEqual({ ok: true });
  });

  it("acepta claves test en Vercel prod con APP_ENV=staging y ALLOW_CLERK_TEST_KEYS=true", async () => {
    process.env["VERCEL_ENV"] = "production";
    process.env["APP_ENV"] = "staging";
    process.env["ALLOW_CLERK_TEST_KEYS"] = "true";
    process.env["CLERK_SECRET_KEY"] = "sk_test_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_xxxx";
    const { validateClerkEnvironment } = await getModule();
    expect(validateClerkEnvironment()).toEqual({ ok: true });
  });

  it("bloquea claves test en Vercel prod con APP_ENV=demo sin ALLOW_CLERK_TEST_KEYS", async () => {
    (process.env as Record<string, string>)["NODE_ENV"] = "production"; // Vercel build = production
    process.env["VERCEL_ENV"] = "production";
    process.env["APP_ENV"] = "demo";
    delete process.env["ALLOW_CLERK_TEST_KEYS"];
    process.env["CLERK_SECRET_KEY"] = "sk_test_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_xxxx";
    const { validateClerkEnvironment } = await getModule();
    const result = validateClerkEnvironment();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/ALLOW_CLERK_TEST_KEYS/);
  });

  // ── Desarrollo local (NODE_ENV=development) ─────────────────────────────

  it("acepta claves test en desarrollo local sin variables adicionales", async () => {
    (process.env as Record<string, string>)["NODE_ENV"] = "development";
    delete process.env["VERCEL_ENV"];
    process.env["CLERK_SECRET_KEY"] = "sk_test_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_xxxx";
    const { validateClerkEnvironment } = await getModule();
    expect(validateClerkEnvironment()).toEqual({ ok: true });
  });

  it("acepta claves live en desarrollo local", async () => {
    process.env["CLERK_SECRET_KEY"] = "sk_live_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_live_xxxx";
    const { validateClerkEnvironment } = await getModule();
    expect(validateClerkEnvironment()).toEqual({ ok: true });
  });

  it("acepta claves vacías en desarrollo (Clerk no configurado)", async () => {
    process.env["CLERK_SECRET_KEY"] = "";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "";
    const { validateClerkEnvironment } = await getModule();
    expect(validateClerkEnvironment()).toEqual({ ok: true });
  });

  // ── Build production sin VERCEL_ENV (ej. local build) ───────────────────

  it("bloquea claves test en NODE_ENV=production sin VERCEL_ENV ni ALLOW_CLERK_TEST_KEYS", async () => {
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    delete process.env["VERCEL_ENV"];
    process.env["CLERK_SECRET_KEY"] = "sk_test_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_xxxx";
    const { validateClerkEnvironment } = await getModule();
    const result = validateClerkEnvironment();
    expect(result.ok).toBe(false);
  });

  it("acepta claves test en NODE_ENV=production con ALLOW_CLERK_TEST_KEYS=true", async () => {
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    delete process.env["VERCEL_ENV"];
    process.env["ALLOW_CLERK_TEST_KEYS"] = "true";
    process.env["CLERK_SECRET_KEY"] = "sk_test_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_xxxx";
    const { validateClerkEnvironment } = await getModule();
    expect(validateClerkEnvironment()).toEqual({ ok: true });
  });

  // ── Entorno PILOT ────────────────────────────────────────────────────────

  it("[pilot-1] acepta sk_test + ALLOW_CLERK_TEST_KEYS=true en VERCEL_ENV=production + APP_ENV=pilot", async () => {
    process.env["APP_ENV"] = "pilot";
    process.env["VERCEL_ENV"] = "production";
    process.env["ALLOW_CLERK_TEST_KEYS"] = "true";
    process.env["CLERK_SECRET_KEY"] = "sk_test_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_xxxx";
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    const { validateClerkEnvironment } = await getModule();
    expect(validateClerkEnvironment()).toEqual({ ok: true });
  });

  it("[pilot-2] bloquea sk_test sin ALLOW_CLERK_TEST_KEYS en APP_ENV=pilot", async () => {
    process.env["APP_ENV"] = "pilot";
    process.env["ALLOW_CLERK_TEST_KEYS"] = "false";
    process.env["CLERK_SECRET_KEY"] = "sk_test_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_xxxx";
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    const { validateClerkEnvironment } = await getModule();
    const result = validateClerkEnvironment();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/ALLOW_CLERK_TEST_KEYS/i);
  });

  it("[pilot-4] acepta sk_live + pk_live en APP_ENV=pilot", async () => {
    process.env["APP_ENV"] = "pilot";
    process.env["CLERK_SECRET_KEY"] = "sk_live_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_live_xxxx";
    const { validateClerkEnvironment } = await getModule();
    expect(validateClerkEnvironment()).toEqual({ ok: true });
  });

  it("[pilot-5] bloquea mezcla sk_live + pk_test en APP_ENV=pilot", async () => {
    process.env["APP_ENV"] = "pilot";
    process.env["CLERK_SECRET_KEY"] = "sk_live_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_xxxx";
    const { validateClerkEnvironment } = await getModule();
    const result = validateClerkEnvironment();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/mezcla/i);
  });

  // ── APP_ENV=production: live keys siempre, sin excepción ─────────────────

  it("[prod-6] bloquea sk_test + ALLOW_CLERK_TEST_KEYS=true cuando APP_ENV=production", async () => {
    process.env["APP_ENV"] = "production";
    process.env["ALLOW_CLERK_TEST_KEYS"] = "true";
    process.env["CLERK_SECRET_KEY"] = "sk_test_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_xxxx";
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    const { validateClerkEnvironment } = await getModule();
    const result = validateClerkEnvironment();
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/requiere claves live/i);
  });

  it("[prod-7] acepta sk_live + pk_live cuando APP_ENV=production", async () => {
    process.env["APP_ENV"] = "production";
    process.env["CLERK_SECRET_KEY"] = "sk_live_xxxx";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_live_xxxx";
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    const { validateClerkEnvironment } = await getModule();
    expect(validateClerkEnvironment()).toEqual({ ok: true });
  });
});
