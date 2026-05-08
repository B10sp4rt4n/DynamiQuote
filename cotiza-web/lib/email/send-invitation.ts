import "server-only";

export type InvitationEmailPayload = {
  to: string;
  firstName: string;
  tenantName: string;
  inviterName: string;
  signUpUrl: string;
};

function buildInvitationHtml(payload: InvitationEmailPayload): string {
  const { firstName, tenantName, inviterName, signUpUrl } = payload;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invitación a ${tenantName}</title>
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
                <strong>${inviterName}</strong> te ha invitado a usar
                <strong>Cotiza</strong> como parte del equipo de
                <strong>${tenantName}</strong>.
              </p>
              <p style="margin:0 0 32px;font-size:15px;color:#52525b;line-height:1.6;">
                Crea tu cuenta con este correo para acceder de inmediato a
                cotizaciones, propuestas y paquetes de tu empresa.
              </p>
              <a href="${signUpUrl}"
                 style="display:inline-block;background:#18181b;color:#fff;font-size:14px;
                        font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">
                Crear mi cuenta →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 36px;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                Si no esperabas esta invitación puedes ignorar este correo.
                El enlace es válido por 7 días.
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

export async function sendInvitationEmail(payload: InvitationEmailPayload): Promise<boolean> {
  const apiKey =
    process.env["RESEND_API_KEY"]?.trim() || process.env["API_RESEND_API_KEY"]?.trim() || "";

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY/API_RESEND_API_KEY no configurada, correo de invitación omitido.");
    return false;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const configuredFrom = process.env["RESEND_FROM"]?.trim() || "";
    const from = configuredFrom.includes("@")
      ? configuredFrom
      : "Cotiza <onboarding@resend.dev>";

    const { error } = await resend.emails.send({
      from,
      to: [payload.to],
      subject: `${payload.inviterName} te invitó a ${payload.tenantName} en Cotiza`,
      html: buildInvitationHtml(payload),
    });

    if (error) {
      console.error("[email] Error enviando invitación:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[email] Excepción enviando invitación:", err);
    return false;
  }
}
