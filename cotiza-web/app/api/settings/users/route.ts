import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getAppUsersByTenant } from "@/lib/db/settings";

export async function GET() {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const users = await getAppUsersByTenant(tenant.id);
  return NextResponse.json({ users });
}
