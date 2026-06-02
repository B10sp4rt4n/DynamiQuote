import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getProposalWorkflowByTenant } from "@/lib/db/proposals";
import { ProposalPdfDocument } from "@/lib/pdf/proposal-document";
import { enforceRateLimit } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ proposalId: string }>;
};

function looksLikeOpaqueUserId(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return /^(ser|user|sess|org)_[A-Za-z0-9]+$/.test(value.trim());
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_");
}

export async function GET(_: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { proposalId } = await context.params;
  const rateLimit = enforceRateLimit(`pdf:download:${tenant.id}:${proposalId}`, 30, 60_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas descargas, intenta nuevamente en breve" },
      {
        headers: {
          "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
        },
        status: 429,
      },
    );
  }

  const proposal = await getProposalWorkflowByTenant(tenant.id, proposalId);

  if (!proposal) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }

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

  const document = ProposalPdfDocument({
    proposal: normalizedProposal,
    tenantName: tenant.name,
  });

  const pdfBuffer = await renderToBuffer(document);
  const filename = sanitizeFilename(proposal.formal?.proposalNumber ?? proposal.proposalId);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}
