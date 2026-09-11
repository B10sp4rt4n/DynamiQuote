import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getClientByIdForTenant } from "@/lib/db/clients";
import { createInteractionLogForTenant, listInteractionLogsForTenant } from "@/lib/db/interaction-logs";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { createInteractionLogSchema } from "@/lib/validations/interaction-logs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clientId } = await context.params;
  const interactions = await listInteractionLogsForTenant(tenant.id, clientId);

  return NextResponse.json({ interactions }, { status: 200 });
}

export async function POST(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clientId } = await context.params;
  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`interaction-log:create:${tenant.id}:${identity}`, 30, 60_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes, intenta en breve" },
      {
        headers: { "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString() },
        status: 429,
      },
    );
  }

  const parsed = createInteractionLogSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos" }, { status: 422 });
  }

  const client = await getClientByIdForTenant(clientId, tenant.id);

  if (!client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const interaction = await createInteractionLogForTenant(tenant.id, clientId, {
    createdByUserId: tenant.userId,
    note: parsed.data.note,
    opportunityId: parsed.data.opportunityId,
  });

  return NextResponse.json({ interaction }, { status: 201 });
}
