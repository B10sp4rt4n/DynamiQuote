import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { deleteInteractionLogForTenant } from "@/lib/db/interaction-logs";

type RouteContext = {
  params: Promise<{ interactionId: string }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { interactionId } = await context.params;
  const result = await deleteInteractionLogForTenant(tenant.id, interactionId);

  if (result === "not_found") {
    return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
