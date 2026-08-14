import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  getProposalWorkflowByTenant,
  isProposalVisibleToViewer,
  updateProposalWorkflowByTenant,
} from "@/lib/db/proposals";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { updateProposalWorkflowSchema } from "@/lib/validations/proposals";

type RouteContext = {
  params: Promise<{ proposalId: string }>;
};

function looksLikeOpaqueUserId(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return /^(ser|user|sess|org)_[A-Za-z0-9]+$/.test(value.trim());
}

export async function GET(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { proposalId } = await context.params;
  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`proposal:get:${tenant.id}:${proposalId}:${identity}`, 60, 60_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes, intenta en breve" },
      {
        headers: { "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString() },
        status: 429,
      },
    );
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const visible = await isProposalVisibleToViewer(tenant.id, proposalId, tenant.userId, canSeeAll);

  if (!visible) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }

  const proposal = await getProposalWorkflowByTenant(tenant.id, proposalId, { viewerUserId: tenant.userId });

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

  return NextResponse.json({ proposal: normalizedProposal }, { status: 200 });
}

export async function PUT(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { proposalId } = await context.params;
  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`proposal:put:${tenant.id}:${proposalId}:${identity}`, 20, 60_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes, intenta en breve" },
      {
        headers: { "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString() },
        status: 429,
      },
    );
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const visible = await isProposalVisibleToViewer(tenant.id, proposalId, tenant.userId, canSeeAll);

  if (!visible) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }

  const parsed = updateProposalWorkflowSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalido", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // issuerCompany/issuerEmail ya no son editables por propuesta -- se ignora
  // cualquier valor que mande el cliente, igual que issuerContactName (que
  // ni siquiera esta en el schema). El emisor lo define el perfil del
  // tenant y el usuario autenticado, no el formulario de la propuesta.
  const sanitizedInput = { ...parsed.data, issuerCompany: undefined, issuerEmail: undefined };

  try {
    const updated = await updateProposalWorkflowByTenant(tenant.id, proposalId, sanitizedInput, {
      isSuperAdmin: tenant.isSuperAdmin,
      userId: tenant.userId,
      userRole: tenant.userRole,
    });

    if (!updated) {
      return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ proposal: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
