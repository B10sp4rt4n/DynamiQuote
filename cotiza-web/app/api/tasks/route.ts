import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getClientByIdForTenant } from "@/lib/db/clients";
import { createTaskForTenant } from "@/lib/db/tasks";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { createTaskSchema } from "@/lib/validations/tasks";

export async function POST(request: Request) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`task:create:${tenant.id}:${identity}`, 30, 60_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes, intenta en breve" },
      {
        headers: { "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString() },
        status: 429,
      },
    );
  }

  const parsed = createTaskSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos" }, { status: 422 });
  }

  const client = await getClientByIdForTenant(parsed.data.clientId, tenant.id);

  if (!client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const taskId = await createTaskForTenant(tenant.id, {
    clientId: parsed.data.clientId,
    createdByUserId: tenant.userId,
    description: parsed.data.description,
    dueDate: parsed.data.dueDate,
    opportunityId: parsed.data.opportunityId,
  });

  return NextResponse.json({ taskId }, { status: 201 });
}
