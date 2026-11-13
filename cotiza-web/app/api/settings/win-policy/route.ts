import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getWinPolicy, saveWinPolicy, WinError } from "@/lib/db/won-consolidation";
import { winPolicySchema } from "@/lib/domain/won-consolidation";
const schema = z.object({ policy: winPolicySchema, expectedRevision: z.number().int().nonnegative() }).strict();
export async function GET() {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId || tenant.authMode !== "clerk") return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  if (!(tenant.isSuperAdmin || tenant.userRole === "owner")) return NextResponse.json({ error: "Sólo owner o superadmin puede configurar las reglas" }, { status: 403 });
  return NextResponse.json({ policy: await getWinPolicy(tenant.id), tenantId: tenant.id }, { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(request: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId || tenant.authMode !== "clerk") return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  if (!(tenant.isSuperAdmin || tenant.userRole === "owner")) return NextResponse.json({ error: "Sólo owner o superadmin puede configurar las reglas" }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  if (request.headers.get("X-Tenant-Context") !== tenant.id) return NextResponse.json({ error: "La empresa activa cambió. Recarga" }, { status: 409 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Revisa los requisitos" }, { status: 422 });
  try {
    const policy = await saveWinPolicy(tenant.id, { ...tenant, userId: tenant.userId }, parsed.data.policy, parsed.data.expectedRevision);
    return NextResponse.json({ policy }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof WinError ? error.message : "No se guardó la política. Recarga antes de reintentar" }, { status: error instanceof WinError ? error.status : 500 }); }
}
