import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { prisma } from "@/lib/db/prisma";
import { getProposalWorkflowByTenant, updateProposalWorkflowByTenant } from "@/lib/db/proposals";
import { resolveResendConfig } from "@/lib/email/resend";
import { ProposalPdfDocument } from "@/lib/pdf/proposal-document";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

type RouteContext = {
  params: Promise<{ proposalId: string }>;
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

async function resolveTenantOwnerEmail(tenantId: string): Promise<string | null> {
  try {
    const ownerRow = await prisma.app_users.findFirst({
      select: { user_id: true },
      where: { role: "owner", tenant_id: tenantId, active: true },
    });
    if (!ownerRow) return null;

    const client = await clerkClient();
    const clerkUser = await client.users.getUser(ownerRow.user_id);
    const primary = clerkUser.emailAddresses.find(
      (ea) => ea.id === clerkUser.primaryEmailAddressId,
    );
    return sanitizeEmail(primary?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress);
  } catch {
    return null;
  }
}

function buildSellerProposalHtml(input: {
  proposalNumber: string;
  issuerCompany: string;
  recipientCompany: string;
  sellerName: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Propuesta lista para enviar</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;color:#27272a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#18181b;padding:22px 28px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Propuesta lista para enviar</p>
              <p style="margin:8px 0 0;color:#d4d4d8;font-size:13px;">Referencia: <strong>${input.proposalNumber}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 28px;">
              <p style="margin:0 0 14px;font-size:15px;">Hola <strong>${input.sellerName}</strong>,</p>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.65;">
                Tu propuesta para <strong>${input.recipientCompany}</strong> ha sido autorizada y el PDF está adjunto.
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;">
                Revisa el documento antes de enviarlo al prospecto.
              </p>
              <p style="margin:0;font-size:14px;color:#52525b;">— <strong>${input.issuerCompany}</strong> · Cotiza</p>
            </td>
          </tr>
          <tr>
            <td style="background:#fafafa;border-top:1px solid #e4e4e7;padding:14px 28px;">
              <p style="margin:0;font-size:12px;color:#71717a;">Este mensaje es de uso interno. No reenviar al cliente.</p>
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

  // Ignorar cualquier email del body — el destino se resuelve server-side
  await request.json().catch(() => null);

  const proposal = await getProposalWorkflowByTenant(tenant.id, proposalId);

  if (!proposal) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }

  // Resolver el correo del vendedor: sesión Clerk activa → issuerEmail del formulario
  const sessionEmail = await resolveCurrentUserEmail();
  const formIssuerEmail = sanitizeEmail(proposal.formal?.issuerEmail);
  const sellerEmail = sessionEmail ?? formIssuerEmail;

  if (!sellerEmail) {
    return NextResponse.json(
      { error: "No se pudo resolver el correo del vendedor. Verifica tu sesión o el campo Correo emisor." },
      { status: 400 },
    );
  }

  const proposalNumber = proposal.formal?.proposalNumber ?? proposal.proposalId;
  const issuerCompany = proposal.formal?.issuerCompany ?? tenant.name;
  const recipientCompany = proposal.formal?.recipientCompany ?? "Cliente";
  const subjectBase = proposal.formal?.subject ?? proposalNumber;
  const from = resendClient.from;

  const issuerContact = proposal.formal?.issuerContactName?.trim().toLowerCase() ?? "";
  const shouldUseSessionName =
    Boolean(tenant.userDisplayName) &&
    (issuerContact.length === 0 || issuerContact === "sin asignar" || looksLikeOpaqueUserId(issuerContact));

  const sellerName = shouldUseSessionName
    ? (tenant.userDisplayName ?? proposal.formal?.issuerContactName ?? "Vendedor")
    : (proposal.formal?.issuerContactName ?? "Vendedor");

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

  // Resolver email del owner para copia — sin bloquear si no está disponible
  const ownerEmail = await resolveTenantOwnerEmail(tenant.id);
  const ccRecipients = Array.from(
    new Set([ownerEmail].filter((e): e is string => Boolean(e && e !== sellerEmail))),
  );

  const html = buildSellerProposalHtml({
    issuerCompany,
    proposalNumber,
    recipientCompany,
    sellerName,
  });

  const result = await resendClient.client.emails.send({
    attachments: [pdfAttachment],
    ...(ccRecipients.length > 0 ? { cc: ccRecipients } : {}),
    from,
    html,
    subject: `[${proposalNumber}] Propuesta lista — ${recipientCompany}`,
    to: [sellerEmail],
  });

  if (result.error) {
    const message = typeof result.error.message === "string"
      ? result.error.message
      : "Error desconocido al enviar correo";
    return NextResponse.json(
      { error: `No fue posible enviar el correo: ${message}` },
      { status: 500 },
    );
  }

  // Transicionar a "sent" para registrar que la propuesta fue despachada.
  await updateProposalWorkflowByTenant(tenant.id, proposalId, { status: "sent" }).catch(() => null);

  return NextResponse.json({ ok: true, success: true }, { status: 200 });
}
