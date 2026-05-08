import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { hasClerkCredentials } from "@/lib/auth/clerk";
import {
  createManagedUserByTenant,
  getAppUsersByTenant,
  getAppUsersForSuperAdmin,
} from "@/lib/db/settings";
import { prisma } from "@/lib/db/prisma";
import { createManagedUserSchema } from "@/lib/validations/users";

export async function GET() {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

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

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = createManagedUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload invalido" }, { status: 422 });
  }

  const targetTenantId = parsed.data.tenantId ?? tenant.id;

  const targetTenant = await prisma.tenant.findFirst({
    select: {
      slug: true,
      tenant_id: true,
    },
    where: {
      active: true,
      tenant_id: targetTenantId,
    },
  });

  if (!targetTenant) {
    return NextResponse.json({ error: "Tenant destino invalido" }, { status: 422 });
  }

  // Si no se proporcionó userId, generar uno temporal (se sincronizará cuando el usuario entre por primera vez)
  const resolvedUserId = parsed.data.userId?.trim() || `pending_${crypto.randomUUID()}`;
  const assignedRole = parsed.data.role ?? "user";

  let clerkSynced = false;

  if (hasClerkCredentials() && parsed.data.userId) {
    try {
      const client = await clerkClient();
      await client.users.getUser(parsed.data.userId);
      await client.users.updateUserMetadata(parsed.data.userId, {
        publicMetadata: {
          role: assignedRole,
          subtenantKey: `${targetTenant.tenant_id}:${parsed.data.userId}`,
          tenantId: targetTenant.tenant_id,
          tenantSlug: targetTenant.slug,
        },
      });
      clerkSynced = true;
    } catch {
      // userId no existe en Clerk — se guarda igual, se sincronizará después
      clerkSynced = false;
    }
  }

  const created = await createManagedUserByTenant({
    payload: { ...parsed.data, userId: resolvedUserId, role: assignedRole },
    targetTenantId,
  });

  if (!created) {
    return NextResponse.json(
      { error: "No fue posible crear el usuario. Verifica tenant, alias y userId unicos." },
      { status: 409 },
    );
  }

  return NextResponse.json({ clerkSynced, user: created }, { status: 201 });
}
