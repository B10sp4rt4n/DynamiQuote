import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getProposalWorkflowByTenant } from "@/lib/db/proposals";
import { resolveResendConfig } from "@/lib/email/resend";
import { ProposalPdfDocument } from "@/lib/pdf/proposal-document";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

type RouteContext = {
  params: Promise<{ proposalId: string }>;
};

type SendEmailPayload = {
  recipientEmail?: string;
};

function sanitizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed) ? trimmed : null;
}

function looksLikeOpaqueUserId(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return /^(ser|user|sess|org)_[A-Za-z0-9]+$/.test(value.trim());
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_");
}

async function resolveCurrentUserEmail(): Promise<string | null> {
  try {
    const { sessionClaims } = await auth();
    const claimRecord = (sessionClaims ?? {}) as { email?: unknown };
    const email = typeof claimRecord.email === "string" ? claimRecord.email : null;
    return sanitizeEmail(email);
  } catch {
    return null;
  }
}

function buildAuthorizedProposalHtml(input: {
  proposalNumber: string;
  issuerCompany: string;
  recipientCompany: string;
  recipientContactName: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Propuesta autorizada</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;color:#27272a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#18181b;padding:22px 28px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Propuesta autorizada</p>
              <p style="margin:8px 0 0;color:#d4d4d8;font-size:13px;">Referencia: <strong>${input.proposalNumber}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 28px;">
              <p style="margin:0 0 14px;font-size:15px;">Hola <strong>${input.recipientContactName}</strong>,</p>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.65;">
                Adjuntamos la propuesta comercial autorizada para <strong>${input.recipientCompany}</strong>.
              </p>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.65;">
                El documento incluye alcance, condiciones comerciales y anexos técnicos para su revisión final.
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;">
                Quedamos atentos a su confirmación o comentarios.
              </p>
              <p style="margin:0;font-size:14px;color:#52525b;">Saludos,<br/><strong>${input.issuerCompany}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="background:#fafafa;border-top:1px solid #e4e4e7;padding:14px 28px;">
              <p style="margin:0;font-size:12px;color:#71717a;">Mensaje generado automáticamente por Cotiza.</p>
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

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { proposalId } = await context.params;
  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`email:send:${tenant.id}:${proposalId}:${identity}`, 5, 3600_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos de envío. Intenta más tarde." },
      {
        headers: {
          "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
        },
        status: 429,
      },
    );
  }

  const resendClient = await resolveResendConfig();
  if (!resendClient.client) {
    return NextResponse.json({ error: resendClient.error }, { status: 500 });
  }

  const payload = (await request.json().catch(() => null)) as SendEmailPayload | null;
  const recipientEmail = sanitizeEmail(payload?.recipientEmail);

  if (!recipientEmail) {
    return NextResponse.json(
      { error: "Correo del destinatario inválido o no proporcionado" },
      { status: 400 },
    );
  }

  const proposal = await getProposalWorkflowByTenant(tenant.id, proposalId);

  if (!proposal) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }

  const proposalNumber = proposal.formal?.proposalNumber ?? proposal.proposalId;
  const issuerCompany = proposal.formal?.issuerCompany ?? tenant.name;
  const recipientCompany = proposal.formal?.recipientCompany ?? "Cliente";
  const recipientContactName = proposal.formal?.recipientContactName || "Equipo cliente";
  const subjectBase = proposal.formal?.subject ?? proposalNumber;
  const from = resendClient.from;

  const issuerContact = proposal.formal?.issuerContactName?.trim().toLowerCase() ?? "";
  const shouldUseSessionName =
    Boolean(tenant.userDisplayName) &&
    (issuerContact.length === 0 || issuerContact === "sin asignar" || looksLikeOpaqueUserId(issuerContact));

  const normalizedProposal = shouldUseSessionName
    ? {
        ...proposal,
        formal: proposal.formal
          ? {
              ...proposal.formal,
              issuerContactName: tenant.userDisplayName ?? proposal.formal.issuerContactName,
            }
          : proposal.formal,
        salesOwner: tenant.userDisplayName ?? proposal.salesOwner,
      }
    : proposal;

  const pdfDocument = ProposalPdfDocument({
    proposal: normalizedProposal,
    tenantName: tenant.name,
  });
  const pdfBuffer = await renderToBuffer(pdfDocument);
  const attachmentFilename = `${sanitizeFilename(proposalNumber)}.pdf`;
  const pdfAttachment = {
    content: Buffer.from(pdfBuffer),
    contentType: "application/pdf",
    filename: attachmentFilename,
  };

  const html = buildAuthorizedProposalHtml({
    issuerCompany,
    proposalNumber,
    recipientCompany,
    recipientContactName,
  });

  const result = await resendClient.client.emails.send({
    attachments: [
      pdfAttachment,
    ],
    from,
    html,
    subject: `Propuesta autorizada: ${subjectBase}`,
    to: [recipientEmail],
  });

  if (result.error) {
    const message = typeof result.error.message === "string"
      ? result.error.message
      : "Error desconocido al enviar correo";
    return NextResponse.json(
      { error: `No fue posible enviar el correo al cliente: ${message}` },
      { status: 500 },
    );
  }

  const userEmail = await resolveCurrentUserEmail();
  if (userEmail && userEmail !== recipientEmail) {
    await resendClient.client.emails.send({
      attachments: [
        pdfAttachment,
      ],
      from,
      html: `<p>Se envio la propuesta <strong>${proposalNumber}</strong> a <strong>${recipientEmail}</strong>.</p>`,
      subject: `[Copia] Propuesta autorizada: ${subjectBase}`,
      to: [userEmail],
    });
  }

  return NextResponse.json({ ok: true, success: true }, { status: 200 });
}
