import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  createPackageForTenant,
  getPackagesSummaryByTenant,
} from "@/lib/db/packages";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { createPackageSchema } from "@/lib/validations/packages";
import { QuoteInputError } from "@/lib/domain/quote-input";

export async function GET(_req: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rateLimit = enforceRateLimit(`packages:list:${tenant.id}`, 60, 60_000);
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

  const packages = await getPackagesSummaryByTenant(tenant.id);
  return NextResponse.json({ packages });
}

export async function POST(req: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const identity = getRequestIdentity(req, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`packages:create:${tenant.id}:${identity}`, 20, 60_000);
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

  const body: unknown = await req.json().catch(() => null);
  const parsed = createPackageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const pkg = await createPackageForTenant(tenant.id, { ...parsed.data, createdBy: tenant.userId ?? undefined });
    return NextResponse.json({ package: pkg }, { status: 201 });
  } catch (error) {
    if (error instanceof QuoteInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[templates:create]", error);
    return NextResponse.json({ error: "No se pudo crear la plantilla" }, { status: 500 });
  }
}
