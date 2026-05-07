import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  createManagedUserByTenant,
  getAppUsersByTenant,
  getAppUsersForSuperAdmin,
} from "@/lib/db/settings";
import { createManagedUserSchema } from "@/lib/validations/users";

export async function GET() {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!tenant.isSuperAdmin && !tenant.isTenantPrimaryAdmin) {
    return NextResponse.json({ error: "No tienes permisos para gestionar usuarios" }, { status: 403 });
  }

  const users = tenant.isSuperAdmin
    ? await getAppUsersForSuperAdmin()
    : await getAppUsersByTenant(tenant.id);

  return NextResponse.json({
    canManageAllTenants: tenant.isSuperAdmin,
    users,
  });
}

export async function POST(request: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!tenant.isSuperAdmin && !tenant.isTenantPrimaryAdmin) {
    return NextResponse.json({ error: "No tienes permisos para gestionar usuarios" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = createManagedUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload invalido" }, { status: 422 });
  }

  const targetTenantId = tenant.isSuperAdmin
    ? parsed.data.tenantId ?? tenant.id
    : tenant.id;

  const created = await createManagedUserByTenant({
    payload: parsed.data,
    targetTenantId,
  });

  if (!created) {
    return NextResponse.json(
      { error: "No fue posible crear el usuario. Verifica tenant, alias y userId unicos." },
      { status: 409 },
    );
  }

  return NextResponse.json({ user: created }, { status: 201 });
}
