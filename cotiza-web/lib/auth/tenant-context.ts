import "server-only";

import { auth } from "@clerk/nextjs/server";

import { hasClerkCredentials } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";
import { getBootstrapTenant, type BootstrapTenant } from "@/lib/db/tenants";

export type TenantContext = BootstrapTenant & {
  authMode: "bootstrap" | "clerk";
  userId: string | null;
};

type ResolvedTenant = {
  id: string;
  name: string;
  slug: string;
};

type ClerkClaimRecord = Record<string, unknown>;

type TenantClaims = {
  metadata?: ClerkClaimRecord;
  publicMetadata?: ClerkClaimRecord;
  unsafeMetadata?: ClerkClaimRecord;
  org_slug?: string | null;
};

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
  if (!hasClerkCredentials()) {
    const tenant = await getBootstrapTenant();

    return tenant
      ? {
          ...tenant,
          authMode: "bootstrap",
          userId: null,
        }
      : null;
  }

  const { sessionClaims, userId } = await auth();

  if (!userId) {
    return null;
  }

  const { tenantId, tenantSlug } = extractTenantReference(sessionClaims);

  const tenant =
    (await resolveTenantByReference({ tenantId, tenantSlug })) ??
    (process.env["DEFAULT_TENANT_SLUG"] ? await getBootstrapTenant() : null);

  if (!tenant) {
    return null;
  }

  return {
    authMode: "clerk",
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    userId,
  };
}