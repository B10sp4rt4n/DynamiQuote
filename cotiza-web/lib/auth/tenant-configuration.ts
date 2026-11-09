import "server-only";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { prisma } from "@/lib/db/prisma";

/** Configuration grants require an active, authoritative platform administrator. */
export async function getTenantConfigurationActor() {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId || tenant.authMode !== "clerk") return { error: "No autorizado", status: 401 } as const;
  if (!tenant.isSuperAdmin) return { error: "Solo superadmin puede configurar capacidades por empresa", status: 403 } as const;
  const member = await prisma.app_users.findFirst({
    where: { user_id: tenant.userId, active: true }, select: { role: true },
  });
  if (!member || !["superadmin", "super_admin", "platform_admin", "root"].includes(member.role)) {
    return { error: "Se requiere un superadmin activo", status: 403 } as const;
  }
  return { tenant, actor: { userId: tenant.userId, isSuperAdmin: true } } as const;
}
