import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";

import { getAppEnv } from "@/lib/utils/app-url";

export type ResendClientResult = {
  client: Resend | null;
  error: string | null;
};

export type ResendConfigSource = "env" | "clerk_metadata" | "fallback_dev_only";

export type ResendConfigResult = ResendClientResult & {
  from: string;
  configSource: ResendConfigSource;
};

const RESEND_API_KEY_KEYS = [
  "resendApiKey",
  "resend_api_key",
  "resendKey",
  "resend_key",
  "apiResendApiKey",
  "API_RESEND_API_KEY",
  "RESEND_API_KEY",
] as const;

const RESEND_FROM_KEYS = [
  "resendFrom",
  "resend_from",
  "resendFromEmail",
  "resend_from_email",
  "RESEND_FROM",
  "RESEND_FROM_EMAIL",
] as const;

function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Extrae el dominio a partir de un campo `from` de correo.
 * Soporta "Nombre <correo@dominio>" y "correo@dominio".
 */
export function extractFromDomain(from: string): string {
  const angleMatch = from.match(/<([^>]+)>/);
  const email = angleMatch?.[1]?.trim() ?? from.trim();
  return email.split("@")[1]?.toLowerCase() ?? "(desconocido)";
}

/**
 * Valida que el campo `from` sea un remitente aceptable para el entorno dado.
 *
 * Reglas:
 * - Debe contener "@".
 * - Fuera de `development`, no puede usar el dominio `resend.dev`.
 */
export function validateResendFrom(
  from: string,
  appEnv: string,
): { valid: boolean; error?: string } {
  const trimmed = from.trim();

  if (!trimmed || !trimmed.includes("@")) {
    if (appEnv === "development") {
      return {
        valid: false,
        error: "RESEND_FROM vacío o sin '@'. Se usará fallback de desarrollo.",
      };
    }
    return {
      valid: false,
      error:
        "RESEND_FROM no está configurado con un dominio verificado. No se enviará correo con onboarding@resend.dev fuera de desarrollo.",
    };
  }

  const domain = extractFromDomain(trimmed);

  if (domain === "resend.dev" && appEnv !== "development") {
    return {
      valid: false,
      error:
        "RESEND_FROM no está configurado con un dominio verificado. No se enviará correo con onboarding@resend.dev fuera de desarrollo.",
    };
  }

  return { valid: true };
}

function resolveEnvApiKey(): string {
  return pickString(process.env["RESEND_API_KEY"]) || pickString(process.env["API_RESEND_API_KEY"]);
}

function resolveEnvFromEmail(): string {
  return pickString(process.env["RESEND_FROM"]) || pickString(process.env["RESEND_FROM_EMAIL"]);
}

function readMetadataValue(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: readonly string[],
): string {
  for (const source of sources) {
    if (!source) continue;

    for (const key of keys) {
      const value = pickString(source[key]);
      if (value) {
        return value;
      }
    }
  }

  return "";
}

async function resolveClerkEmailSettings(): Promise<{ apiKey: string; from: string }> {
  try {
    const { orgId, userId } = await auth();

    if (!orgId && !userId) {
      return { apiKey: "", from: "" };
    }

    const client = await clerkClient();
    const metadataSources: Array<Record<string, unknown> | null | undefined> = [];

    if (orgId) {
      try {
        const organization = await client.organizations.getOrganization({ organizationId: orgId });
        metadataSources.push(
          organization.privateMetadata as Record<string, unknown> | null | undefined,
          organization.publicMetadata as Record<string, unknown> | null | undefined,
        );
      } catch {
        // Algunas instancias no tienen Organizations habilitado; en ese caso continuamos con user metadata.
      }
    }

    if (userId) {
      try {
        const user = await client.users.getUser(userId);
        metadataSources.push(
          user.privateMetadata as Record<string, unknown> | null | undefined,
          user.publicMetadata as Record<string, unknown> | null | undefined,
        );
      } catch {
        // Si Clerk no puede leer el usuario autenticado, devolvemos lo que sí hayamos podido resolver.
      }
    }

    return {
      apiKey: readMetadataValue(metadataSources, RESEND_API_KEY_KEYS),
      from: readMetadataValue(metadataSources, RESEND_FROM_KEYS),
    };
  } catch {
    return { apiKey: "", from: "" };
  }
}

export async function resolveResendApiKey(): Promise<string> {
  const apiKey = resolveEnvApiKey();
  if (apiKey) {
    return apiKey;
  }

  const clerkSettings = await resolveClerkEmailSettings();
  return clerkSettings.apiKey;
}

export async function resolveResendConfig(): Promise<ResendConfigResult> {
  const appEnv = getAppEnv();
  const isDev = appEnv === "development" || process.env["NODE_ENV"] === "development";

  const envApiKey = resolveEnvApiKey();
  const envFrom = resolveEnvFromEmail();

  // Obtener metadata de Clerk solo si faltan variables de entorno.
  let clerkSettings: { apiKey: string; from: string } = { apiKey: "", from: "" };
  if (!envApiKey || !envFrom) {
    clerkSettings = await resolveClerkEmailSettings();
  }

  const apiKey = envApiKey || clerkSettings.apiKey;

  // Variables de entorno tienen prioridad absoluta sobre metadata de Clerk.
  let rawFrom = envFrom;
  let configSource: ResendConfigSource = "env";

  if (!rawFrom) {
    const clerkFrom = clerkSettings.from;
    if (clerkFrom) {
      const clerkFromValidation = validateResendFrom(clerkFrom, appEnv);
      if (clerkFromValidation.valid) {
        rawFrom = clerkFrom;
        configSource = "clerk_metadata";
      } else {
        console.warn("[email] Metadata de Clerk tiene RESEND_FROM inválido, ignorando.", {
          error: clerkFromValidation.error,
        });
      }
    }
  }

  // Si rawFrom sigue vacío, usar fallback solo en desarrollo; en otros entornos, error.
  if (!rawFrom || !rawFrom.includes("@")) {
    if (isDev) {
      rawFrom = "Cotiza Dev <onboarding@resend.dev>";
      configSource = "fallback_dev_only";
      console.warn(
        "[email] RESEND_FROM no configurado. Usando fallback de desarrollo: onboarding@resend.dev. Solo válido en local.",
      );
    } else {
      console.error("[email] RESEND_FROM no configurado en entorno no local.", { appEnv });
      return {
        client: null,
        configSource: "fallback_dev_only",
        error:
          "RESEND_FROM no está configurado con un dominio verificado. No se enviará correo con onboarding@resend.dev fuera de desarrollo.",
        from: "",
      };
    }
  }

  // Validación final del from: atrapa onboarding@resend.dev fuera de development.
  const fromValidation = validateResendFrom(rawFrom, appEnv);
  if (!fromValidation.valid) {
    console.error("[email] RESEND_FROM inválido.", { appEnv, error: fromValidation.error });
    return {
      client: null,
      configSource,
      error:
        fromValidation.error ??
        "RESEND_FROM no está configurado con un dominio verificado.",
      from: rawFrom,
    };
  }

  const fromDomain = extractFromDomain(rawFrom);

  console.info("[email] Resend config resuelto.", {
    APP_ENV: appEnv,
    VERCEL_ENV: process.env["VERCEL_ENV"] ?? "(no definido)",
    configSource,
    fromDomain,
    hasApiKey: Boolean(apiKey),
  });

  if (!apiKey) {
    return {
      client: null,
      configSource,
      error: "Falta configurar RESEND_API_KEY/API_RESEND_API_KEY para enviar correos.",
      from: rawFrom,
    };
  }

  return {
    client: new Resend(apiKey),
    configSource,
    error: null,
    from: rawFrom,
  };
}

export async function getResendClient(): Promise<ResendClientResult> {
  const { client, error } = await resolveResendConfig();
  return { client, error };
}

export async function resolveResendFromEmail(): Promise<string> {
  const { from } = await resolveResendConfig();
  return from;
}