import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { hasClerkCredentials } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";
import { sendInvitationEmail } from "@/lib/email/send-invitation";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

type RouteContext = { params: Promise<{ userId: string }> };

function extractClerkErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      errors?: Array<{ longMessage?: string; message?: string }>;
      message?: string;
    };

    const first = maybeError.errors?.[0];
    if (first?.longMessage?.trim()) return first.longMessage;
    if (first?.message?.trim()) return first.message;
    if (maybeError.message?.trim()) return maybeError.message;
  }

  return "Error desconocido en Clerk";
}

export async function POST(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!tenant.isSuperAdmin) {
    return NextResponse.json(
      { error: "Solo superadmin puede reenviar acceso a usuarios" },
      { status: 403 },
    );
  }

  const identity = getRequestIdentity(request, tenant.id);
  const rl = enforceRateLimit(`settings:users:resend:${tenant.id}:${identity}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      {
        headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString() },
        status: 429,
      },
    );
  }

  const { userId } = await context.params;

  // Obtener datos del usuario de BD para nombre y tenant
  const dbUser = await prisma.app_users.findFirst({
    select: {
      first_name: true,
      last_name: true,
      tenants: { select: { name: true } },
      user_id: true,
    },
    where: { user_id: userId },
  });

  if (!dbUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (!hasClerkCredentials()) {
    return NextResponse.json(
      { error: "Clerk no está configurado en este entorno" },
      { status: 503 },
    );
  }

  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "https://dynami-quote.vercel.app";
  const tenantName = dbUser.tenants?.name ?? "tu empresa";
  const firstName = dbUser.first_name;
  const inviterName = tenant.userDisplayName ?? "El administrador";
  const isClerkUser = userId.startsWith("user_");

  try {
    const client = await clerkClient();

    if (isClerkUser) {
      // Usuario con cuenta Clerk activa — obtener email y crear magic link
      const clerkUser = await client.users.getUser(userId);
      const email = clerkUser.emailAddresses[0]?.emailAddress;

      if (!email) {
        return NextResponse.json(
          { error: "No hay correo disponible para este usuario." },
          { status: 422 },
        );
      }

      // Crear token de acceso directo (magic link) con vigencia de 7 días
      const tokenResult = await client.signInTokens.createSignInToken({
        expiresInSeconds: 604800,
        userId,
      });

      const signInUrl = tokenResult.url ?? `${appUrl}/sign-in`;

      const emailResult = await sendInvitationEmail({
        firstName,
        inviterName,
        signUpUrl: signInUrl,
        tenantName,
        to: email,
      });

      if (emailResult.sent) {
        console.info(`[resend-access] Magic link enviado a ${email} (${userId})`);
      } else {
        console.warn(`[resend-access] Magic link creado pero correo falló para ${email} (${userId}): ${emailResult.warning ?? "sin detalle"}`);
      }

      return NextResponse.json({
        emailSent: emailResult.sent,
        emailWarning: emailResult.warning,
        // signInUrl solo se incluye cuando el correo falló para que el admin lo copie manualmente
        signInUrl: emailResult.sent ? undefined : signInUrl,
        sent: true,
      });
    } else {
      // Usuario pendiente (sin cuenta Clerk) — buscar invitación activa por localUserId
      const invitationsPage = await client.invitations.getInvitationList({ status: "pending" });
      const match = invitationsPage.data.find(
        (inv) =>
          (inv.publicMetadata as Record<string, unknown>)?.localUserId === userId,
      );

      if (!match) {
        return NextResponse.json(
          {
            error:
              "No hay correo disponible para este usuario. Aún no tiene invitación activa en Clerk. Bórralo y vuelve a crearlo para reenviar el acceso.",
          },
          { status: 422 },
        );
      }

      const email = match.emailAddress;

      // Revocar la invitación anterior y crear una nueva
      try {
        await client.invitations.revokeInvitation(match.id);
      } catch (revokeError) {
        // Si ya expiró o fue revocada, continuar igualmente
        console.warn("[resend-access] No se pudo revocar invitación anterior:", revokeError);
      }

      await client.invitations.createInvitation({
        emailAddress: email,
        publicMetadata: match.publicMetadata as Record<string, unknown>,
        redirectUrl: `${appUrl}/sign-up`,
      });

      const emailResult = await sendInvitationEmail({
        firstName,
        inviterName,
        signUpUrl: `${appUrl}/sign-up?email=${encodeURIComponent(email)}`,
        tenantName,
        to: email,
      });

      if (emailResult.sent) {
        console.info(`[resend-access] Invitación renovada y enviada a ${email} (${userId})`);
      } else {
        console.warn(`[resend-access] Invitación renovada pero correo falló para ${email} (${userId}): ${emailResult.warning ?? "sin detalle"}`);
      }

      return NextResponse.json({
        emailSent: emailResult.sent,
        emailWarning: emailResult.warning,
        signInUrl: emailResult.sent ? undefined : `${appUrl}/sign-up?email=${encodeURIComponent(email)}`,
        sent: true,
      });
    }
  } catch (error) {
    const detail = extractClerkErrorMessage(error);
    console.error("[resend-access] Error al reenviar acceso:", error);

    return NextResponse.json(
      {
        error:
          "No se pudo reenviar el acceso. Intenta nuevamente o revisa la configuración de Clerk.",
        _debug: process.env["NODE_ENV"] === "development" ? detail : undefined,
      },
      { status: 500 },
    );
  }
}
