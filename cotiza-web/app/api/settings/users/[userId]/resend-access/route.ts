import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { hasClerkCredentials } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";
import { extractFromDomain, resolveResendConfig } from "@/lib/email/resend";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import {
  buildClerkTicketUrl,
  getPublicAppUrl,
  validateClerkEnvironment,
} from "@/lib/utils/app-url";

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

function sanitizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

async function resolveAdminEmail(): Promise<string | null> {
  try {
    const { sessionClaims } = await auth();
    const claims = (sessionClaims ?? {}) as { email?: unknown };
    return sanitizeEmail(typeof claims.email === "string" ? claims.email : null);
  } catch {
    return null;
  }
}

/**
 * Enmascara parámetros de query sensibles en una URL de acceso.
 * Devuelve la URL con los valores de ticket/token reemplazados por "***masked***".
 */
function maskSensitiveUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const sensitiveParams = ["ticket", "token", "__clerk_ticket", "sign_in_token", "t"];
    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, "***masked***");
      }
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

type DryRunInput = {
  destEmail: string;
  adminEmail: string | null;
  from: string;
  configSource: string;
  signInUrl: string | null;
  appUrl: string;
  clerkEnvironmentValid: boolean;
  resendConfigValid: boolean;
};

function buildDryRunResponse(input: DryRunInput): NextResponse {
  const { destEmail, adminEmail, from, configSource, signInUrl, appUrl, clerkEnvironmentValid, resendConfigValid } =
    input;

  const fromDomain = extractFromDomain(from);
  const usesResendDevDomain = fromDomain === "resend.dev";
  const hasValidRecipient = Boolean(sanitizeEmail(destEmail));
  const hasValidFrom = Boolean(from && from.includes("@"));
  const fromIsNotResendDev = !usesResendDevDomain;

  let accessUrlHost: string | null = null;
  let usesLocalhost = false;
  let usesPreviewUrl = false;

  try {
    const parsed = new URL(appUrl);
    accessUrlHost = parsed.hostname;
    usesLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    // Preview de Vercel: host diferente al canónico, con hash o "-git-"
    usesPreviewUrl =
      parsed.hostname.endsWith(".vercel.app") &&
      (parsed.hostname.includes("-git-") || /--[a-z0-9]{6,}\.vercel\.app$/.test(parsed.hostname));
  } catch {
    /* noop */
  }

  const appUrlValid = Boolean(accessUrlHost) && !usesLocalhost && !usesPreviewUrl;

  const wouldSend =
    hasValidRecipient &&
    hasValidFrom &&
    fromIsNotResendDev &&
    appUrlValid &&
    clerkEnvironmentValid &&
    resendConfigValid;

  console.info("[resend-access] Dry run ejecutado.", {
    action: "resend_access_dry_run",
    appEnv: process.env["APP_ENV"] ?? process.env["NEXT_PUBLIC_APP_ENV"] ?? "development",
    configSource,
    emailDomain: destEmail.split("@")[1] ?? "(desconocido)",
    fromDomain,
    hasCC: Boolean(adminEmail),
    vercelEnv: process.env["VERCEL_ENV"] ?? "(no definido)",
    wouldSend,
  });

  return NextResponse.json({
    dryRun: true,
    wouldSend,
    sent: false,
    messageType: "resend_access",
    environment: {
      appEnv: process.env["APP_ENV"] ?? process.env["NEXT_PUBLIC_APP_ENV"] ?? "development",
      vercelEnv: process.env["VERCEL_ENV"] ?? "(no definido)",
      nodeEnv: process.env["NODE_ENV"] ?? "development",
    },
    recipient: {
      to: destEmail,
      cc: adminEmail,
    },
    sender: {
      from,
      domain: fromDomain,
      usesResendDevDomain,
      configSource,
    },
    access: {
      accessUrlHost: accessUrlHost ?? "(no resuelto)",
      accessUrlPreview: maskSensitiveUrl(signInUrl),
      usesLocalhost,
      usesPreviewUrl,
    },
    checks: {
      hasValidRecipient,
      hasValidFrom,
      fromIsNotResendDev,
      appUrlValid,
      clerkEnvironmentValid,
      resendConfigValid,
    },
    reason: wouldSend
      ? "Todo válido. No se envió correo (dry run)."
      : "Configuración inválida detectada. No se enviaría correo.",
  });
}

function buildAccessHtml(input: {
  firstName: string;
  email: string;
  tenantName: string;
  signInUrl: string | null;
}): string {
  const { firstName, email, tenantName, signInUrl } = input;
  const accessBlock = signInUrl
    ? `<p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">
        Haz clic en el siguiente enlace para acceder directamente a la plataforma:
      </p>
      <a href="${signInUrl}"
         style="display:inline-block;background:#18181b;color:#fff;font-size:14px;
                font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">
        Acceder a la plataforma →
      </a>`
    : `<p style="margin:0 0 12px;font-size:15px;color:#52525b;line-height:1.6;">
        Puedes ingresar con el correo registrado: <strong>${email}</strong>
      </p>
      <p style="margin:0 0 12px;font-size:15px;color:#52525b;line-height:1.6;">
        Si tienes problemas para acceder, utiliza el flujo de recuperación de contraseña
        o contacta al administrador de tu organización.
      </p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reenvío de acceso — ${tenantName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#fff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">
          <tr>
            <td style="background:#18181b;padding:28px 40px;">
              <p style="margin:0;color:#fff;font-size:20px;font-weight:600;letter-spacing:-0.3px;">
                Cotiza
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 24px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#18181b;">
                Hola, ${firstName}
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">
                Te reenviamos la información de acceso a <strong>${tenantName}</strong>
                en la plataforma <strong>Cotiza</strong>.
              </p>
              ${accessBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 36px;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                Si no esperabas este correo puedes ignorarlo.
                ${signInUrl ? "El enlace de acceso directo es válido por 7 días." : ""}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f4f4f5;padding:16px 40px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#71717a;text-align:center;">
                Cotiza · Plataforma de cotización y propuestas comerciales
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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

  // Modo diagnóstico: ?dryRun=true — resuelve todo pero no envía correo.
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "true";

  const dbUser = await prisma.app_users.findFirst({
    select: {
      first_name: true,
      tenants: { select: { name: true, tenant_id: true } },
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

  // Validar que las claves de Clerk coincidan con el entorno.
  const clerkEnvCheck = validateClerkEnvironment();
  if (!clerkEnvCheck.ok && !dryRun) {
    console.error("[resend-access] Entorno Clerk inválido:", clerkEnvCheck.error);
    return NextResponse.json({ error: clerkEnvCheck.error }, { status: 500 });
  }

  // Resolver URL pública de la aplicación con validación de seguridad.
  const appUrlResult = getPublicAppUrl();
  if (!appUrlResult.ok && !dryRun) {
    console.error("[resend-access] URL pública inválida:", appUrlResult.error);
    return NextResponse.json({ error: appUrlResult.error }, { status: 500 });
  }
  const appUrl = appUrlResult.ok ? appUrlResult.url : "";

  // Resolver configuración de Resend; en dry run no bloqueamos para mostrar el diagnóstico.
  const resendClient = await resolveResendConfig();
  const resendConfigValid = resendClient.client !== null;
  if (!resendConfigValid && !dryRun) {
    return NextResponse.json(
      {
        error:
          resendClient.error ??
          "No se pudo enviar el correo porque el remitente no está configurado correctamente.",
      },
      { status: 500 },
    );
  }

  const tenantName = dbUser.tenants?.name ?? "tu empresa";
  const firstName = dbUser.first_name;
  const from = resendClient.from;
  const isClerkUser = userId.startsWith("user_");

  // CC al admin que ejecuta la acción.
  const adminEmail = await resolveAdminEmail();

  try {
    const client = await clerkClient();

    let destEmail: string;
    let signInUrl: string | null = null;

    if (isClerkUser) {
      const clerkUser = await client.users.getUser(userId);
      const primary = clerkUser.emailAddresses.find(
        (ea) => ea.id === clerkUser.primaryEmailAddressId,
      );
      destEmail = primary?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? "";

      if (!destEmail) {
        return NextResponse.json(
          { error: "No hay correo disponible para este usuario." },
          { status: 400 },
        );
      }

      if (!dryRun) {
        // Construir link de acceso usando el token de Clerk pero con el dominio de la app.
        // No usar tokenResult.url: apunta al dominio configurado en la instancia Clerk,
        // que puede ser localhost o un preview inválido si la instancia es de desarrollo.
        const tokenResult = await client.signInTokens.createSignInToken({
          expiresInSeconds: 604800,
          userId,
        });
        const ticketUrlResult = buildClerkTicketUrl(tokenResult.token);
        signInUrl = ticketUrlResult.ok ? ticketUrlResult.url : null;
        if (!ticketUrlResult.ok) {
          console.warn("[resend-access] No se pudo construir signInUrl:", ticketUrlResult.error);
        }
      } else {
        // Dry run: URL de referencia sin crear token real.
        signInUrl = `${appUrl}/sign-in?ticket=***dry-run***`;
      }
    } else {
      // Usuario pendiente — buscar invitación Clerk.
      const invitationsPage = await client.invitations.getInvitationList({ status: "pending" });
      const match = invitationsPage.data.find(
        (inv) => (inv.publicMetadata as Record<string, unknown>)?.localUserId === userId,
      );

      if (!match) {
        return NextResponse.json(
          {
            error:
              "No hay correo disponible para este usuario. Bórralo y vuelve a crearlo para reenviar el acceso.",
          },
          { status: 400 },
        );
      }

      destEmail = match.emailAddress;

      if (!dryRun) {
        // Revocar y recrear la invitación solo en envío real.
        try {
          await client.invitations.revokeInvitation(match.id);
        } catch {
          console.warn("[resend-access] No se pudo revocar invitación anterior, continuando.");
        }

        await client.invitations.createInvitation({
          emailAddress: destEmail,
          publicMetadata: match.publicMetadata as Record<string, unknown>,
          redirectUrl: `${appUrl}/sign-up`,
        });
      }

      signInUrl = `${appUrl}/sign-up?email=${encodeURIComponent(destEmail)}`;
    }

    // Dry run: devolver diagnóstico sin enviar correo.
    if (dryRun) {
      return buildDryRunResponse({
        adminEmail,
        appUrl,
        clerkEnvironmentValid: clerkEnvCheck.ok,
        configSource: resendClient.configSource,
        destEmail,
        from,
        resendConfigValid,
        signInUrl,
      });
    }

    const subject = `Reenvío de acceso a la plataforma — ${tenantName}`;
    const html = buildAccessHtml({ firstName, email: destEmail, tenantName, signInUrl });

    console.info("[resend-access] Enviando correo", {
      action: "resend_clerk_access",
      emailDomain: destEmail.split("@")[1],
      hasCC: Boolean(adminEmail),
      tenantId: tenant.id,
      userId,
    });

    // Envío directo. resendClient.client es non-null aquí porque el caso client=null
    // con dryRun=false retornó early arriba.
    const safeClient = resendClient.client!;
    const result = await safeClient.emails.send({
      from,
      to: [destEmail],
      ...(adminEmail ? { cc: [adminEmail] } : {}),
      subject,
      html,
    });

    if (result.error) {
      const message =
        typeof result.error.message === "string" ? result.error.message : "Error desconocido";
      console.error("[resend-access] Error de Resend", {
        action: "resend_clerk_access_error",
        error: message,
        userId,
      });
      return NextResponse.json(
        { error: `No fue posible enviar el correo: ${message}` },
        { status: 500 },
      );
    }

    console.info("[resend-access] Correo enviado correctamente", {
      action: "resend_clerk_access_success",
      resendId: result.data?.id,
      userId,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const detail = extractClerkErrorMessage(error);
    console.error("[resend-access] Error al reenviar acceso:", detail);
    return NextResponse.json(
      { error: "No se pudo reenviar el acceso. Revisa la configuración de Clerk." },
      { status: 500 },
    );
  }
}
