import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { hasClerkCredentials } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";
import { getBootstrapTenant, type BootstrapTenant } from "@/lib/db/tenants";

export type TenantContext = BootstrapTenant & {
  authMode: "bootstrap" | "clerk";
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

function looksLikeOpaqueId(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return /^(ser|user|sess|org)_[A-Za-z0-9]+$/.test(value.trim());
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
          ...tenant,
          authMode: "bootstrap",
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

  const shouldUseOverride = process.env.NODE_ENV !== "production" && Boolean(tenantOverrideSlug);

  const tenant =
    (shouldUseOverride
      ? await resolveTenantByReference({ tenantId: null, tenantSlug: tenantOverrideSlug ?? null })
      : null) ??
    (await resolveTenantByReference({ tenantId, tenantSlug })) ??
    (process.env["DEFAULT_TENANT_SLUG"] ? await getBootstrapTenant() : null);

  if (!tenant) {
    return null;
  }

  const appUser = await prisma.app_users.findFirst({
    select: {
      alias: true,
      first_name: true,
      last_name: true,
    },
    where: {
      tenant_id: tenant.id,
      user_id: userId,
    },
  });

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

  return {
    authMode: "clerk",
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    userDisplayName,
    userId,
  };
}