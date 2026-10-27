import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { prisma } from "@/lib/db/prisma";
import { getOpportunityIntake } from "@/lib/db/opportunity-intake";
export async function GET(_: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const canSeeAll = tenant.isSuperAdmin || ["owner", "admin"].includes(tenant.userRole);
  const quote = await prisma.quote.findFirst({ where: { tenantId: tenant.id, quote_id: (await params).quoteId,
    ...(canSeeAll ? {} : { created_by_user_id: tenant.userId }) }, select: { opportunity_id: true } });
  if (!quote) return NextResponse.json({ error: "Cotización no disponible" }, { status: 404 });
  const opportunity = quote.opportunity_id ? await getOpportunityIntake(tenant.id, quote.opportunity_id, { userId: tenant.userId, canSeeAll }) : null;
  return NextResponse.json({ opportunity });
}
