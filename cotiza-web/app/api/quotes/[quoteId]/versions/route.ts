import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getQuoteVersionsByTenant } from "@/lib/db/quote-editor";
import { isQuoteVisibleToViewer } from "@/lib/db/quotes";
import { quoteVersionsResponseSchema } from "@/lib/validations/quote-editor-response";

type RouteContext = {
  params: Promise<{ quoteId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { quoteId } = await context.params;

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const visible = await isQuoteVisibleToViewer(tenant.id, quoteId, tenant.userId, canSeeAll);

  if (!visible) {
    return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
  }

  const versions = await getQuoteVersionsByTenant(tenant.id, quoteId);

  if (!versions) {
    return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
  }

  const payload = quoteVersionsResponseSchema.parse(versions);

  return NextResponse.json(payload);
}
