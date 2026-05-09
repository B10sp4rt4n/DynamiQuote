import "server-only";

export type TestEmailTemplate = "alta" | "mantenimiento" | "promocion";

export type SendTestEmailPayload = {
  to: string;
  template: TestEmailTemplate;
  tenantName: string;
  customMessage?: string;
  customSubject?: string;
};

export type SendTestEmailResult = {
  sent: boolean;
  warning: string | null;
};

function getTemplateCopy(template: TestEmailTemplate): { title: string; body: string; cta: string } {
  if (template === "alta") {
    return {
      title: "Bienvenido a Cotiza",
      body: "Tu cuenta fue dada de alta correctamente. Ya puedes entrar para consultar cotizaciones, propuestas y paquetes de tu empresa.",
      cta: "Entrar a la plataforma",
    };
  }

  if (template === "mantenimiento") {
    return {
      title: "Aviso de mantenimiento programado",
      body: "Realizaremos mantenimiento preventivo para mejorar rendimiento y estabilidad. Durante este periodo algunos módulos podrían presentar intermitencia.",
      cta: "Ver estatus del sistema",
    };
  }

  return {
    title: "Promoción especial para tu equipo",
    body: "Tenemos una promoción activa para potenciar el uso de Cotiza en tu proceso comercial. Revisa beneficios y condiciones disponibles para tu empresa.",
    cta: "Ver promoción",
  };
}

function buildTestEmailHtml(payload: SendTestEmailPayload): string {
  const templateCopy = getTemplateCopy(payload.template);
  const message = payload.customMessage?.trim() || templateCopy.body;
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "https://dynami-quote.vercel.app";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${templateCopy.title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#fff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">
          <tr>
            <td style="background:#18181b;padding:28px 40px;">
              <p style="margin:0;color:#fff;font-size:20px;font-weight:600;letter-spacing:-0.3px;">Cotiza</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 24px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#18181b;">${templateCopy.title}</p>
              <p style="margin:0 0 18px;font-size:13px;color:#71717a;line-height:1.6;">Empresa: <strong>${payload.tenantName}</strong></p>
              <p style="margin:0 0 30px;font-size:15px;color:#52525b;line-height:1.7;">${message}</p>
              <a href="${appUrl}" style="display:inline-block;background:#18181b;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">${templateCopy.cta}</a>
            </td>
          </tr>
          <tr>
            <td style="background:#f4f4f5;padding:16px 40px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#71717a;text-align:center;">Mensaje de prueba enviado desde Configuración.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendTestEmail(payload: SendTestEmailPayload): Promise<SendTestEmailResult> {
  const apiKey = process.env["RESEND_API_KEY"]?.trim() || process.env["API_RESEND_API_KEY"]?.trim() || "";

  if (!apiKey) {
    return {
      sent: false,
      warning: "No hay API key de Resend configurada en Vercel (RESEND_API_KEY).",
    };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const configuredFrom = process.env["RESEND_FROM"]?.trim() || "";
    const from = configuredFrom.includes("@") ? configuredFrom : "Cotiza <onboarding@resend.dev>";

    const templateCopy = getTemplateCopy(payload.template);
    const subject = payload.customSubject?.trim() || `[Cotiza] ${templateCopy.title}`;

    const { error } = await resend.emails.send({
      from,
      to: [payload.to],
      subject,
      html: buildTestEmailHtml(payload),
    });

    if (error) {
      const message = typeof error.message === "string" ? error.message : "Error desconocido al enviar correo";
      const domainHint = message.includes("verify a domain")
        ? "Resend requiere verificar dominio para enviar a correos externos."
        : null;
      return {
        sent: false,
        warning: domainHint ?? message,
      };
    }

    return {
      sent: true,
      warning: null,
    };
  } catch {
    return {
      sent: false,
      warning: "Excepción al enviar correo de prueba con Resend.",
    };
  }
}
