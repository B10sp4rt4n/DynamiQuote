import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { executeMarginOverride, getLatestMarginOverrideGrant } from "@/lib/db/proposals";
import { prisma } from "@/lib/db/prisma";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

type RouteContext = {
  params: Promise<{ proposalId: string }>;
};

// Lo dispara el vendedor dueño de la propuesta para ejecutar una ventana de
// override que un Owner/Superadmin le habilito (ver POST .../override).
// Sin chequeo de rol: la autorizacion es exclusivamente que el usuario que
// llama coincida con proposals.margin_override_target_user_id -- por eso
// cualquier rol puede llegar aqui, incluido "user" (el vendedor tipico).
// El motivo y quien autorizo se recuperan del evento de habilitacion
// (getLatestMarginOverrideGrant), no de este request.
export async function POST(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { proposalId } = await context.params;
  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`proposal:margin-override-execute:${tenant.id}:${identity}`, 10, 60_000);

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

  if (!actorUserId) {
    return NextResponse.json({ error: "No se pudo identificar al usuario." }, { status: 401 });
  }

  const proposal = await prisma.proposals.findFirst({
    select: { margin_override_target_user_id: true },
    where: { proposal_id: proposalId, tenant_id: tenant.id },
  });

  if (!proposal) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }

  if (proposal.margin_override_target_user_id !== actorUserId) {
    return NextResponse.json(
      { error: "No hay una ventana de override habilitada para tu usuario en esta propuesta." },
      { status: 403 },
    );
  }

  const grant = await getLatestMarginOverrideGrant(tenant.id, proposalId);

  if (!grant) {
    return NextResponse.json(
      { error: "No se encontro el registro de la ventana de override." },
      { status: 409 },
    );
  }

  try {
    const updated = await executeMarginOverride({
      approverRole: grant.approverRole,
      approverUserId: grant.approverUserId,
      executedByUserId: actorUserId,
      proposalId,
      reason: grant.reason,
      tenantId: tenant.id,
    });

    if (!updated) {
      return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, proposal: updated }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
