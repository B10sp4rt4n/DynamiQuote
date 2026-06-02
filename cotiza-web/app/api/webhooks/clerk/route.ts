import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";

import { syncManagedUserFromClerkUserCreated } from "@/lib/db/settings";

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeRole(value: string | null): "admin" | "owner" | "user" {
  const normalized = (value ?? "user").toLowerCase();
  if (normalized === "admin" || normalized === "owner" || normalized === "user") {
    return normalized;
  }
  return "user";
}

function extractPrimaryEmail(data: Record<string, unknown>): string | null {
  const primaryId = pickString(data["primary_email_address_id"]);
  const emailAddresses = data["email_addresses"];
  if (!Array.isArray(emailAddresses)) return null;

  if (primaryId) {
    for (const entry of emailAddresses) {
      if (typeof entry !== "object" || entry === null) continue;
      const row = entry as Record<string, unknown>;
      if (pickString(row.id) === primaryId) {
        const primaryEmail = pickString(row.email_address);
        if (primaryEmail) return primaryEmail.toLowerCase();
      }
    }
  }

  for (const entry of emailAddresses) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const fallbackEmail = pickString(row.email_address);
    if (fallbackEmail) return fallbackEmail.toLowerCase();
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const event = await verifyWebhook(request);

    if (event.type !== "user.created") {
      return NextResponse.json({ ignored: true, reason: "unsupported_event", type: event.type }, { status: 200 });
    }

    const payload = event.data as unknown as Record<string, unknown>;
    const publicMetadata =
      typeof payload.public_metadata === "object" && payload.public_metadata !== null
        ? (payload.public_metadata as Record<string, unknown>)
        : {};

    const clerkUserId = pickString(payload.id);
    const tenantId = pickString(publicMetadata.tenantId) ?? pickString(publicMetadata.tenant_id);

    if (!clerkUserId) {
      return NextResponse.json({ error: "Evento user.created sin id de Clerk" }, { status: 422 });
    }

    if (!tenantId) {
      return NextResponse.json(
        { ignored: true, reason: "missing_tenant_in_metadata", clerkUserId },
        { status: 200 },
      );
    }

    const firstName = pickString(payload.first_name) ?? "Usuario";
    const lastName = pickString(payload.last_name) ?? "Invitado";
    const role = normalizeRole(pickString(publicMetadata.role));
    const localUserId = pickString(publicMetadata.localUserId) ?? pickString(publicMetadata.local_user_id);
    const externalId = pickString(payload.external_id);
    const normalizedEmail = extractPrimaryEmail(payload) ?? `user-${clerkUserId}@placeholder.local`;

    const synced = await syncManagedUserFromClerkUserCreated({
      clerkUserId,
      externalId,
      firstName,
      lastName,
      localUserId,
      normalizedEmail,
      role,
      tenantId,
    });

    if (!synced) {
      return NextResponse.json(
        { clerkUserId, ignored: true, reason: "could_not_match_or_create_local_user", tenantId },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        tenantId,
        userId: synced.userId,
      },
      { status: 200 },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error desconocido";
    console.error("[webhook][clerk] Error procesando webhook:", error);
    return NextResponse.json({ error: `Webhook invalido: ${detail}` }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      message: "Endpoint de webhook Clerk activo. Usa metodo POST con firma Svix.",
      path: "/api/webhooks/clerk",
    },
    { status: 200 },
  );
}
