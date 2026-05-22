import "server-only";

// ---------------------------------------------------------------------------
// Detección de URLs inválidas para correos en producción
// ---------------------------------------------------------------------------

function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * Detecta URLs de preview de Vercel.
 * Las URLs de preview tienen formato: name-HASH.vercel.app o name-git-branch.vercel.app
 * El dominio canónico (dynami-quote.vercel.app) no tiene sufijo de hash ni "-git-".
 */
function isVercelPreviewUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    if (!hostname.endsWith(".vercel.app")) return false;
    const prefix = hostname.slice(0, -(".vercel.app".length));
    return /-[a-z0-9]{7,}$/.test(prefix) || prefix.includes("-git-");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Resultado tipado para evitar throw silencioso
// ---------------------------------------------------------------------------

export type AppUrlResult = { ok: true; url: string } | { ok: false; error: string };
export type ClerkEnvResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers de entorno
// ---------------------------------------------------------------------------

function isProductionEnv(): boolean {
  const vercelEnv = process.env["VERCEL_ENV"];
  const nodeEnv = process.env["NODE_ENV"];
  return vercelEnv === "production" || (nodeEnv === "production" && !vercelEnv);
}

// ---------------------------------------------------------------------------
// getPublicAppUrl
// Resuelve la URL pública de la aplicación con validación de seguridad.
// Prioridad: APP_URL → NEXT_PUBLIC_APP_URL → NEXT_PUBLIC_SITE_URL → localhost (solo en dev)
// En producción, lanza error si la URL apunta a localhost o a un preview de Vercel.
// ---------------------------------------------------------------------------

export function getPublicAppUrl(): AppUrlResult {
  const isProduction = isProductionEnv();

  const rawUrl =
    process.env["APP_URL"]?.trim() ||
    process.env["NEXT_PUBLIC_APP_URL"]?.trim() ||
    process.env["NEXT_PUBLIC_SITE_URL"]?.trim() ||
    null;

  if (rawUrl) {
    try {
      new URL(rawUrl);
    } catch {
      return { ok: false, error: "La URL pública configurada no es válida." };
    }

    if (isProduction) {
      if (isLocalhostUrl(rawUrl)) {
        return {
          ok: false,
          error: "La URL pública apunta a localhost en un entorno de producción.",
        };
      }
      if (isVercelPreviewUrl(rawUrl)) {
        return {
          ok: false,
          error: "La URL pública apunta a un preview de Vercel en producción.",
        };
      }
    }

    return { ok: true, url: rawUrl.replace(/\/$/, "") };
  }

  if (isProduction) {
    return {
      ok: false,
      error: "NEXT_PUBLIC_APP_URL no está configurada en producción.",
    };
  }

  // Fallback solo en desarrollo
  return { ok: true, url: "http://localhost:3000" };
}

// ---------------------------------------------------------------------------
// getClerkAccessUrl
// Construye la URL final para el botón de acceso en correos.
// Siempre usa getPublicAppUrl() como base — nunca tokenResult.url de Clerk.
// ---------------------------------------------------------------------------

export function getClerkAccessUrl(path: "/sign-in" | "/sign-up" = "/sign-in"): AppUrlResult {
  const base = getPublicAppUrl();
  if (!base.ok) return base;
  return { ok: true, url: `${base.url}${path}` };
}

// ---------------------------------------------------------------------------
// buildClerkTicketUrl
// Construye la URL de sign-in con un token de Clerk embebido como hash fragment.
// Usa el token (no tokenResult.url) para garantizar que el dominio sea siempre
// el de la aplicación, independiente de lo que tenga configurada la instancia Clerk.
// ---------------------------------------------------------------------------

export function buildClerkTicketUrl(token: string): AppUrlResult {
  const base = getPublicAppUrl();
  if (!base.ok) return base;
  return {
    ok: true,
    url: `${base.url}/sign-in#__clerk_ticket=${encodeURIComponent(token)}`,
  };
}

// ---------------------------------------------------------------------------
// Ambiente no sensitivo para logs — nunca imprime claves completas
// ---------------------------------------------------------------------------

type ClerkMode = "live" | "test" | "unknown";
type AppUrlMode = "production" | "preview" | "localhost" | "unknown";

function detectAppUrlMode(): AppUrlMode {
  const raw =
    process.env["APP_URL"]?.trim() ||
    process.env["NEXT_PUBLIC_APP_URL"]?.trim() ||
    process.env["NEXT_PUBLIC_SITE_URL"]?.trim() ||
    null;
  if (!raw) return "unknown";
  try {
    const { hostname } = new URL(raw);
    if (hostname === "localhost" || hostname === "127.0.0.1") return "localhost";
    if (hostname.endsWith(".vercel.app")) {
      const prefix = hostname.slice(0, -(".vercel.app".length));
      return /-[a-z0-9]{7,}$/.test(prefix) || prefix.includes("-git-")
        ? "preview"
        : "production";
    }
    return "production";
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// validateClerkEnvironment
//
// isRealProduction = VERCEL_ENV === "production" AND APP_ENV === "production"
//
// Si isRealProduction → solo acepta sk_live_ + pk_live_.
// Si no es producción real → acepta sk_test_ + pk_test_ únicamente si:
//   - NODE_ENV === "development"   (entorno local Next.js)
//   - APP_ENV ∈ {demo, staging, preview, development}
//   - ALLOW_CLERK_TEST_KEYS === "true"
// La mezcla live/test siempre está bloqueada, sin excepción.
// ---------------------------------------------------------------------------

export function validateClerkEnvironment(): ClerkEnvResult {
  const vercelEnv = process.env["VERCEL_ENV"] ?? "";
  const nodeEnv = process.env["NODE_ENV"] ?? "";
  const appEnv = (process.env["APP_ENV"] ?? process.env["NEXT_PUBLIC_APP_ENV"] ?? "").toLowerCase();
  const allowTestKeys = process.env["ALLOW_CLERK_TEST_KEYS"] === "true";

  const secretKey = process.env["CLERK_SECRET_KEY"] ?? "";
  const publishableKey = process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] ?? "";

  const secretMode: ClerkMode = secretKey.startsWith("sk_live_")
    ? "live"
    : secretKey.startsWith("sk_test_")
      ? "test"
      : "unknown";

  const publicMode: ClerkMode = publishableKey.startsWith("pk_live_")
    ? "live"
    : publishableKey.startsWith("pk_test_")
      ? "test"
      : "unknown";

  // Mezcla live/test — siempre inválida, sin excepción
  if (
    (secretMode === "live" && publicMode === "test") ||
    (secretMode === "test" && publicMode === "live")
  ) {
    return {
      ok: false,
      error:
        "Configuración de Clerk inválida: claves públicas y privadas pertenecen a ambientes distintos (mezcla sk_live_/pk_test_ o sk_test_/pk_live_).",
    };
  }

  // Producción real: VERCEL_ENV=production Y APP_ENV=production
  const isRealProduction = vercelEnv === "production" && appEnv === "production";

  // Ambientes que permiten claves test explícitamente.
  // Fuera de NODE_ENV=development, el único gate es ALLOW_CLERK_TEST_KEYS=true.
  // APP_ENV se usa para isRealProduction y logging, no como permiso en sí mismo.
  const isExplicitNonProd =
    nodeEnv === "development" || // entorno local Next.js: siempre OK
    allowTestKeys; // opt-in explícito requerido para todos los demás ambientes

  // Logs seguros server-side
  const appUrlMode = detectAppUrlMode();
  console.info("[clerk-env] validateClerkEnvironment", {
    NODE_ENV: nodeEnv,
    VERCEL_ENV: vercelEnv || "(no definida)",
    APP_ENV: appEnv || "(no definida)",
    ALLOW_CLERK_TEST_KEYS: allowTestKeys,
    detectedClerkMode: secretMode === publicMode ? secretMode : "mixed",
    isRealProduction,
    allowTestKeys: isExplicitNonProd,
    appUrlMode,
  });

  if (isRealProduction && (secretMode === "test" || publicMode === "test")) {
    return {
      ok: false,
      error:
        "Configuración de Clerk inválida: este ambiente está marcado como producción real " +
        "(VERCEL_ENV=production y APP_ENV=production), pero usa claves de prueba. " +
        "Configura claves live o marca el ambiente como staging/demo con APP_ENV=staging y ALLOW_CLERK_TEST_KEYS=true.",
    };
  }

  // Claves test en un ambiente que no ha declarado explícitamente que las permite
  if (
    !isRealProduction &&
    (secretMode === "test" || publicMode === "test") &&
    !isExplicitNonProd
  ) {
    return {
      ok: false,
      error:
        "Configuración de Clerk inválida: se detectaron claves de prueba en un ambiente no declarado. " +
        "Agrega APP_ENV=staging (o demo/preview/development) y ALLOW_CLERK_TEST_KEYS=true para permitirlas.",
    };
  }

  return { ok: true };
}
