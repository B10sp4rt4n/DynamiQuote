import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { dispositionSchema } from "@/lib/domain/opportunity-disposition";
import { setOpportunityDisposition } from "@/lib/db/opportunity-disposition";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
export async function PATCH(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!enforceRateLimit(`disposition:${tenant.id}:${getRequestIdentity(request, tenant.userId)}`, 30, 60000).allowed)
    return NextResponse.json({ error: "Intenta en un momento" }, { status: 429 });
  const parsed = dispositionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 422 });
  try {
    const result = await setOpportunityDisposition(tenant.id, (await params).opportunityId, {
      userId: tenant.userId, canSeeAll: tenant.isSuperAdmin || ["owner", "admin"].includes(tenant.userRole),
    }, parsed.data);
    if (result === "updated") return NextResponse.json({ ok: true });
    const messages = { invalid: "Revisa el motivo y la fecha", not_found: "Oportunidad no disponible",
      conflict: "La oportunidad cambió. Recarga antes de continuar", decided: "Ya existe una decisión en una propuesta. Revísala desde Propuestas",
      client_required: "Asocia un cliente antes de programar una pausa" };
    return NextResponse.json({ error: messages[result] }, { status: result === "not_found" ? 404 : 409 });
  } catch { return NextResponse.json({ error: "No se pudo guardar. Recarga y revisa el estado antes de reintentar" }, { status: 409 }); }
}
