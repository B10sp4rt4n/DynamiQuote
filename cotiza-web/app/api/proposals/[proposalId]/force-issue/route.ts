import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isForceIssuanceEligibleRole } from "@/lib/domain/proposal-issuance-gate";
import { prisma } from "@/lib/db/prisma";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

type RouteContext = {
  params: Promise<{ proposalId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { proposalId } = await context.params;
  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`proposal:force-issue:${tenant.id}:${identity}`, 10, 60_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes, intenta en breve" },
      {
        headers: { "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString() },
        status: 429,
      },
    );
  }

  const actorUserId = tenant.userId;
  const actorRole = tenant.userRole;

  if (!isForceIssuanceEligibleRole(actorRole)) {
    await prisma.proposal_audit_events.create({
      data: {
        created_at: new Date(),
        event_hash: randomUUID(),
        event_id: randomUUID(),
        event_type: "proposal_force_issue_denied",
        payload: JSON.stringify({
          attemptedAt: new Date().toISOString(),
          attemptedBy: actorUserId,
          attemptedRole: actorRole,
        }),
        proposal_id: proposalId,
        tenant_id: tenant.id,
      },
    });

    return NextResponse.json(
      { error: "Solo Owner o Superadmin pueden forzar la emision de una propuesta sin aprobar." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const reason = body?.reason?.trim() || null;

  const proposal = await prisma.proposals.findFirst({
    select: { issuance_status: true, proposal_id: true, status: true },
    where: { proposal_id: proposalId, tenant_id: tenant.id },
  });

  if (!proposal) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }

  if (proposal.status === "draft" || proposal.status === "approved") {
    return NextResponse.json(
      { error: "No aplica forzar la emision en el estado actual de la propuesta." },
      { status: 422 },
    );
  }

  if (proposal.issuance_status === "force_pending") {
    return NextResponse.json(
      { error: "Ya hay un forzamiento pendiente de consumir para esta propuesta." },
      { status: 409 },
    );
  }

  const now = new Date();

  const consumed = await prisma.$transaction(async (tx) => {
    const updated = await tx.proposals.updateMany({
      data: { issuance_status: "force_pending" },
      where: { issuance_status: "normal", proposal_id: proposalId, tenant_id: tenant.id },
    });

    if (updated.count === 0) {
      return false;
    }

    await tx.proposal_audit_events.create({
      data: {
        created_at: now,
        event_hash: randomUUID(),
        event_id: randomUUID(),
        event_type: "proposal_force_issue_requested",
        payload: JSON.stringify({
          forcedAt: now.toISOString(),
          forcedBy: actorUserId,
          reason,
        }),
        proposal_id: proposalId,
        tenant_id: tenant.id,
      },
    });

    return true;
  });

  if (!consumed) {
    return NextResponse.json(
      { error: "Ya hay un forzamiento pendiente de consumir para esta propuesta." },
      { status: 409 },
    );
  }

  return NextResponse.json({ issuanceStatus: "force_pending", ok: true }, { status: 200 });
}
