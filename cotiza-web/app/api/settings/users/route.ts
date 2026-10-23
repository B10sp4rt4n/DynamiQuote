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

  if (!(tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin")) {
    return NextResponse.json({ error: "No tienes permisos para crear usuarios" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = createManagedUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload invalido" }, { status: 422 });
  }

  const requestedRole = parsed.data.role ?? "user";
  // Techo de asignacion: nadie puede otorgar un rol igual o superior al propio,
  // salvo superadmin. admin solo puede crear "user"; owner puede crear
  // "user"/"admin" pero no otro "owner".
  const assignableRoles: Record<"owner" | "admin", Array<"user" | "admin">> = {
    admin: ["user"],
    owner: ["user", "admin"],
  };

  if (!tenant.isSuperAdmin) {
    const allowed: readonly string[] = assignableRoles[tenant.userRole as "owner" | "admin"] ?? [];
    if (!allowed.includes(requestedRole)) {
      return NextResponse.json(
        { error: `Tu rol (${tenant.userRole}) no puede asignar el rol "${requestedRole}"` },
        { status: 403 },
      );
    }
  }

  // Solo superadmin puede crear usuarios fuera de su propio tenant.
  const targetTenantId = tenant.isSuperAdmin ? (parsed.data.tenantId ?? tenant.id) : tenant.id;

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

  const assignedRole = requestedRole;
  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const adminProvidedUserId = parsed.data.userId?.trim() || null;
  // Existing identities require an explicit, verified Clerk ID selected by a
  // superadmin. An email match is a conflict, never permission to move an account.
  let identityClient: Awaited<ReturnType<typeof clerkClient>> | null = null;
  if (adminProvidedUserId && !tenant.isSuperAdmin) {
    return NextResponse.json({ error: "Solo superadmin puede vincular un ID existente" }, { status: 403 });
  }
  if (adminProvidedUserId && !isClerkUserId(adminProvidedUserId)) {
    return NextResponse.json({ error: "Se requiere un ID Clerk exacto" }, { status: 422 });
  }
  if (adminProvidedUserId && !hasClerkCredentials()) {
    return NextResponse.json({ error: "No es posible verificar la identidad en Clerk" }, { status: 503 });
  }
  if (hasClerkCredentials()) {
    try {
      identityClient = await clerkClient();
      if (adminProvidedUserId) {
        const identity = await identityClient.users.getUser(adminProvidedUserId);
        const verifiedEmail = identity.emailAddresses.some((email) =>
          email.emailAddress.trim().toLowerCase() === normalizedEmail && email.verification?.status === "verified",
        );
        if (identity.id !== adminProvidedUserId || !verifiedEmail || identity.banned || identity.locked) {
          return NextResponse.json({ error: "El ID no tiene el correo verificado indicado o no esta habilitado" }, { status: 422 });
        }
      } else {
        const matches = await identityClient.users.getUserList({ emailAddress: [normalizedEmail], limit: 1 });
        if (matches.data.length > 0) {
          return NextResponse.json({ error: "La identidad ya existe. Requiere revision y vinculacion explicita por superadmin" }, { status: 409 });
        }
      }
    } catch {
      return NextResponse.json({ error: "No fue posible verificar la identidad en Clerk; no se creo el usuario" }, { status: 503 });
    }
  }
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

  const responseUser = created;

  let clerkSynced = false;
  let invitationSent = false;
  let clerkWarning: string | null = null;

  if (hasClerkCredentials()) {
    try {
      const client = identityClient!;
      if (adminProvidedUserId) {
        try {
          await client.users.updateUserMetadata(adminProvidedUserId, {
            publicMetadata: {
              localUserId: responseUser.userId,
              role: assignedRole,
              subtenantKey: `${targetTenant.tenant_id}:${adminProvidedUserId}`,
              tenantId: targetTenant.tenant_id,
              tenantSlug: targetTenant.slug,
            },
          });
          clerkSynced = true;
        } catch (error) {
          const clerkDetail = extractClerkErrorMessage(error);
          clerkWarning = `No se pudo sincronizar metadata en Clerk: ${clerkDetail}`;
          console.error("[clerk] Error al sincronizar metadata:", error);
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
              // Clerk no acepta firstName/lastName en createInvitation, y su
              // flujo de sign-up no siempre los captura. Los mandamos aqui
              // para que el webhook user.created los use si Clerk llega sin
              // nombre real (ver app/api/webhooks/clerk/route.ts).
              firstName: parsed.data.firstName,
              lastName: parsed.data.lastName,
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

  // Si el usuario ya existe en Clerk (clerkSynced), mandar a sign-in; si es nuevo, a sign-up.
  const accessUrl = clerkSynced
    ? `${appUrl}/sign-in?email=${encodeURIComponent(normalizedEmail)}`
    : `${appUrl}/sign-up?email=${encodeURIComponent(normalizedEmail)}`;

  const emailResult = await sendInvitationEmail({
    to: normalizedEmail,
    firstName: parsed.data.firstName,
    tenantName: targetTenant.name ?? parsed.data.tenantId ?? "tu empresa",
    inviterName: tenant.userDisplayName ?? "El administrador",
    signUpUrl: accessUrl,
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
