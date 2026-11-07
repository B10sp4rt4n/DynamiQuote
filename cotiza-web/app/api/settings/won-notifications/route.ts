import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getWonPolicy, saveWonPolicy, wonPolicyUsers } from "@/lib/db/won-notifications";
import { deliveryFlags } from "@/lib/notifications/won-message";
import { wonPolicySchema } from "@/lib/notifications/won";
import { enforceRateLimit } from "@/lib/utils/rate-limit";
async function context() {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!tenant.isSuperAdmin && !["owner", "admin"].includes(tenant.userRole)) return NextResponse.json({ error: "Solo administración puede configurar avisos" }, { status: 403 });
  if (process.env.COTIZA_WON_EVENT_PILOT !== "true") return NextResponse.json({ error: "Piloto todavía no habilitado" }, { status: 503 });
  return tenant;
}
export async function GET() {
  const tenant = await context(); if (tenant instanceof NextResponse) return tenant;
  const [policy, users] = await Promise.all([getWonPolicy(tenant.id), wonPolicyUsers(tenant.id)]);
  return NextResponse.json({ policy, users, mode: deliveryFlags().email || deliveryFlags().inApp ? "channels_enabled" : "dry_run", channels: deliveryFlags() }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PUT(request: Request) {
  const tenant = await context(); if (tenant instanceof NextResponse) return tenant;
  const limit = enforceRateLimit(`won-policy:${tenant.id}:${tenant.userId}`, 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Intenta en un momento" }, { status: 429 });
  const parsed = wonPolicySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Configuración inválida" }, { status: 422 });
  try { return NextResponse.json({ policy: await saveWonPolicy(tenant.id, tenant.userId!, parsed.data), mode: deliveryFlags().email || deliveryFlags().inApp ? "channels_enabled" : "dry_run", channels: deliveryFlags() }); }
  catch { return NextResponse.json({ error: "No se pudo guardar. Verifica los usuarios seleccionados." }, { status: 409 }); }
}
