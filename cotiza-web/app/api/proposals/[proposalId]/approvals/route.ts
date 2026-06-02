import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { registerProposalApprovalByTenant } from "@/lib/db/proposals";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { registerProposalApprovalSchema } from "@/lib/validations/proposals";

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
  const rateLimit = enforceRateLimit(`proposal:approval:${tenant.id}:${proposalId}:${identity}`, 20, 60_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes, intenta en breve" },
      {
        headers: { "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString() },
        status: 429,
      },
    );
  }

  const parsed = registerProposalApprovalSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalido", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const proposal = await registerProposalApprovalByTenant(
      tenant.id,
      proposalId,
      parsed.data,
      {
        isSuperAdmin: tenant.isSuperAdmin,
        userId: tenant.userId,
        userRole: tenant.userRole,
      },
    );

    if (!proposal) {
      return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ proposal }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
