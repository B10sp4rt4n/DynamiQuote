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
// validateClerkEnvironment
// Verifica que las claves de Clerk sean coherentes con el entorno.
// En producción, bloquea claves de desarrollo (pk_test_ / sk_test_).
// En cualquier entorno, bloquea mezclas de claves live+test.
// ---------------------------------------------------------------------------

export function validateClerkEnvironment(): ClerkEnvResult {
  const isProduction = isProductionEnv();

  const secretKey = process.env["CLERK_SECRET_KEY"] ?? "";
  const publishableKey = process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] ?? "";

  const secretIsLive = secretKey.startsWith("sk_live_");
  const secretIsTest = secretKey.startsWith("sk_test_");
  const publishableIsLive = publishableKey.startsWith("pk_live_");
  const publishableIsTest = publishableKey.startsWith("pk_test_");

  // Mezcla de claves live y test — siempre inválido
  if (
    (secretIsLive && publishableIsTest) ||
    (secretIsTest && publishableIsLive)
  ) {
    return {
      ok: false,
      error:
        "Configuración de Clerk inválida: mezcla de claves sk_live_/pk_test_ o sk_test_/pk_live_.",
    };
  }

  // En producción, las claves de desarrollo no son aceptables
  if (isProduction && (secretIsTest || publishableIsTest)) {
    return {
      ok: false,
      error:
        "Configuración de Clerk inválida: entorno de producción requiere claves sk_live_ y pk_live_.",
    };
  }

  return { ok: true };
}
