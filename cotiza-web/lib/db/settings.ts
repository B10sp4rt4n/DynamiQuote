import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { CreateManagedUserInput, UpdateManagedUserInput } from "@/lib/validations/users";

export type AppUserSummary = {
  active: boolean;
  alias: string;
  createdAt: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  sellerCode: string | null;
  subtenantKey: string;
  tenantId: string | null;
  tenantName: string | null;
  userId: string;
};

export type IssuerProfileSummary = {
  companyName: string | null;
  isDefault: boolean;
  logoFormat: string;
  logoId: string;
  logoName: string;
  logoType: string;
  uploadedAt: string;
};

type CreateManagedUserArgs = {
  targetTenantId: string;
  payload: CreateManagedUserInput;
};

type UpdateManagedUserArgs = {
  tenantId: string | null;
  userId: string;
  payload: UpdateManagedUserInput;
};

type RelinkManagedUserIdArgs = {
  currentUserId: string;
  newUserId: string;
  tenantId: string;
};

type SyncManagedUserFromClerkArgs = {
  clerkUserId: string;
  externalId: string | null;
  firstName: string;
  lastName: string;
  localUserId: string | null;
  normalizedEmail: string;
  role: "admin" | "owner" | "user";
  tenantId: string;
};

export async function getAppUsersByTenant(tenantId: string): Promise<AppUserSummary[]> {
  const rows = await prisma.app_users.findMany({
    orderBy: [{ active: "desc" }, { created_at: "asc" }],
    select: {
      active: true,
      alias: true,
      created_at: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
      seller_code: true,
      tenant_id: true,
      tenants: {
        select: {
          name: true,
        },
      },
      user_id: true,
    },
    where: { tenant_id: tenantId },
  });

  return rows.map((row) => ({
    active: row.active,
    alias: row.alias,
    createdAt: row.created_at.toISOString(),
    email: row.email ?? null,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    sellerCode: row.seller_code,
    subtenantKey: `${row.tenant_id ?? "sin-tenant"}:${row.user_id}`,
    tenantId: row.tenant_id,
    tenantName: row.tenants?.name ?? null,
    userId: row.user_id,
  }));
}

export async function getAppUsersForSuperAdmin(): Promise<AppUserSummary[]> {
  const rows = await prisma.app_users.findMany({
    orderBy: [{ active: "desc" }, { tenant_id: "asc" }, { created_at: "asc" }],
    select: {
      active: true,
      alias: true,
      created_at: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
      seller_code: true,
      tenant_id: true,
      tenants: {
        select: {
          name: true,
        },
      },
      user_id: true,
    },
  });

  return rows.map((row) => ({
    active: row.active,
    alias: row.alias,
    createdAt: row.created_at.toISOString(),
    email: row.email ?? null,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    sellerCode: row.seller_code,
    subtenantKey: `${row.tenant_id ?? "sin-tenant"}:${row.user_id}`,
    tenantId: row.tenant_id,
    tenantName: row.tenants?.name ?? null,
    userId: row.user_id,
  }));
}

export async function toggleAppUserActivationByTenant(
  tenantId: string | null,
  userId: string,
): Promise<AppUserSummary | null> {
  const user = await prisma.app_users.findFirst({
    select: { active: true, role: true, tenant_id: true, user_id: true },
    where: {
      user_id: userId,
      ...(tenantId ? { tenant_id: tenantId } : {}),
    },
  });

  if (!user) return null;

  const normalizedRole = user.role.trim().toLowerCase();

  if (normalizedRole === "superadmin" || normalizedRole === "super_admin" || normalizedRole === "platform_admin") {
    return null;
  }

  const updated = await prisma.app_users.update({
    data: { active: !user.active },
    select: {
      active: true,
      alias: true,
      created_at: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
      seller_code: true,
      tenant_id: true,
      tenants: {
        select: {
          name: true,
        },
      },
      user_id: true,
    },
    where: { user_id: userId },
  });

  return {
    active: updated.active,
    alias: updated.alias,
    createdAt: updated.created_at.toISOString(),
    email: updated.email ?? null,
    firstName: updated.first_name,
    lastName: updated.last_name,
    role: updated.role,
    sellerCode: updated.seller_code,
    subtenantKey: `${updated.tenant_id ?? "sin-tenant"}:${updated.user_id}`,
    tenantId: updated.tenant_id,
    tenantName: updated.tenants?.name ?? null,
    userId: updated.user_id,
  };
}

export async function updateManagedUserByTenant({
  tenantId,
  userId,
  payload,
}: UpdateManagedUserArgs): Promise<AppUserSummary | null> {
  const current = await prisma.app_users.findFirst({
    select: { role: true, tenant_id: true, user_id: true },
    where: {
      user_id: userId,
      ...(tenantId ? { tenant_id: tenantId } : {}),
    },
  });

  if (!current) return null;

  const normalizedRole = current.role.trim().toLowerCase();
  if (normalizedRole === "superadmin" || normalizedRole === "super_admin" || normalizedRole === "platform_admin") {
    return null;
  }

  if (payload.tenantId !== undefined) {
    const nextTenant = await prisma.tenant.findFirst({
      select: { tenant_id: true },
      where: {
        active: true,
        tenant_id: payload.tenantId,
      },
    });

    if (!nextTenant) {
      throw new Error("INVALID_TENANT");
    }
  }

  const updated = await prisma.app_users.update({
    data: {
      ...(payload.active !== undefined ? { active: payload.active } : {}),
      ...(payload.alias !== undefined ? { alias: payload.alias.trim() } : {}),
      ...(payload.firstName !== undefined ? { first_name: payload.firstName.trim() } : {}),
      ...(payload.lastName !== undefined ? { last_name: payload.lastName.trim() } : {}),
      ...(payload.role !== undefined ? { role: payload.role } : {}),
      ...(payload.sellerCode !== undefined
        ? { seller_code: payload.sellerCode ? payload.sellerCode.trim() : null }
        : {}),
      ...(payload.tenantId !== undefined ? { tenant_id: payload.tenantId } : {}),
    },
    select: {
      active: true,
      alias: true,
      created_at: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
      seller_code: true,
      tenant_id: true,
      tenants: {
        select: {
          name: true,
        },
      },
      user_id: true,
    },
    where: { user_id: userId },
  });

  return {
    active: updated.active,
    alias: updated.alias,
    createdAt: updated.created_at.toISOString(),
    email: updated.email ?? null,
    firstName: updated.first_name,
    lastName: updated.last_name,
    role: updated.role,
    sellerCode: updated.seller_code,
    subtenantKey: `${updated.tenant_id ?? "sin-tenant"}:${updated.user_id}`,
    tenantId: updated.tenant_id,
    tenantName: updated.tenants?.name ?? null,
    userId: updated.user_id,
  };
}

export async function deleteManagedUserByTenant(tenantId: string | null, userId: string): Promise<boolean> {
  const current = await prisma.app_users.findFirst({
    select: { role: true, user_id: true },
    where: {
      user_id: userId,
      ...(tenantId ? { tenant_id: tenantId } : {}),
    },
  });

  if (!current) return false;

  const normalizedRole = current.role.trim().toLowerCase();
  if (normalizedRole === "superadmin" || normalizedRole === "super_admin" || normalizedRole === "platform_admin") {
    return false;
  }

  await prisma.app_users.delete({ where: { user_id: userId } });
  return true;
}

export async function createManagedUserByTenant({
  targetTenantId,
  payload,
}: CreateManagedUserArgs): Promise<AppUserSummary | null> {
  const tenant = await prisma.tenant.findFirst({
    select: {
      name: true,
      tenant_id: true,
    },
    where: {
      active: true,
      tenant_id: targetTenantId,
    },
  });

  if (!tenant) {
    return null;
  }

  const existing = await prisma.app_users.findFirst({
    select: {
      user_id: true,
    },
    where: {
      OR: [{ alias: payload.alias }, { user_id: payload.userId }],
    },
  });

  if (existing) {
    return null;
  }

  // Crear con el rol indicado (default: user)
  const created = await prisma.app_users.create({
    data: {
      active: true,
      alias: payload.alias,
      created_at: new Date(),
      email: payload.email?.trim() || null,
      first_name: payload.firstName,
      last_name: payload.lastName,
      password_hash: "CLERK_MANAGED",
      role: payload.role ?? "user",
      seller_code: payload.sellerCode?.trim() || null,
      tenant_id: targetTenantId,
      user_id: payload.userId ?? `pending_${crypto.randomUUID()}`,
    },
    select: {
      active: true,
      alias: true,
      created_at: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
      seller_code: true,
      tenant_id: true,
      tenants: {
        select: {
          name: true,
        },
      },
      user_id: true,
    },
  });

  return {
    active: created.active,
    alias: created.alias,
    createdAt: created.created_at.toISOString(),
    email: created.email ?? null,
    firstName: created.first_name,
    lastName: created.last_name,
    role: created.role,
    sellerCode: created.seller_code,
    subtenantKey: `${created.tenant_id ?? "sin-tenant"}:${created.user_id}`,
    tenantId: created.tenant_id,
    tenantName: created.tenants?.name ?? tenant.name,
    userId: created.user_id,
  };
}

export async function relinkManagedUserIdByTenant({
  currentUserId,
  newUserId,
  tenantId,
}: RelinkManagedUserIdArgs): Promise<AppUserSummary | null> {
  const current = await prisma.app_users.findFirst({
    select: {
      user_id: true,
    },
    where: {
      tenant_id: tenantId,
      user_id: currentUserId,
    },
  });

  if (!current) return null;

  const duplicate = await prisma.app_users.findFirst({
    select: {
      user_id: true,
    },
    where: {
      user_id: newUserId,
    },
  });

  if (duplicate && duplicate.user_id !== currentUserId) {
    throw new Error("DUPLICATE_USER_ID");
  }

  const updated = await prisma.app_users.update({
    data: { user_id: newUserId },
    select: {
      active: true,
      alias: true,
      created_at: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
      seller_code: true,
      tenant_id: true,
      tenants: {
        select: {
          name: true,
        },
      },
      user_id: true,
    },
    where: { user_id: currentUserId },
  });

  return {
    active: updated.active,
    alias: updated.alias,
    createdAt: updated.created_at.toISOString(),
    email: updated.email ?? null,
    firstName: updated.first_name,
    lastName: updated.last_name,
    role: updated.role,
    sellerCode: updated.seller_code,
    subtenantKey: `${updated.tenant_id ?? "sin-tenant"}:${updated.user_id}`,
    tenantId: updated.tenant_id,
    tenantName: updated.tenants?.name ?? null,
    userId: updated.user_id,
  };
}

function normalizeAliasFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "usuario";
  const sanitized = localPart.toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return sanitized.length >= 3 ? sanitized : `user_${crypto.randomUUID().slice(0, 8)}`;
}

export async function syncManagedUserFromClerkUserCreated({
  clerkUserId,
  externalId,
  firstName,
  lastName,
  localUserId,
  normalizedEmail,
  role,
  tenantId,
}: SyncManagedUserFromClerkArgs): Promise<AppUserSummary | null> {
  const updatePayload: UpdateManagedUserInput = {
    active: true,
    firstName,
    lastName,
    role,
  };

  const existingByClerkId = await prisma.app_users.findFirst({
    select: { user_id: true },
    where: {
      tenant_id: tenantId,
      user_id: clerkUserId,
    },
  });

  if (existingByClerkId) {
    return updateManagedUserByTenant({
      tenantId,
      userId: clerkUserId,
      payload: updatePayload,
    });
  }

  const candidateIds = Array.from(
    new Set(
      [localUserId, externalId]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
        .filter((value) => value !== clerkUserId),
    ),
  );

  for (const candidateId of candidateIds) {
    const existingCandidate = await prisma.app_users.findFirst({
      select: { user_id: true },
      where: {
        tenant_id: tenantId,
        user_id: candidateId,
      },
    });

    if (!existingCandidate) continue;

    try {
      await relinkManagedUserIdByTenant({
        currentUserId: candidateId,
        newUserId: clerkUserId,
        tenantId,
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "DUPLICATE_USER_ID") {
        throw error;
      }
    }

    const relinkedUpdated = await updateManagedUserByTenant({
      tenantId,
      userId: clerkUserId,
      payload: updatePayload,
    });

    if (relinkedUpdated) {
      return relinkedUpdated;
    }
  }

  const baseAlias = normalizeAliasFromEmail(normalizedEmail);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const alias = attempt === 0 ? baseAlias : `${baseAlias}_${attempt}`;
    const created = await createManagedUserByTenant({
      payload: {
        alias,
        email: normalizedEmail,
        firstName,
        lastName,
        role,
        sellerCode: null,
        tenantId,
        userId: clerkUserId,
      },
      targetTenantId: tenantId,
    });

    if (created) {
      return created;
    }
  }

  return null;
}

export async function getIssuerProfilesByTenant(
  tenantId: string,
): Promise<IssuerProfileSummary[]> {
  const rows = await prisma.company_logos.findMany({
    orderBy: [{ is_default: "desc" }, { uploaded_at: "desc" }],
    select: {
      company_name: true,
      is_default: true,
      logo_format: true,
      logo_id: true,
      logo_name: true,
      logo_type: true,
      uploaded_at: true,
    },
    where: { tenant_id: tenantId },
  });

  return rows.map((row) => ({
    companyName: row.company_name,
    isDefault: row.is_default ?? false,
    logoFormat: row.logo_format,
    logoId: row.logo_id,
    logoName: row.logo_name,
    logoType: row.logo_type,
    uploadedAt: row.uploaded_at.toISOString(),
  }));
}

export async function setDefaultIssuerProfileByTenant(
  tenantId: string,
  logoId: string,
): Promise<IssuerProfileSummary | null> {
  const logo = await prisma.company_logos.findFirst({
    select: { logo_id: true },
    where: { logo_id: logoId, tenant_id: tenantId },
  });

  if (!logo) return null;

  await prisma.$transaction(async (tx) => {
    await tx.company_logos.updateMany({
      data: { is_default: false },
      where: { tenant_id: tenantId },
    });
    await tx.company_logos.update({
      data: { is_default: true },
      where: { logo_id: logoId },
    });
  });

  const updated = await prisma.company_logos.findFirst({
    select: {
      company_name: true,
      is_default: true,
      logo_format: true,
      logo_id: true,
      logo_name: true,
      logo_type: true,
      uploaded_at: true,
    },
    where: { logo_id: logoId },
  });

  if (!updated) return null;

  return {
    companyName: updated.company_name,
    isDefault: updated.is_default ?? true,
    logoFormat: updated.logo_format,
    logoId: updated.logo_id,
    logoName: updated.logo_name,
    logoType: updated.logo_type,
    uploadedAt: updated.uploaded_at.toISOString(),
  };
}
