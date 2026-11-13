import Link from "next/link";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getWinPolicy } from "@/lib/db/won-consolidation";
import { prisma } from "@/lib/db/prisma";
import { WinPolicyPanel } from "@/components/configuracion/win-policy-panel";
export const dynamic = "force-dynamic";
export default async function WinPolicyPage() {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId || tenant.authMode !== "clerk" || !(tenant.isSuperAdmin || tenant.userRole === "owner")) {
    return <p>Inicia sesión como owner o superadmin para configurar las reglas de esta empresa.</p>;
  }
  const [policy, users] = await Promise.all([getWinPolicy(tenant.id), prisma.app_users.findMany({ where: { tenant_id: tenant.id, active: true }, select: { user_id: true, first_name: true, last_name: true, role: true } })]);
  return <div className="space-y-4"><Link className="text-sm text-blue-800 underline" href="/configuracion">Volver a Configuración</Link>
    <WinPolicyPanel key={tenant.id} initial={policy} tenantId={tenant.id} tenantName={tenant.name} users={users.map(u => ({ userId: u.user_id, name: `${u.first_name} ${u.last_name}`.trim(), role: u.role }))} /></div>;
}
