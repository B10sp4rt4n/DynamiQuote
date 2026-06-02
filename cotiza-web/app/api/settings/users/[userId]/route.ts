import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { deleteManagedUserByTenant, toggleAppUserActivationByTenant, updateManagedUserByTenant } from "@/lib/db/settings";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { updateManagedUserSchema } from "@/lib/validations/users";

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const identity = getRequestIdentity(request, tenant.id);
  const rl = enforceRateLimit(`settings:users:${tenant.id}:${identity}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString() }, status: 429 },
    );
  }

  const { userId } = await context.params;

  const body = (await request.json().catch(() => null)) as unknown;

  if (body && typeof body === "object") {
    if (!tenant.isSuperAdmin) {
      return NextResponse.json({ error: "Solo superadmin puede editar usuarios" }, { status: 403 });
    }

    if (tenant.userId && tenant.userId === userId) {
      return NextResponse.json({ error: "No puedes editar tu propio usuario desde este panel" }, { status: 422 });
    }

    const parsed = updateManagedUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload invalido" }, { status: 422 });
    }

    try {
      const updated = await updateManagedUserByTenant({
        tenantId: null,
        userId,
        payload: parsed.data,
      });

      if (!updated) {
        return NextResponse.json({ error: "Usuario no encontrado o no editable" }, { status: 404 });
      }

      return NextResponse.json({ user: updated });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_TENANT") {
        return NextResponse.json({ error: "Tenant destino invalido" }, { status: 422 });
      }

      return NextResponse.json({ error: "No fue posible editar el usuario" }, { status: 409 });
    }
  }

  if (tenant.userId && tenant.userId === userId) {
    return NextResponse.json({ error: "No puedes desactivar tu propio usuario" }, { status: 422 });
  }

  const updated = await toggleAppUserActivationByTenant(tenant.isSuperAdmin ? null : tenant.id, userId);
  if (!updated) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  return NextResponse.json({ user: updated });
}

export async function DELETE(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!tenant.isSuperAdmin) {
    return NextResponse.json({ error: "Solo superadmin puede borrar usuarios" }, { status: 403 });
  }

  const identity = getRequestIdentity(request, tenant.id);
  const rl = enforceRateLimit(`settings:users:delete:${tenant.id}:${identity}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString() }, status: 429 },
    );
  }

  const { userId } = await context.params;

  if (tenant.userId && tenant.userId === userId) {
    return NextResponse.json({ error: "No puedes borrar tu propio usuario" }, { status: 422 });
  }

  const deleted = await deleteManagedUserByTenant(null, userId);
  if (!deleted) {
    return NextResponse.json({ error: "Usuario no encontrado o no editable" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true, userId });
}
