import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getOpportunityIntake, saveOpportunityIntake } from "@/lib/db/opportunity-intake";
import { opportunityIntakeSchema } from "@/lib/domain/opportunity-intake";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
type Context = { params: Promise<{ opportunityId: string }> };
export async function GET(_: Request, { params }: Context) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const viewer = { userId: tenant.userId, canSeeAll: tenant.isSuperAdmin || ["owner", "admin"].includes(tenant.userRole) };
  const opportunity = await getOpportunityIntake(tenant.id, (await params).opportunityId, viewer);
  return NextResponse.json(opportunity ? { opportunity } : { error: "Oportunidad no disponible" }, { status: opportunity ? 200 : 404 });
}
export async function PATCH(request: Request, { params }: Context) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!enforceRateLimit(`intake:${tenant.id}:${getRequestIdentity(request, tenant.userId)}`, 30, 60000).allowed)
    return NextResponse.json({ error: "Intenta en un momento" }, { status: 429 });
  const input = opportunityIntakeSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Revisa los campos de la oportunidad" }, { status: 422 });
  const viewer = { userId: tenant.userId, canSeeAll: tenant.isSuperAdmin || ["owner", "admin"].includes(tenant.userRole) };
  const id = (await params).opportunityId;
  const result = await saveOpportunityIntake(tenant.id, id, viewer, input.data);
  if (result !== "updated") return NextResponse.json({ error: result === "conflict" ? "La oportunidad cambió. Recarga antes de guardar." : "Oportunidad no disponible" }, { status: result === "conflict" ? 409 : 404 });
  return NextResponse.json({ opportunity: await getOpportunityIntake(tenant.id, id, viewer) });
}
