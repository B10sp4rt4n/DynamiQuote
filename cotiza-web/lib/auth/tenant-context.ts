import "server-only";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { hasClerkCredentials } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";
import { getBootstrapTenant, type BootstrapTenant } from "@/lib/db/tenants";

type AppUserRole = "superadmin" | "owner" | "admin" | "user";
type AccessScope = "global" | "tenant" | "subtenant";

export type TenantContext = BootstrapTenant & {
  accessScope: AccessScope;
  authMode: "bootstrap" | "clerk";
  isSuperAdmin: boolean;
  subtenantKey: string | null;
  userRole: AppUserRole;
  userDisplayName: string | null;
  userId: string | null;
};

const SUPER_ADMIN_ROLES = new Set(["superadmin", "super_admin", "platform_admin", "root"]);

function normalizeRole(value: string): AppUserRole {
  const role = value.trim().toLowerCase();
  if (SUPER_ADMIN_ROLES.has(role)) return "superadmin";
  return role === "owner" || role === "admin" ? role : "user";
}

// Clerk proves identity. The exact, active app_users row grants membership
// and role. Claims, unsafeMetadata, names and email aliases grant no access.
export async function getCurrentTenantContext(): Promise<TenantContext | null> {
  const store = await cookies();
  const override = store.get("tenant_override_slug")?.value.trim() || null;

  if (!hasClerkCredentials()) {
    // An absent secret must never turn a deployed app into an anonymous owner.
    if (process.env.NODE_ENV !== "development" || process.env.ALLOW_BOOTSTRAP_AUTH !== "true") return null;
    const bootstrap = await getBootstrapTenant();
    if (!bootstrap) return null;
    const active = await prisma.tenant.findFirst({ where: { tenant_id: bootstrap.id, active: true } });
    if (!active) return null;
    return {
      ...bootstrap, accessScope: "tenant", authMode: "bootstrap", isSuperAdmin: false,
      subtenantKey: null, userRole: "owner", userDisplayName: "Bootstrap Admin",
      userId: `bootstrap:${bootstrap.id}`,
    };
  }

  const session = await auth();
  // Explicitly opt-in local browser harness. Disabled in production/previews.
  const devUserId = process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_COOKIE_AUTH === "true" &&
    store.get("dev_clerk_client_session")?.value === "1"
    ? store.get("dev_clerk_user_id")?.value : null;
  const userId = session.userId || devUserId;
  if (!userId) return null;

  const user = await prisma.app_users.findUnique({
    where: { user_id: userId },
    select: { user_id: true, active: true, alias: true, first_name: true, last_name: true, role: true, tenant_id: true },
  });
  if (!user?.active) return null;

  const userRole = normalizeRole(user.role);
  const isSuperAdmin = userRole === "superadmin";
  // Non-superadmins cannot override even in development. No bootstrap or
  // session-claim fallback for an absent/inactive membership.
  const reference = isSuperAdmin && override
    ? { slug: override } : user.tenant_id ? { tenant_id: user.tenant_id } : null;
  if (!reference) return null;
  const tenant = await prisma.tenant.findFirst({
    where: { ...reference, active: true },
    select: { tenant_id: true, name: true, slug: true },
  });
  if (!tenant) return null;

  return {
    id: tenant.tenant_id, name: tenant.name, slug: tenant.slug,
    accessScope: isSuperAdmin ? "global" : "subtenant", authMode: "clerk", isSuperAdmin,
    subtenantKey: isSuperAdmin ? `superadmin:${userId}` : `${tenant.tenant_id}:${userId}`,
    userRole, userId,
    userDisplayName: [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.alias,
  };
}
