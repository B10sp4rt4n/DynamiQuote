import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantConfigurationActor } from "@/lib/auth/tenant-configuration";
import { setTenantOperationMode } from "@/lib/db/tenant-operation";
import { OPERATION_MODES } from "@/lib/tenant-operation";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

const schema = z.object({ mode: z.enum(OPERATION_MODES) }).strict();

export async function PATCH(request: Request) {
  const access = await getTenantConfigurationActor();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { tenant, actor } = access;
  if (request.headers.get("X-Tenant-Context") !== tenant.id) {
    return NextResponse.json({ error: "La empresa activa cambió. Recarga la configuración." }, { status: 409 });
  }
  const rate = enforceRateLimit(`tenant-operation:${getRequestIdentity(request, actor.userId)}`, 30, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Espera un momento antes de volver a intentar." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Modalidad inválida" }, { status: 422 });
  const mode = await setTenantOperationMode({ tenantId: tenant.id, mode: parsed.data.mode, actor });
  if (mode === null) return NextResponse.json({ error: "Empresa no disponible" }, { status: 404 });
  return NextResponse.json({ mode }, { headers: { "Cache-Control": "no-store" } });
}
