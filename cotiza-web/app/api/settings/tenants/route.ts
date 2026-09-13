import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { createTenant } from "@/lib/db/tenants";
import { createTenantSchema } from "@/lib/validations/tenants";

export async function POST(request: Request) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!tenant.isSuperAdmin) {
    return NextResponse.json({ error: "Solo superadmin puede dar de alta un tenant nuevo" }, { status: 403 });
  }

  const parsed = createTenantSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload invalido" }, { status: 422 });
  }

  const created = await createTenant(parsed.data);

  if (!created) {
    return NextResponse.json({ error: "Ya existe un tenant con ese slug" }, { status: 409 });
  }

  return NextResponse.json({ tenant: created }, { status: 201 });
}
