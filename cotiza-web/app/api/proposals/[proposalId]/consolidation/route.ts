import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { actOnWin, getWinView, WinError } from "@/lib/db/won-consolidation";
import { winActionSchema } from "@/lib/domain/won-consolidation";
import { enforceRateLimit } from "@/lib/utils/rate-limit";
type Context = { params: Promise<{ proposalId: string }> };
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof WinError ? error.message : "No se pudo consultar o guardar el circuito. Recarga antes de continuar" },
    { status: error instanceof WinError ? error.status : 500 });
}
export async function GET(_request: Request, context: Context) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId || tenant.authMode !== "clerk") return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  try {
    return NextResponse.json(await getWinView(tenant.id, (await context.params).proposalId, { ...tenant, userId: tenant.userId }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId || tenant.authMode !== "clerk") return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  if (request.headers.get("X-Tenant-Context") !== tenant.id) return NextResponse.json({ error: "La empresa activa cambió. Recarga" }, { status: 409 });
  const limit = enforceRateLimit(`win:${tenant.id}:${tenant.userId}`, 30, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Demasiadas solicitudes. Intenta en breve" }, { status: 429 });
  const parsed = winActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Revisa los datos" }, { status: 422 });
  try {
    return NextResponse.json(await actOnWin(tenant.id, (await context.params).proposalId, { ...tenant, userId: tenant.userId }, parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
