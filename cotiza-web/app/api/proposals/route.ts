import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { prisma } from "@/lib/db/prisma";
import { isQuoteVisibleToViewer } from "@/lib/db/quotes";
import { createProposalFromQuoteByTenant, getProposalListPageByTenant, isProposalVisibleToViewer } from "@/lib/db/proposals";
import {
  normalizeBlockedMarginFilter,
  normalizeProposalOutcomeFilter,
  normalizeProposalStatusFilter,
} from "@/lib/domain/proposal-list-state";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { createProposalFromQuoteSchema } from "@/lib/validations/proposals";

export async function GET(request: Request) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const url = new URL(request.url);
  const status = normalizeProposalStatusFilter(url.searchParams.get("status"));
  const outcome = normalizeProposalOutcomeFilter(url.searchParams.get("outcome"));
  const blockedMargin = normalizeBlockedMarginFilter(url.searchParams.get("blockedMargin"));
  const search = url.searchParams.get("q") ?? "";
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

  const page = await getProposalListPageByTenant(
    tenant.id,
    tenant.userId,
    canSeeAll,
    { blockedMargin, outcome, status },
    offset,
    undefined,
    search,
  );

  return NextResponse.json(page, { status: 200 });
}

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

    const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
    if (!await isQuoteVisibleToViewer(tenant.id, parsed.data.quoteId, tenant.userId, canSeeAll)) {
      return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
    }

    // A replay returns an existing proposal. Authorizing the source quote
    // alone must not expose a proposal owned by someone else or backfill it.
    if (!canSeeAll) {
      const existing = await prisma.proposals.findFirst({
        where: { tenant_id: tenant.id, origin: parsed.data.quoteId },
        select: { proposal_id: true },
      });
      if (existing && !await isProposalVisibleToViewer(tenant.id, existing.proposal_id, tenant.userId, false)) {
        return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
      }
    }

    const actorName = await resolveActorName(tenant.id, tenant.userId, tenant.userDisplayName);
    const proposal = await createProposalFromQuoteByTenant(tenant.id, parsed.data, actorName, tenant.userId ?? null);

    if (!proposal) {
      return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado al crear propuesta";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
