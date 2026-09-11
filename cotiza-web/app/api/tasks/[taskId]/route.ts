import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { completeTaskByTenant } from "@/lib/db/tasks";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { taskId } = await context.params;
  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`task:complete:${tenant.id}:${taskId}:${identity}`, 30, 60_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes, intenta en breve" },
      {
        headers: { "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString() },
        status: 429,
      },
    );
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const result = await completeTaskByTenant(tenant.id, taskId, tenant.userId, canSeeAll);

  if (result === "not_found") {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  if (result === "forbidden") {
    return NextResponse.json({ error: "No tienes permiso para completar esta tarea" }, { status: 403 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
