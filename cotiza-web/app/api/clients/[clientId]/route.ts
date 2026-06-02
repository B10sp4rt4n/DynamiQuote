import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { updateClientForTenant } from "@/lib/db/clients";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { updateClientSchema } from "@/lib/validations/clients";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

// PATCH /api/clients/[clientId] — actualiza un cliente del tenant
export async function PATCH(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clientId } = await context.params;

  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`clients:update:${tenant.id}:${clientId}:${identity}`, 30, 60_000);

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

  const parsed = updateClientSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const client = await updateClientForTenant(clientId, tenant.id, parsed.data);

  if (!client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ client });
}
