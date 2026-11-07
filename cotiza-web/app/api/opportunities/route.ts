import { declarationSchema } from "@/lib/domain/opportunity-declaration";
import { DeclarationError, declareOpportunity } from "@/lib/db/declare-opportunity";
import { enforceRateLimit } from "@/lib/utils/rate-limit";
import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getOpportunityPipelineByTenant } from "@/lib/db/opportunities";
export async function GET(request: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const clientId = new URL(request.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ opportunities: [] });
  const canSeeAll = tenant.isSuperAdmin || ["owner", "admin"].includes(tenant.userRole);
  const rows = await getOpportunityPipelineByTenant(tenant.id, tenant.userId, canSeeAll);
  return NextResponse.json({ opportunities: rows.filter(row => row.clientId === clientId && row.stage === "open" && (canSeeAll || row.ownerUserId === tenant.userId))
    .map(({ opportunityId, opportunityNumber, title }) => ({ opportunityId, opportunityNumber, title })) });
}

export async function POST(request: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const limit = enforceRateLimit(`opportunities:create:${tenant.id}:${tenant.userId}`, 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Demasiadas operaciones. Intenta en un momento." }, { status: 429 });
  const parsed = declarationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Selecciona un cliente y escribe el nombre del negocio." }, { status: 422 });
  try { return NextResponse.json({ opportunity: await declareOpportunity(tenant.id, tenant.userId, parsed.data) }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof DeclarationError ? error.message : "No se pudo confirmar el alta. Reintenta con los mismos datos." }, { status: error instanceof DeclarationError ? error.status : 409 }); }
}
