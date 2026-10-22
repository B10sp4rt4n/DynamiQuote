import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { setTenantCapability, THREATDOWN_PDF_IMPORT } from "@/lib/db/tenant-capabilities";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

const schema = z.object({ capabilityKey: z.literal(THREATDOWN_PDF_IMPORT), enabled: z.boolean() }).strict();

export async function PATCH(request: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!tenant.isSuperAdmin) return NextResponse.json({ error: "Solo superadmin puede habilitar capacidades por tenant" }, { status: 403 });
  const rate = enforceRateLimit(`tenant-capabilities:${getRequestIdentity(request, tenant.userId)}`, 30, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Espera un momento antes de volver a intentar." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Capacidad o estado inválido" }, { status: 422 });
  // The tenant and actor always come from the authenticated session, never from the payload.
  const enabled = await setTenantCapability({ tenantId: tenant.id, ...parsed.data,
    actor: { userId: tenant.userId, isSuperAdmin: tenant.isSuperAdmin } });
  if (enabled === null) return NextResponse.json({ error: "Tenant no disponible" }, { status: 404 });
  return NextResponse.json({ capabilityKey: parsed.data.capabilityKey, enabled });
}
