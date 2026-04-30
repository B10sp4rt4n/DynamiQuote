import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getIssuerProfilesByTenant } from "@/lib/db/settings";

export async function GET() {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const profiles = await getIssuerProfilesByTenant(tenant.id);
  return NextResponse.json({ profiles });
}
