import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  closeQuoteVersionByTenant,
  markQuoteAsSentByTenant,
  rejectQuoteVersionByTenant,
} from "@/lib/db/quote-editor";
import { deleteQuoteGroupByTenant, isQuoteVisibleToViewer } from "@/lib/db/quotes";
import { prisma } from "@/lib/db/prisma";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { quoteActionSchema } from "@/lib/validations/quotes";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ quoteId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = tenant.userId ?? tenant.id;
  const identity = getRequestIdentity(request, userId);
  const rateLimit = enforceRateLimit(`quotes:action:${tenant.id}:${identity}`, 30, 60_000);

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

  const { quoteId } = await context.params;

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const visible = await isQuoteVisibleToViewer(tenant.id, quoteId, tenant.userId, canSeeAll);

  if (!visible) {
    return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
  }

  const parsed = quoteActionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos invalidos" },
      { status: 422 },
    );
  }

  const { action, reason } = parsed.data;

  let result: Record<string, unknown> | null = null;

  if (action === "send") {
    result = await markQuoteAsSentByTenant(tenant.id, quoteId, userId);
  } else if (action === "close") {
    result = await closeQuoteVersionByTenant(tenant.id, quoteId, userId, reason);
  } else if (action === "reject") {
    result = await rejectQuoteVersionByTenant(tenant.id, quoteId, userId, reason);
  }

  if (!result) {
    return NextResponse.json(
      { error: "Cotizacion no encontrada o la transicion no esta permitida" },
      { status: 422 },
    );
  }

  return NextResponse.json({ quoteId, ...result });
}

export async function DELETE(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = tenant.userId ?? tenant.id;
  const identity = getRequestIdentity(request, userId);
  const rateLimit = enforceRateLimit(`quotes:delete:${tenant.id}:${identity}`, 30, 60_000);

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

  const { quoteId } = await context.params;

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const visible = await isQuoteVisibleToViewer(tenant.id, quoteId, tenant.userId, canSeeAll);

  if (!visible) {
    return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
  }

  const quote = await prisma.quote.findFirst({
    select: { quote_group_id: true },
    where: { quote_id: quoteId, tenantId: tenant.id },
  });

  if (!quote?.quote_group_id) {
    return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
  }

  const result = await deleteQuoteGroupByTenant(tenant.id, quote.quote_group_id, tenant.userId, canSeeAll);

  if (result === "not_found") {
    return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
  }

  if (result === "forbidden") {
    return NextResponse.json({ error: "No tienes permiso para borrar esta cotizacion" }, { status: 403 });
  }

  if (result === "closed") {
    return NextResponse.json(
      { error: "No se puede borrar una cotizacion cerrada" },
      { status: 409 },
    );
  }

  if (result === "in_use") {
    return NextResponse.json(
      { error: "No se puede borrar: tiene una propuesta formal o un archivo importado ligado" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
