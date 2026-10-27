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
