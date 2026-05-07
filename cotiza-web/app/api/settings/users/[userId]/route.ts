import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { toggleAppUserActivationByTenant } from "@/lib/db/settings";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!tenant.isSuperAdmin && !tenant.isTenantPrimaryAdmin) {
    return NextResponse.json({ error: "No tienes permisos para gestionar usuarios" }, { status: 403 });
  }

  const identity = getRequestIdentity(request, tenant.id);
  const rl = enforceRateLimit(`settings:users:${tenant.id}:${identity}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString() }, status: 429 },
    );
  }

  const { userId } = await context.params;

  if (tenant.userId && tenant.userId === userId) {
    return NextResponse.json({ error: "No puedes desactivar tu propio usuario" }, { status: 422 });
  }

  const updated = await toggleAppUserActivationByTenant(tenant.isSuperAdmin ? null : tenant.id, userId);
  if (!updated) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  return NextResponse.json({ user: updated });
}
