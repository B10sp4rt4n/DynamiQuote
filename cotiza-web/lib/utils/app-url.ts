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
// Ambiente operativo declarado (APP_ENV)
// Orden de permisividad: development < demo/staging < pilot < production
// ---------------------------------------------------------------------------

type AppEnv = "development" | "demo" | "staging" | "pilot" | "production" | "";

function getAppEnv(): AppEnv {
  return (
    process.env["APP_ENV"] ??
    process.env["NEXT_PUBLIC_APP_ENV"] ??
    ""
  ).toLowerCase() as AppEnv;
}

/**
 * Verifica si el hostname de la URL está en ALLOWED_APP_URL_HOSTS.
 * Si la variable no está definida, no se aplica restricción (permite cualquier host).
 * Uso: validar que APP_URL pertenezca a una lista explícita en entornos pilot/production.
 */
function isAllowedHost(url: string): boolean {
  const hostsRaw = process.env["ALLOWED_APP_URL_HOSTS"]?.trim();
  if (!hostsRaw) return true; // sin restricción si la variable no está definida
  const allowed = hostsRaw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  try {
    const { hostname } = new URL(url);
    return allowed.includes(hostname.toLowerCase());
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
  const appEnv = getAppEnv();
  const isPilot = appEnv === "pilot";

  // Ambientes estrictos: producción y pilot no admiten localhost ni URLs de preview.
  // En pilot además se valida ALLOWED_APP_URL_HOSTS si está definida.
  const isStrictEnv = isProduction || isPilot;
  const envLabel = isPilot ? "PILOT" : "producción";

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

    if (isStrictEnv) {
      if (isLocalhostUrl(rawUrl)) {
        return {
          ok: false,
          error: `La URL pública apunta a localhost en un entorno ${envLabel}.`,
        };
      }
      if (isVercelPreviewUrl(rawUrl)) {
        return {
          ok: false,
          error: `La URL pública apunta a un preview de Vercel en entorno ${envLabel}.`,
        };
      }
    }

    // Validar allowlist de hosts en pilot y production cuando ALLOWED_APP_URL_HOSTS está definida
    if ((isPilot || appEnv === "production") && !isAllowedHost(rawUrl)) {
      return {
        ok: false,
        error:
          `URL no autorizada para entorno ${appEnv.toUpperCase()}. ` +
          "Agrega el dominio a ALLOWED_APP_URL_HOSTS o actualiza NEXT_PUBLIC_APP_URL.",
      };
    }

    return { ok: true, url: rawUrl.replace(/\/$/, "") };
  }

  if (isStrictEnv) {
    return {
      ok: false,
      error: `NEXT_PUBLIC_APP_URL no está configurada en entorno ${envLabel}.`,
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
// Tiers de ambiente (orden de permisividad ascendente):
//   development → demo/staging → pilot → production
//
// Reglas:
//   - APP_ENV=production → claves live OBLIGATORIAS. ALLOW_CLERK_TEST_KEYS no tiene efecto.
//   - APP_ENV=pilot      → claves test permitidas SOLO si ALLOW_CLERK_TEST_KEYS=true.
//   - APP_ENV=demo/staging o NODE_ENV=development → claves test permitidas con ALLOW_CLERK_TEST_KEYS=true.
//   - Mezcla sk_live_/pk_test_ o sk_test_/pk_live_ SIEMPRE bloqueada, sin excepción.
//
// Para validación de URLs (localhost, preview, allowlist de hosts) usar getPublicAppUrl().
// ---------------------------------------------------------------------------

export function validateClerkEnvironment(): ClerkEnvResult {
  const vercelEnv = process.env["VERCEL_ENV"] ?? "";
  const nodeEnv = process.env["NODE_ENV"] ?? "";
  const appEnv = getAppEnv();
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

  // Producción: APP_ENV=production. Requiere claves live sin excepción.
  // ALLOW_CLERK_TEST_KEYS=true es ignorado en este tier.
  const isRealProduction = appEnv === "production";
  const isPilot = appEnv === "pilot";

  // En ambientes no-producción, las claves test se permiten con opt-in explícito.
  // NODE_ENV=development (Next.js local) siempre es OK.
  // Para los demás (demo, staging, pilot) se requiere ALLOW_CLERK_TEST_KEYS=true.
  const isExplicitNonProd =
    nodeEnv === "development" || // entorno local Next.js: siempre OK
    allowTestKeys; // opt-in para demo / staging / pilot

  // Logs seguros server-side
  const appUrlMode = detectAppUrlMode();
  console.info("[clerk-env] validateClerkEnvironment", {
    NODE_ENV: nodeEnv,
    VERCEL_ENV: vercelEnv || "(no definida)",
    APP_ENV: appEnv || "(no definida)",
    ALLOW_CLERK_TEST_KEYS: allowTestKeys,
    detectedClerkMode: secretMode === publicMode ? secretMode : "mixed",
    isRealProduction,
    isPilot,
    allowTestKeys: isExplicitNonProd,
    appUrlMode,
  });

  // Producción real: live keys obligatorias. ALLOW_CLERK_TEST_KEYS no tiene efecto aquí.
  if (isRealProduction && (secretMode === "test" || publicMode === "test")) {
    return {
      ok: false,
      error:
        "Configuración de Clerk inválida: APP_ENV=production requiere claves live. " +
        "Las claves de prueba no están permitidas en producción. " +
        "Configura CLERK_SECRET_KEY=sk_live_... y NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...",
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
        "Agrega ALLOW_CLERK_TEST_KEYS=true (y APP_ENV=demo, pilot o staging según corresponda) para permitirlas.",
    };
  }

  // Log específico cuando pilot usa test keys por opt-in explícito
  if (isPilot && (secretMode === "test" || publicMode === "test") && isExplicitNonProd) {
    console.info("[clerk-env] Ambiente PILOT usando Clerk test keys permitido explícitamente.");
  }

  return { ok: true };
}
