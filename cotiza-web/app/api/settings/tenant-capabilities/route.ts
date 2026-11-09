import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantConfigurationActor } from "@/lib/auth/tenant-configuration";
import { setTenantCapability } from "@/lib/db/tenant-capabilities";
import { TENANT_CAPABILITY_KEYS } from "@/lib/tenant-capabilities";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

const schema = z.object({ capabilityKey: z.enum(TENANT_CAPABILITY_KEYS), enabled: z.boolean() }).strict();

export async function PATCH(request: Request) {
  const access = await getTenantConfigurationActor();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { tenant, actor } = access;
  if (request.headers.get("X-Tenant-Context") !== tenant.id) {
    return NextResponse.json({ error: "La empresa activa cambió. Recarga la configuración." }, { status: 409 });
  }
  const rate = enforceRateLimit(`tenant-capabilities:${getRequestIdentity(request, actor.userId)}`, 30, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Espera un momento antes de volver a intentar." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Capacidad o estado inválido" }, { status: 422 });
  // The tenant and actor always come from the authenticated session, never from the payload.
  const enabled = await setTenantCapability({ tenantId: tenant.id, ...parsed.data,
    actor });
  if (enabled === null) return NextResponse.json({ error: "Tenant no disponible" }, { status: 404 });
  return NextResponse.json({ capabilityKey: parsed.data.capabilityKey, enabled });
}
