import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getTenantProfileByTenant, updateTenantProfileByTenant } from "@/lib/db/tenants";
import { updateTenantProfileSchema } from "@/lib/validations/tenant-profile";

export async function GET() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const profile = await getTenantProfileByTenant(tenant.id);
  return NextResponse.json({ profile }, { status: 200 });
}

export async function PUT(request: Request) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!(tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin")) {
    return NextResponse.json({ error: "No tienes permisos para editar los datos fiscales del emisor" }, { status: 403 });
  }

  const parsed = updateTenantProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload invalido" }, { status: 422 });
  }

  const profile = await updateTenantProfileByTenant(tenant.id, parsed.data);

  if (!profile) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ profile }, { status: 200 });
}
