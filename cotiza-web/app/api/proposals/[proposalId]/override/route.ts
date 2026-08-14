import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { executeMarginOverride, grantMarginOverrideWindow } from "@/lib/db/proposals";
import { prisma } from "@/lib/db/prisma";
import { isForceIssuanceEligibleRole } from "@/lib/domain/proposal-issuance-gate";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

type RouteContext = {
  params: Promise<{ proposalId: string }>;
};

// Punto unico de autoridad para el override de propuestas bloqueadas por
// politica de margen -- reemplaza al mecanismo "Forzar emision" (basado en
// status/issuance_status, retirado). Solo Owner/Superadmin puede llamarlo.
//
// Sin targetUserId en el body: ejecuta el override de inmediato (B1).
// Con targetUserId: habilita una ventana de un solo uso para que el
// vendedor dueño de la propuesta la ejecute el mismo via
// POST .../override/execute (B2). El valor real de targetUserId que
// mande el cliente se ignora -- grantMarginOverrideWindow siempre deriva
// el destinatario de proposals.created_by_user_id, nunca de lo que
// mande el request.
export async function POST(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { proposalId } = await context.params;
  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`proposal:margin-override:${tenant.id}:${identity}`, 10, 60_000);

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
        event_type: "margin_override_denied",
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
      { error: "Solo Owner o Superadmin pueden forzar un override de politica de margen." },
      { status: 403 },
    );
  }

  if (!actorUserId) {
    return NextResponse.json({ error: "No se pudo identificar al usuario." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { reason?: string; targetUserId?: string } | null;
  const reason = body?.reason?.trim();

  if (!reason) {
    return NextResponse.json({ error: "El motivo es obligatorio para forzar un override." }, { status: 422 });
  }

  const approverRole: "owner" | "superadmin" = tenant.isSuperAdmin ? "superadmin" : "owner";
  const wantsWindow = Boolean(body?.targetUserId?.trim());

  try {
    if (wantsWindow) {
      const updated = await grantMarginOverrideWindow({
        approverRole,
        approverUserId: actorUserId,
        proposalId,
        reason,
        tenantId: tenant.id,
      });

      if (!updated) {
        return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
      }

      return NextResponse.json({ mode: "granted", ok: true, proposal: updated }, { status: 200 });
    }

    const updated = await executeMarginOverride({
      approverRole,
      approverUserId: actorUserId,
      executedByUserId: actorUserId,
      proposalId,
      reason,
      tenantId: tenant.id,
    });

    if (!updated) {
      return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ mode: "executed", ok: true, proposal: updated }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
