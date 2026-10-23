import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { deleteInteractionLogForTenant } from "@/lib/db/interaction-logs";

type RouteContext = {
  params: Promise<{ clientId: string; interactionId: string }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clientId, interactionId } = await context.params;
  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const result = await deleteInteractionLogForTenant(tenant.id, interactionId, tenant.userId, canSeeAll, clientId);
  if (result === "forbidden") return NextResponse.json({ error: "Sin permiso para eliminar esta nota" }, { status: 403 });

  if (result === "not_found") {
    return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
