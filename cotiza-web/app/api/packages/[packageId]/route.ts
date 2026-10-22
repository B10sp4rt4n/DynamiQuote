import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isQuoteVisibleToViewer } from "@/lib/db/quotes";
import { QuoteInputError } from "@/lib/domain/quote-input";
import {
  getPackageDetailByTenant,
  insertPackageIntoQuote,
  togglePackageActiveForTenant,
  updatePackageMetaForTenant,
} from "@/lib/db/packages";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import {
  insertPackageIntoQuoteSchema,
  updatePackageMetaSchema,
} from "@/lib/validations/packages";

type Params = { params: Promise<{ packageId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { packageId } = await params;
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rateLimit = enforceRateLimit(`packages:detail:${tenant.id}:${packageId}`, 60, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes, intenta nuevamente en breve" },
      {
        headers: {
          "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
        },
        status: 429,
      },
    );
  }

  const pkg = await getPackageDetailByTenant(tenant.id, packageId);
  if (!pkg) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json({ package: pkg });
}

export async function PATCH(req: Request, { params }: Params) {
  const { packageId } = await params;
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const identity = getRequestIdentity(req, tenant.userId ?? tenant.id);

  const body: unknown = await req.json();

  // Toggle active si body tiene { action: "toggle" }
  if (
    typeof body === "object" &&
    body !== null &&
    "action" in body &&
    (body as Record<string, unknown>)["action"] === "toggle"
  ) {
    const rateLimit = enforceRateLimit(`packages:toggle:${tenant.id}:${packageId}:${identity}`, 20, 60_000);
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

    const active = await togglePackageActiveForTenant(tenant.id, packageId);
    if (active === null) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ active });
  }

  // Insertar en cotización si body tiene { action: "insert", quoteId }
  if (
    typeof body === "object" &&
    body !== null &&
    "action" in body &&
    (body as Record<string, unknown>)["action"] === "insert"
  ) {
    const rateLimit = enforceRateLimit(`packages:insert:${tenant.id}:${packageId}:${identity}`, 15, 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas inserciones, intenta nuevamente en breve" },
        {
          headers: {
            "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
          },
          status: 429,
        },
      );
    }

    const parsed = insertPackageIntoQuoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
    if (!await isQuoteVisibleToViewer(tenant.id, parsed.data.quoteId, tenant.userId, canSeeAll)) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    }
    try {
      const result = await insertPackageIntoQuote(tenant.id, packageId, parsed.data.quoteId, parsed.data);
      if (!result) return NextResponse.json({ error: "Plantilla no encontrada o inactiva" }, { status: 404 });
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof QuoteInputError) return NextResponse.json({ error: error.message }, { status: error.status });
      console.error("[templates:insert]", error);
      return NextResponse.json({ error: "No se pudo aplicar la plantilla. Puedes reintentar la misma solicitud." }, { status: 500 });
    }
  }

  // Actualizar metadata
  const parsed = updatePackageMetaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const rateLimit = enforceRateLimit(`packages:update:${tenant.id}:${packageId}:${identity}`, 20, 60_000);
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

  const updated = await updatePackageMetaForTenant(tenant.id, packageId, parsed.data);
  if (!updated) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json({ package: updated });
}
