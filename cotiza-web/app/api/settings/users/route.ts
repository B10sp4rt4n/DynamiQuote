import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { hasClerkCredentials } from "@/lib/auth/clerk";
import {
  createManagedUserByTenant,
  deleteManagedUserByTenant,
  getAppUsersByTenant,
  getAppUsersForSuperAdmin,
  relinkManagedUserIdByTenant,
  updateManagedUserByTenant,
} from "@/lib/db/settings";
import { prisma } from "@/lib/db/prisma";
import { createManagedUserSchema } from "@/lib/validations/users";
import { sendInvitationEmail } from "@/lib/email/send-invitation";
import { getPublicAppUrl, validateClerkEnvironment } from "@/lib/utils/app-url";

function extractClerkErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      errors?: Array<{ longMessage?: string; long_message?: string; message?: string }>;
      message?: string;
    };

    const first = maybeError.errors?.[0];
    if (first?.longMessage?.trim()) return first.longMessage;
    if (first?.long_message?.trim()) return first.long_message;
    if (first?.message?.trim()) return first.message;
    if (maybeError.message?.trim()) return maybeError.message;
  }

  return "Error desconocido en Clerk";
}

function extractClerkErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      errors?: Array<{ code?: string }>;
    };

    const code = maybeError.errors?.[0]?.code;
    if (typeof code === "string" && code.trim().length > 0) {
      return code.trim();
    }
  }

  return null;
}

function isClerkUserId(value: string): boolean {
  return value.startsWith("user_");
}

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
  const adminProvidedUserId = parsed.data.userId?.trim() || null;
  const provisionalUserId = adminProvidedUserId || `pending_${crypto.randomUUID()}`;

  const created = await createManagedUserByTenant({
    payload: { ...parsed.data, userId: provisionalUserId, role: assignedRole },
    targetTenantId,
  });

  if (!created) {
    return NextResponse.json(
      { error: "No fue posible crear el usuario. Verifica tenant, alias y userId unicos." },
      { status: 409 },
    );
  }

  let responseUser = created;

  let clerkSynced = false;
  let invitationSent = false;
  let clerkWarning: string | null = null;

  if (hasClerkCredentials()) {
    try {
      const client = await clerkClient();
      let clerkUserId: string | null = null;

      if (adminProvidedUserId && isClerkUserId(adminProvidedUserId)) {
        clerkUserId = adminProvidedUserId;
      }

      if (!clerkUserId) {
        const byEmail = await client.users.getUserList({
          emailAddress: [normalizedEmail],
          limit: 1,
        });

        const existing = byEmail.data[0];
        if (existing?.id) {
          clerkUserId = existing.id;
        }
      }

      // Para usuarios nuevos no intentamos createUser (requiere contraseña en la mayoría
      // de instancias Clerk y devuelve 422). Si no hay clerkUserId tras la búsqueda por
      // email, caemos directamente a createInvitation más abajo.

      if (clerkUserId) {
        try {
          await client.users.getUser(clerkUserId);
          await client.users.updateUserMetadata(clerkUserId, {
            publicMetadata: {
              localUserId: responseUser.userId,
              role: assignedRole,
              subtenantKey: `${targetTenant.tenant_id}:${clerkUserId}`,
              tenantId: targetTenant.tenant_id,
              tenantSlug: targetTenant.slug,
            },
          });
          clerkSynced = true;

          if (responseUser.userId !== clerkUserId) {
            try {
              const relinked = await relinkManagedUserIdByTenant({
                currentUserId: responseUser.userId,
                newUserId: clerkUserId,
                tenantId: targetTenantId,
              });

              if (relinked) {
                responseUser = relinked;
              }
            } catch (error) {
              if (error instanceof Error && error.message === "DUPLICATE_USER_ID") {
                const reassigned = await updateManagedUserByTenant({
                  payload: {
                    active: true,
                    alias: parsed.data.alias,
                    firstName: parsed.data.firstName,
                    lastName: parsed.data.lastName,
                    role: assignedRole,
                    sellerCode: parsed.data.sellerCode ?? null,
                    tenantId: targetTenantId,
                  },
                  tenantId: null,
                  userId: clerkUserId,
                });

                if (reassigned) {
                  await deleteManagedUserByTenant(targetTenantId, responseUser.userId);
                  responseUser = reassigned;
                  clerkWarning =
                    "El correo ya existia en Clerk y en BD. Se reasigno automaticamente al tenant destino.";
                } else {
                  clerkWarning =
                    "El correo ya existe en Clerk, pero no fue posible reasignarlo en BD al tenant destino.";
                }
              } else {
                const relinkDetail = extractClerkErrorMessage(error);
                clerkWarning = `Se creó en Clerk, pero no se pudo actualizar userId local: ${relinkDetail}`;
              }
            }
          }
        } catch (error) {
          const clerkDetail = extractClerkErrorMessage(error);
          clerkWarning = `No se pudo vincular el userId en Clerk: ${clerkDetail}`;
          console.error("[clerk] Error al vincular userId:", error);
        }
      } else {
        try {
          // Usar siempre getPublicAppUrl() para el redirectUrl de la invitación Clerk
          const inviteUrlResult = getPublicAppUrl();
          const inviteBase = inviteUrlResult.ok
            ? inviteUrlResult.url
            : "https://dynami-quote.vercel.app";
          await client.invitations.createInvitation({
            emailAddress: normalizedEmail,
            redirectUrl: `${inviteBase}/sign-up`,
            publicMetadata: {
              localUserId: responseUser.userId,
              role: assignedRole,
              tenantId: targetTenant.tenant_id,
              tenantSlug: targetTenant.slug,
            },
          });
          invitationSent = true;
        } catch (error) {
          const clerkDetail = extractClerkErrorMessage(error);
          const clerkCode = extractClerkErrorCode(error);

          if (clerkCode === "duplicate_record") {
            invitationSent = true;
            clerkWarning = "Clerk ya tenía una invitación pendiente para este correo.";
          } else {
            clerkWarning = `No se pudo enviar invitación en Clerk: ${clerkDetail}`;
          }

          console.error("[clerk] Error en invitación:", error);
        }
      }
    } catch (error) {
      const clerkDetail = extractClerkErrorMessage(error);
      clerkWarning = `Error general al conectar con Clerk: ${clerkDetail}`;

      console.error("[clerk] Error general de integración:", error);
    }
  }

  // Enviar correo de invitación con Resend independientemente de Clerk
  const clerkEnvCheck = validateClerkEnvironment();
  if (!clerkEnvCheck.ok) {
    console.error("[users] Entorno Clerk inválido:", clerkEnvCheck.error);
    return NextResponse.json({ error: clerkEnvCheck.error }, { status: 500 });
  }

  const appUrlResult = getPublicAppUrl();
  const appUrl = appUrlResult.ok ? appUrlResult.url : "https://dynami-quote.vercel.app";
  if (!appUrlResult.ok) {
    console.warn("[users] No se pudo resolver URL pública:", appUrlResult.error);
  }

  // Resolver email del superadmin para BCC silencioso
  let adminBcc: string | undefined;
  if (tenant.userId?.startsWith("user_")) {
    try {
      const adminClerk = await clerkClient();
      const adminUser = await adminClerk.users.getUser(tenant.userId);
      const primaryEmail = adminUser.emailAddresses.find(
        (ea) => ea.id === adminUser.primaryEmailAddressId,
      );
      adminBcc = primaryEmail?.emailAddress ?? adminUser.emailAddresses[0]?.emailAddress;
    } catch {
      // Si falla, omitir BCC sin bloquear el alta
    }
  }

  const emailResult = await sendInvitationEmail({
    to: normalizedEmail,
    firstName: parsed.data.firstName,
    tenantName: targetTenant.name ?? parsed.data.tenantId ?? "tu empresa",
    inviterName: tenant.userDisplayName ?? "El administrador",
    signUpUrl: `${appUrl}/sign-up?email=${encodeURIComponent(normalizedEmail)}`,
    bcc: adminBcc,
  });

  return NextResponse.json(
    {
      clerkSynced,
      clerkWarning,
      emailSent: emailResult.sent,
      emailWarning: emailResult.warning,
      invitationSent,
      user: responseUser,
    },
    { status: 201 },
  );
}
