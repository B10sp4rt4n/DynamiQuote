import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
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
  isTenantPrimaryAdmin: boolean;
  subtenantKey: string | null;
  userRole: AppUserRole;
  userDisplayName: string | null;
  userId: string | null;
};

type ResolvedTenant = {
  id: string;
  name: string;
  slug: string;
};

type TenantClaims = {
  email?: string | null;
  first_name?: string | null;
  name?: string | null;
  last_name?: string | null;
};

const TENANT_OVERRIDE_COOKIE = "tenant_override_slug";
const DEV_CLERK_SESSION_COOKIE = "dev_clerk_client_session";
const DEV_CLERK_USER_ID_COOKIE = "dev_clerk_user_id";
const SUPER_ADMIN_ROLES = new Set<string>(["superadmin", "super_admin", "platform_admin", "root"]);
const TENANT_ADMIN_ROLES = new Set<string>(["owner", "admin"]);

async function resolveBootstrapTenantContext(
  tenantOverrideSlug: string | null,
): Promise<TenantContext | null> {
  const tenant =
    (tenantOverrideSlug
      ? await resolveTenantByReference({ tenantId: null, tenantSlug: tenantOverrideSlug })
      : null) ?? (await getBootstrapTenant());

  return tenant
    ? {
        accessScope: "tenant",
        ...tenant,
        authMode: "bootstrap",
        isSuperAdmin: false,
        isTenantPrimaryAdmin: false,
        subtenantKey: null,
        userRole: "user",
        userDisplayName: null,
        userId: null,
      }
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractUserDisplayName(claims: unknown): string | null {
  const typedClaims = (claims ?? {}) as TenantClaims;

  const first = readString(typedClaims.first_name);
  const last = readString(typedClaims.last_name);
  const fromParts = [first, last].filter(Boolean).join(" ").trim();

  return (
    readString(typedClaims.name) ??
    (fromParts.length > 0 ? fromParts : null) ??
    readString(typedClaims.email)
  );
}

function looksLikeOpaqueId(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return /^(ser|user|sess|org)_[A-Za-z0-9]+$/.test(value.trim());
}

function normalizeRole(value: string | null | undefined): AppUserRole {
  const role = value?.trim().toLowerCase();

  if (role && SUPER_ADMIN_ROLES.has(role)) {
    return "superadmin";
  }

  if (role === "owner") {
    return "owner";
  }

  if (role === "admin") {
    return "admin";
  }

  return "user";
}

async function resolveTenantByReference(reference: {
  tenantId: string | null;
  tenantSlug: string | null;
}): Promise<ResolvedTenant | null> {
  if (reference.tenantId) {
    const tenant = await prisma.tenant.findFirst({
      where: {
        active: true,
        tenant_id: reference.tenantId,
      },
      select: {
        tenant_id: true,
        name: true,
        slug: true,
      },
    });

    return tenant
      ? {
          id: tenant.tenant_id,
          name: tenant.name,
          slug: tenant.slug,
        }
      : null;
  }

  if (reference.tenantSlug) {
    const tenant = await prisma.tenant.findFirst({
      where: {
        active: true,
        slug: reference.tenantSlug,
      },
      select: {
        tenant_id: true,
        name: true,
        slug: true,
      },
    });

    return tenant
      ? {
          id: tenant.tenant_id,
          name: tenant.name,
          slug: tenant.slug,
        }
      : null;
  }

  return null;
}

export async function getCurrentTenantContext(): Promise<TenantContext | null> {
  const cookieStore = await cookies();
  const tenantOverrideSlug = readString(cookieStore.get(TENANT_OVERRIDE_COOKIE)?.value);

  // An incomplete auth configuration must never grant anonymous access in a deployment.
  if (!hasClerkCredentials()) {
    return process.env.NODE_ENV === "development"
      ? resolveBootstrapTenantContext(tenantOverrideSlug)
      : null;
  }

  const session = await auth();
  const hasDevClientSession =
    process.env.NODE_ENV === "development" &&
    cookieStore.get(DEV_CLERK_SESSION_COOKIE)?.value === "1";
  const userId = session.userId ??
    (hasDevClientSession ? readString(cookieStore.get(DEV_CLERK_USER_ID_COOKIE)?.value) : null);

  if (!userId) {
    return null;
  }

  // Clerk's immutable user ID is the only identity link. Invitations/webhooks
  // establish that link; request-time name/alias matching must not relink users.
  const appUser = await prisma.app_users.findUnique({
    select: {
      alias: true,
      first_name: true,
      last_name: true,
      role: true,
      tenant_id: true,
      user_id: true,
      active: true,
    },
    where: { user_id: userId },
  });

  if (!appUser?.active || appUser.user_id !== userId) {
    return null;
  }

  const userRole = normalizeRole(appUser.role);
  const isSuperAdmin = userRole === "superadmin";

  // Tenant membership and role come exclusively from the active local record.
  if (!isSuperAdmin && !appUser.tenant_id) {
    return null;
  }

  const tenant = isSuperAdmin && tenantOverrideSlug
    ? await resolveTenantByReference({ tenantId: null, tenantSlug: tenantOverrideSlug })
    : appUser.tenant_id
      ? await resolveTenantByReference({ tenantId: appUser.tenant_id, tenantSlug: null })
      : isSuperAdmin
        ? await getBootstrapTenant()
        : null;

  if (!tenant) {
    return null;
  }

  const appUserDisplayName = [appUser.first_name, appUser.last_name]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();
  let userDisplayName = appUserDisplayName || readString(appUser.alias) ||
    extractUserDisplayName(session.sessionClaims);

  if (!userDisplayName || looksLikeOpaqueId(userDisplayName)) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(userId);
      userDisplayName = [clerkUser.firstName, clerkUser.lastName]
        .filter(Boolean).join(" ").trim() || null;
    } catch {
      // Display enrichment is optional and cannot change identity or authorization.
    }
  }

  if (looksLikeOpaqueId(userDisplayName)) {
    userDisplayName = null;
  }

  const primaryAdmin = TENANT_ADMIN_ROLES.has(userRole)
    ? await prisma.app_users.findFirst({
        orderBy: [{ created_at: "asc" }],
        select: { user_id: true },
        where: {
          active: true,
          role: { in: ["owner", "admin"] },
          tenant_id: tenant.id,
        },
      })
    : null;

  return {
    accessScope: isSuperAdmin ? "global" : "subtenant",
    authMode: "clerk",
    id: tenant.id,
    isSuperAdmin,
    isTenantPrimaryAdmin: Boolean(primaryAdmin?.user_id === appUser.user_id),
    name: tenant.name,
    slug: tenant.slug,
    subtenantKey: isSuperAdmin ? `superadmin:${userId}` : `${tenant.id}:${userId}`,
    userRole,
    userDisplayName,
    userId,
  };
}
