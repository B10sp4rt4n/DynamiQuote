import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getIssuerProfilesByTenant } from "@/lib/db/settings";

export async function GET(request: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const requestedType = searchParams.get("type");
  const logoType = requestedType === "issuer" || requestedType === "client" ? requestedType : undefined;

  const profiles = await getIssuerProfilesByTenant(tenant.id, logoType);
  return NextResponse.json({ profiles });
}
