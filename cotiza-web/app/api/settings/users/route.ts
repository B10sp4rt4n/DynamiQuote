import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { hasClerkCredentials } from "@/lib/auth/clerk";
import {
  createManagedUserByTenant,
  getAppUsersByTenant,
  getAppUsersForSuperAdmin,
} from "@/lib/db/settings";
import { prisma } from "@/lib/db/prisma";
import { createManagedUserSchema } from "@/lib/validations/users";
import { sendInvitationEmail } from "@/lib/email/send-invitation";

export async function GET() {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const users = tenant.isSuperAdmin
    ? await getAppUsersForSuperAdmin()
    : await getAppUsersByTenant(tenant.id);

  return NextResponse.json({
    canManageAllTenants: tenant.isSuperAdmin,
    users,
  });
}

export async function POST(request: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = createManagedUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload invalido" }, { status: 422 });
  }

  const targetTenantId = parsed.data.tenantId ?? tenant.id;

  const targetTenant = await prisma.tenant.findFirst({
    select: {
      name: true,
      slug: true,
      tenant_id: true,
    },
    where: {
      active: true,
      tenant_id: targetTenantId,
    },
  });

  if (!targetTenant) {
    return NextResponse.json({ error: "Tenant destino invalido" }, { status: 422 });
  }

  const assignedRole = parsed.data.role ?? "user";
  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  let resolvedUserId = parsed.data.userId?.trim() || null;

  let clerkSynced = false;
  let invitationSent = false;

  if (hasClerkCredentials()) {
    try {
      const client = await clerkClient();

      if (!resolvedUserId) {
        const byEmail = await client.users.getUserList({
          emailAddress: [normalizedEmail],
          limit: 1,
        });

        const existing = byEmail.data[0];
        if (existing?.id) {
          resolvedUserId = existing.id;
        }
      }

      if (resolvedUserId) {
        await client.users.getUser(resolvedUserId);
        await client.users.updateUserMetadata(resolvedUserId, {
          publicMetadata: {
            role: assignedRole,
            subtenantKey: `${targetTenant.tenant_id}:${resolvedUserId}`,
            tenantId: targetTenant.tenant_id,
            tenantSlug: targetTenant.slug,
          },
        });
        clerkSynced = true;
      } else {
        await client.invitations.createInvitation({
          emailAddress: normalizedEmail,
          publicMetadata: {
            role: assignedRole,
            tenantId: targetTenant.tenant_id,
            tenantSlug: targetTenant.slug,
          },
        });
        invitationSent = true;
      }
    } catch {
      return NextResponse.json(
        { error: "No se pudo vincular/enviar invitación en Clerk. Verifica correo o configuración de Clerk." },
        { status: 422 },
      );
    }
  }

  const created = await createManagedUserByTenant({
    payload: { ...parsed.data, userId: resolvedUserId ?? `pending_${crypto.randomUUID()}`, role: assignedRole },
    targetTenantId,
  });

  if (!created) {
    return NextResponse.json(
      { error: "No fue posible crear el usuario. Verifica tenant, alias y userId unicos." },
      { status: 409 },
    );
  }

  // Enviar correo de invitación con Resend independientemente de Clerk
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "https://dynami-quote.vercel.app";
  const emailSent = await sendInvitationEmail({
    to: normalizedEmail,
    firstName: parsed.data.firstName,
    tenantName: targetTenant.name ?? parsed.data.tenantId ?? "tu empresa",
    inviterName: tenant.userDisplayName ?? "El administrador",
    signUpUrl: `${appUrl}/sign-up?email=${encodeURIComponent(normalizedEmail)}`,
  });

  return NextResponse.json({ clerkSynced, emailSent, invitationSent, user: created }, { status: 201 });
}
