import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";

export type ResendClientResult = {
  client: Resend | null;
  error: string | null;
};

type ResendConfigResult = ResendClientResult & {
  from: string;
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
  const envApiKey = resolveEnvApiKey();
  const envFrom = resolveEnvFromEmail();
  const clerkSettings = !envApiKey || !envFrom ? await resolveClerkEmailSettings() : { apiKey: "", from: "" };

  const apiKey = envApiKey || clerkSettings.apiKey;
  const from = envFrom || clerkSettings.from;

  if (!apiKey) {
    return {
      client: null,
      error: "Falta configurar RESEND_API_KEY/API_RESEND_API_KEY para enviar correos.",
      from: from.includes("@") ? from : "Cotiza <onboarding@resend.dev>",
    };
  }

  return {
    client: new Resend(apiKey),
    error: null,
    from: from.includes("@") ? from : "Cotiza <onboarding@resend.dev>",
  };
}

export async function getResendClient(): Promise<ResendClientResult> {
  const { client, error } = await resolveResendConfig();
  return { client, error };
}

export async function resolveResendFromEmail(): Promise<string> {
  const configuredFrom = (await resolveResendConfig()).from;

  if (configuredFrom.includes("@")) {
    return configuredFrom;
  }

  return "Cotiza <onboarding@resend.dev>";
}