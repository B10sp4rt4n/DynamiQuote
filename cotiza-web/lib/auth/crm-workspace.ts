import "server-only";

import type { TenantContext } from "./tenant-context";
import { prisma } from "@/lib/db/prisma";
import { isTenantCapabilityEnabled } from "@/lib/db/tenant-capabilities";

const SUPERADMIN_ROLES = new Set(["superadmin", "super_admin", "platform_admin", "root"]);

/** Shared by navigation and the page. Never grants permissions to other routes. */
export async function getCrmWorkspaceAccess(tenant: TenantContext | null) {
  if (!tenant?.userId || tenant.authMode !== "clerk") return null;

  // Require an active, exact Clerk linkage; claims or bootstrap alone cannot
  // open the pilot. Superadmin can use only the tenant selected in the session.
  const user = await prisma.app_users.findFirst({
    where: { user_id: tenant.userId, active: true },
    select: { role: true, tenant_id: true },
  });
  if (!user) return null;
  const canSeeAll = tenant.isSuperAdmin && SUPERADMIN_ROLES.has(user.role.trim().toLowerCase());
  if (!canSeeAll && user.tenant_id !== tenant.id) return null;
  if (!await isTenantCapabilityEnabled(tenant.id, "crm_workspace_pilot")) return null;

  return { userId: tenant.userId, canSeeAll };
}
