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

type ClerkClaimRecord = Record<string, unknown>;

type TenantClaims = {
  email?: string | null;
  first_name?: string | null;
  metadata?: ClerkClaimRecord;
  name?: string | null;
  publicMetadata?: ClerkClaimRecord;
  last_name?: string | null;
  unsafeMetadata?: ClerkClaimRecord;
  org_slug?: string | null;
};

const TENANT_OVERRIDE_COOKIE = "tenant_override_slug";
const SUPER_ADMIN_ROLES = new Set<string>(["superadmin", "super_admin", "platform_admin", "root"]);
const TENANT_ADMIN_ROLES = new Set<string>(["owner", "admin"]);

function normalizeIdentityToken(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function namesLookEquivalent(a: string | null, b: string | null): boolean {
  const left = normalizeIdentityToken(a);
  const right = normalizeIdentityToken(b);

  if (!left || !right) {
    return false;
  }

  return left === right || left.startsWith(right) || right.startsWith(left);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractTenantReference(claims: unknown): { tenantId: string | null; tenantSlug: string | null } {
  const typedClaims = (claims ?? {}) as TenantClaims;

  return {
    tenantId:
      readString(typedClaims.metadata?.tenantId) ??
      readString(typedClaims.publicMetadata?.tenantId) ??
      readString(typedClaims.unsafeMetadata?.tenantId),
    tenantSlug:
      readString(typedClaims.metadata?.tenantSlug) ??
      readString(typedClaims.publicMetadata?.tenantSlug) ??
      readString(typedClaims.unsafeMetadata?.tenantSlug) ??
      readString(typedClaims.org_slug),
  };
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

function extractUserIdentity(claims: unknown): {
  emailAlias: string | null;
  firstName: string | null;
  lastName: string | null;
} {
  const typedClaims = (claims ?? {}) as TenantClaims;
  const email = readString(typedClaims.email)?.toLowerCase() ?? null;
  const emailAlias = email?.split("@")[0] ?? null;

  return {
    emailAlias,
    firstName: readString(typedClaims.first_name),
    lastName: readString(typedClaims.last_name),
  };
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

function extractRoleFromClaims(claims: unknown): AppUserRole {
  const typedClaims = (claims ?? {}) as TenantClaims;
  const role =
    readString(typedClaims.metadata?.role) ??
    readString(typedClaims.publicMetadata?.role) ??
    readString(typedClaims.unsafeMetadata?.role);

  return normalizeRole(role);
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

  if (!hasClerkCredentials()) {
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

  const { sessionClaims, userId } = await auth();

  if (!userId) {
    return null;
  }

  const { tenantId, tenantSlug } = extractTenantReference(sessionClaims);
  const claimDisplayName = extractUserDisplayName(sessionClaims);
  let identity = extractUserIdentity(sessionClaims);

  if (!identity.emailAlias || !identity.firstName || !identity.lastName) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(userId);
      const primaryEmail = clerkUser.emailAddresses.find(
        (item) => item.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress;
      const emailAlias = primaryEmail?.split("@")[0]?.trim().toLowerCase() ?? null;

      identity = {
        emailAlias: identity.emailAlias ?? emailAlias,
        firstName: identity.firstName ?? readString(clerkUser.firstName),
        lastName: identity.lastName ?? readString(clerkUser.lastName),
      };
    } catch {
      // Si Clerk no responde, seguimos con claims para no romper autenticacion.
    }
  }

  let appUser = await prisma.app_users.findUnique({
    select: {
      alias: true,
      first_name: true,
      last_name: true,
      role: true,
      tenant_id: true,
      user_id: true,
      active: true,
    },
    where: {
      user_id: userId,
    },
  });

  // Fallback: search by alias or name if direct user_id lookup failed
  const fallbackCandidates =
    appUser || (!identity.emailAlias && !(identity.firstName && identity.lastName))
      ? []
      : await prisma.app_users.findMany({
          select: {
            active: true,
            alias: true,
            first_name: true,
            last_name: true,
            role: true,
            tenant_id: true,
            user_id: true,
          },
          where: {
            active: true,
            OR: [
              identity.emailAlias
                ? {
                    alias: identity.emailAlias,
                  }
                : undefined,
              identity.firstName && identity.lastName
                ? {
                    first_name: identity.firstName,
                    last_name: identity.lastName,
                  }
                : undefined,
            ].filter((value): value is NonNullable<typeof value> => Boolean(value)),
          },
        });

  if (!appUser && fallbackCandidates.length > 0) {
    const roleWeight = (role: string): number => {
      const normalized = normalizeRole(role);
      if (normalized === "superadmin") return 100;
      if (normalized === "owner") return 80;
      if (normalized === "admin") return 60;
      return 20;
    };

    // Si hay tenantId en claims, preferir ese tenant
    let candidates = [...fallbackCandidates];
    if (tenantId) {
      const tenantMatches = candidates.filter((c) => c.tenant_id === tenantId);
      if (tenantMatches.length > 0) {
        candidates = tenantMatches;
      }
    }

    const sorted = candidates.sort((a, b) => roleWeight(b.role) - roleWeight(a.role));
    appUser = sorted[0] ?? null;
      // Sync Clerk userId to app_users if matched via fallback
      if (appUser && appUser.user_id !== userId) {
        try {
          await prisma.app_users.update({
            where: { user_id: appUser.user_id },
            data: { user_id: userId },
          });
          // Update local appUser record to reflect the change
          appUser.user_id = userId;
        } catch {
          // If update fails, continue with current user_id to avoid breaking auth
        }
      }
  }

    if (!appUser) {
      const superAdminCandidates = await prisma.app_users.findMany({
        select: {
          active: true,
          alias: true,
          first_name: true,
          last_name: true,
          role: true,
          tenant_id: true,
          user_id: true,
        },
        where: {
          active: true,
          role: {
            in: ["superadmin", "super_admin", "platform_admin", "root"],
          },
        },
      });

      const identityAlias = normalizeIdentityToken(identity.emailAlias);
      const identityFirst = normalizeIdentityToken(identity.firstName);
      const identityLast = normalizeIdentityToken(identity.lastName);

      const rescued = superAdminCandidates.find((candidate) => {
        const candidateAlias = normalizeIdentityToken(candidate.alias);
        const candidateFirst = normalizeIdentityToken(candidate.first_name);
        const candidateLast = normalizeIdentityToken(candidate.last_name);

        const aliasMatch = Boolean(identityAlias) && identityAlias === candidateAlias;
        const firstMatch = Boolean(identityFirst) && identityFirst === candidateFirst;
        const lastMatch = namesLookEquivalent(identity.lastName, candidate.last_name);

        return aliasMatch || (firstMatch && lastMatch);
      });

      if (rescued) {
        appUser = rescued;
      }
    }

  const userRole = appUser ? normalizeRole(appUser.role) : extractRoleFromClaims(sessionClaims);
  const isSuperAdmin = userRole === "superadmin";

    // Sync user role to Clerk metadata if not already synced or if changed
    if (appUser && hasClerkCredentials()) {
      try {
        const client = await clerkClient();
        const clerkUser = await client.users.getUser(userId);
        const clerkRoleMetadata = (clerkUser.publicMetadata?.role as string) || null;

        // Update if role changed or wasn't synced yet
        if (clerkRoleMetadata !== appUser.role) {
          await client.users.updateUserMetadata(userId, {
            publicMetadata: {
              role: appUser.role,
              tenantId: appUser.tenant_id,
            },
          });
        }
      } catch {
        // Continue without sync if Clerk is unavailable
      }
    }

  const shouldUseOverride = Boolean(tenantOverrideSlug) && (isSuperAdmin || process.env.NODE_ENV !== "production");

  const fallbackTenantId = appUser?.tenant_id ?? null;

  const tenant =
    (shouldUseOverride
      ? await resolveTenantByReference({ tenantId: null, tenantSlug: tenantOverrideSlug ?? null })
      : null) ??
    (await resolveTenantByReference({ tenantId: tenantId ?? fallbackTenantId, tenantSlug })) ??
    (process.env["DEFAULT_TENANT_SLUG"] ? await getBootstrapTenant() : null);

  if (!tenant) {
    return null;
  }

  const isCrossTenantContext = !isSuperAdmin && Boolean(appUser?.tenant_id) && appUser?.tenant_id !== tenant.id;

  if (isCrossTenantContext) {
    return null;
  }

  const appUserDisplayName = [appUser?.first_name, appUser?.last_name]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();

  let userDisplayName =
    appUserDisplayName ||
    (appUser?.alias && appUser.alias.trim().length > 0 ? appUser.alias.trim() : null) ||
    claimDisplayName;

  if (!userDisplayName || looksLikeOpaqueId(userDisplayName)) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(userId);
      const fullName = [clerkUser.firstName, clerkUser.lastName]
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .join(" ")
        .trim();

      if (fullName.length > 0) {
        userDisplayName = fullName;
      }
    } catch {
      // Si Clerk falla, mantenemos fallback local sin romper el flujo.
    }
  }

  if (looksLikeOpaqueId(userDisplayName)) {
    userDisplayName = null;
  }

  const isTenantAdmin = TENANT_ADMIN_ROLES.has(userRole);

  const primaryAdmin = isTenantAdmin
    ? await prisma.app_users.findFirst({
        orderBy: [{ created_at: "asc" }],
        select: {
          user_id: true,
        },
        where: {
          active: true,
          role: {
            in: ["owner", "admin"],
          },
          tenant_id: tenant.id,
        },
      })
    : null;

  const isTenantPrimaryAdmin = Boolean(isTenantAdmin && primaryAdmin?.user_id === appUser?.user_id);

  const accessScope: AccessScope = isSuperAdmin ? "global" : "subtenant";
  const subtenantKey = isSuperAdmin ? `superadmin:${userId}` : `${tenant.id}:${userId}`;

  return {
    accessScope,
    authMode: "clerk",
    id: tenant.id,
    isSuperAdmin,
    isTenantPrimaryAdmin,
    name: tenant.name,
    slug: tenant.slug,
    subtenantKey,
    userRole,
    userDisplayName,
    userId,
  };
}