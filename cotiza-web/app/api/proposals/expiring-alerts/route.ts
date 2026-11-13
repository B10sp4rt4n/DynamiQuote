import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getExpiringProposalsByTenant, getUnlabeledExpiredProposalsByTenant } from "@/lib/db/proposal-alerts";
import { getTenantProfileByTenant } from "@/lib/db/tenants";
import { getApprovalNotices } from "@/lib/db/won-consolidation";

export async function GET(request: Request) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (request.headers.get("X-Tenant-Context") && request.headers.get("X-Tenant-Context") !== tenant.id) return NextResponse.json({ error: "La empresa activa cambió. Recarga" }, { status: 409 });

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const profile = await getTenantProfileByTenant(tenant.id);
  const daysAhead = profile?.expiryAlertDaysBefore ?? 3;

  const [alerts, unlabeled, approvalResult] = await Promise.all([
    getExpiringProposalsByTenant(tenant.id, daysAhead, tenant.userId, canSeeAll),
    getUnlabeledExpiredProposalsByTenant(tenant.id, tenant.userId, canSeeAll),
    tenant.userId && tenant.authMode === "clerk" ? getApprovalNotices(tenant.id, { ...tenant, userId: tenant.userId })
      .then(approvalNotices => ({ approvalNotices, approvalError: null }))
      .catch(() => ({ approvalNotices: [], approvalError: "No se pudieron consultar las solicitudes de aprobación. Intenta actualizar las notificaciones." }))
      : Promise.resolve({ approvalNotices: [], approvalError: null }),
  ]);

  return NextResponse.json({ alerts, daysAhead, unlabeled, tenantId: tenant.id, ...approvalResult }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
