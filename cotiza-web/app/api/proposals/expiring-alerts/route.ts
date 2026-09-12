import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getExpiringProposalsByTenant, getUnlabeledExpiredProposalsByTenant } from "@/lib/db/proposal-alerts";
import { getTenantProfileByTenant } from "@/lib/db/tenants";

export async function GET() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const profile = await getTenantProfileByTenant(tenant.id);
  const daysAhead = profile?.expiryAlertDaysBefore ?? 3;

  const [alerts, unlabeled] = await Promise.all([
    getExpiringProposalsByTenant(tenant.id, daysAhead, tenant.userId, canSeeAll),
    getUnlabeledExpiredProposalsByTenant(tenant.id, tenant.userId, canSeeAll),
  ]);

  return NextResponse.json({ alerts, daysAhead, unlabeled }, { status: 200 });
}
