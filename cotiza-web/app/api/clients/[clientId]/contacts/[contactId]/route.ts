import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { deleteClientContactForTenant } from "@/lib/db/client-contacts";

type RouteContext = {
  params: Promise<{ contactId: string }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { contactId } = await context.params;
  const result = await deleteClientContactForTenant(tenant.id, contactId);

  if (result === "not_found") {
    return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
