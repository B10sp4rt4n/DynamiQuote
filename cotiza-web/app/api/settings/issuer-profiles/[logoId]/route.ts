import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { setDefaultIssuerProfileByTenant } from "@/lib/db/settings";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

type RouteContext = { params: Promise<{ logoId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const identity = getRequestIdentity(request, tenant.id);
  const rl = enforceRateLimit(`settings:issuer:${tenant.id}:${identity}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString() }, status: 429 },
    );
  }

  const { logoId } = await context.params;
  const updated = await setDefaultIssuerProfileByTenant(tenant.id, logoId);
  if (!updated) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  return NextResponse.json({ profile: updated });
}
