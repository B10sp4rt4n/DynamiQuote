import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { createQuoteForTenant, QuoteCreationError } from "@/lib/db/quotes";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { createQuoteSchema } from "@/lib/validations/quotes";

export async function POST(request: Request) {
  const tenant = await getCurrentTenantContext();

  if (!tenant?.userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`quotes:create:${tenant.id}:${identity}`, 20, 60_000);

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

  const parsed = createQuoteSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Revisa los datos de la cotización y la oportunidad", issues: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
    const quote = await createQuoteForTenant(tenant.id, parsed.data, tenant.userId, canSeeAll);
    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    if (error instanceof QuoteCreationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "No se pudo confirmar la creación. Reintenta sin cambiar los datos." }, { status: 409 });
  }
}