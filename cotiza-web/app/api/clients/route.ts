import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { listClientsByTenant, createClientForTenant } from "@/lib/db/clients";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { createClientSchema } from "@/lib/validations/clients";

// GET /api/clients?search=... — lista clientes activos del tenant
export async function GET(request: Request) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;

  const clients = await listClientsByTenant(tenant.id, search);

  return NextResponse.json({ clients });
}

// POST /api/clients — crea un cliente para el tenant
export async function POST(request: Request) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`clients:create:${tenant.id}:${identity}`, 30, 60_000);

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

  const parsed = createClientSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const client = await createClientForTenant(tenant.id, parsed.data);

  return NextResponse.json({ client }, { status: 201 });
}
