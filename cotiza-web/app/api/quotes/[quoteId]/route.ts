import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  closeQuoteVersionByTenant,
  markQuoteAsSentByTenant,
  rejectQuoteVersionByTenant,
} from "@/lib/db/quote-editor";
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
