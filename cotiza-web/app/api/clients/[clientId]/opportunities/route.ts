import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getOpenOpportunitiesByClientForTenant } from "@/lib/db/tasks";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clientId } = await context.params;
  const opportunities = await getOpenOpportunitiesByClientForTenant(tenant.id, clientId);

  return NextResponse.json({ opportunities }, { status: 200 });
}
