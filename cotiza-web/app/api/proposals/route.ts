import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { createProposalFromQuoteByTenant } from "@/lib/db/proposals";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { createProposalFromQuoteSchema } from "@/lib/validations/proposals";

export async function POST(request: Request) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`proposal:create:${tenant.id}:${identity}`, 20, 60_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas operaciones, intenta nuevamente en breve" },
      {
        headers: {
          "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
        },
        status: 429,
      },
    );
  }

  const parsed = createProposalFromQuoteSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const proposal = await createProposalFromQuoteByTenant(tenant.id, parsed.data);

  if (!proposal) {
    return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
  }

  return NextResponse.json({ proposal }, { status: 201 });
}