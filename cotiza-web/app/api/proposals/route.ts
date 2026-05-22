import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { prisma } from "@/lib/db/prisma";
import { createProposalFromQuoteByTenant } from "@/lib/db/proposals";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { createProposalFromQuoteSchema } from "@/lib/validations/proposals";

async function resolveActorName(tenantId: string, userId: string | null, fallback: string | null): Promise<string> {
  if (!userId) {
    return fallback?.trim() || "Usuario del tenant";
  }

  const appUser = await prisma.app_users.findFirst({
    select: {
      first_name: true,
      last_name: true,
    },
    where: {
      tenant_id: tenantId,
      user_id: userId,
    },
  });

  const fullName = [appUser?.first_name, appUser?.last_name]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();

  const fallbackName = fallback?.trim() || "";

  if (fullName) {
    return fullName;
  }

  if (fallbackName.length > 0 && !/^(ser|user|sess|org)_[A-Za-z0-9]+$/.test(fallbackName)) {
    return fallbackName;
  }

  const activeAdmin = await prisma.app_users.findFirst({
    orderBy: [{ created_at: "asc" }],
    select: {
      alias: true,
      first_name: true,
      last_name: true,
    },
    where: {
      active: true,
      role: {
        in: ["admin", "owner"],
      },
      tenant_id: tenantId,
    },
  });

  const adminFullName = [activeAdmin?.first_name, activeAdmin?.last_name]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();

  if (adminFullName.length > 0) {
    return adminFullName;
  }

  if (activeAdmin?.alias && !/^(ser|user|sess|org)_[A-Za-z0-9]+$/.test(activeAdmin.alias.trim())) {
    return activeAdmin.alias.trim();
  }

  return "Usuario del tenant";
}

export async function POST(request: Request) {
  try {
    const tenant = await getCurrentTenantContext();

    if (!tenant) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
    const rateLimit = enforceRateLimit(`proposal:create:${tenant.id}:${identity}`, 20, 60_000);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas operaciones, intenta nuevamente en breve" },
        {
          headers: {
            "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
          },
          status: 429,
        },
      );
    }

    const parsed = createProposalFromQuoteSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Payload invalido para crear propuesta" }, { status: 422 });
    }

    const actorName = await resolveActorName(tenant.id, tenant.userId, tenant.userDisplayName);
    const proposal = await createProposalFromQuoteByTenant(tenant.id, parsed.data, actorName);

    if (!proposal) {
      return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado al crear propuesta";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}