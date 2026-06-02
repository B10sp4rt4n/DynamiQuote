import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getMarginPolicyByTenant, upsertMarginPolicyByTenant } from "@/lib/db/margin-policies";
import { marginPolicyInputSchema } from "@/lib/validations/margin-policy";

export async function GET() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const policy = await getMarginPolicyByTenant(tenant.id);
  return NextResponse.json({ policy }, { status: 200 });
}

export async function PUT(request: Request) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!(tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin")) {
    return NextResponse.json({ error: "No tienes permisos para configurar la politica de margen" }, { status: 403 });
  }

  const parsed = marginPolicyInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload invalido" }, { status: 422 });
  }

  const policy = await upsertMarginPolicyByTenant({
    actorUserId: tenant.userId,
    payload: parsed.data,
    tenantId: tenant.id,
  });

  return NextResponse.json({ policy }, { status: 200 });
}