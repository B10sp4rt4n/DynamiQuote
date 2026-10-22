import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { createPackageFromQuote } from "@/lib/db/packages";
import { isQuoteVisibleToViewer } from "@/lib/db/quotes";
import { QuoteInputError } from "@/lib/domain/quote-input";
import { createPackageFromQuoteSchema } from "@/lib/validations/packages";
import { enforceRateLimit } from "@/lib/utils/rate-limit";

export async function POST(request: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const limit = enforceRateLimit(`templates:save:${tenant.id}:${tenant.userId}`, 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Demasiadas solicitudes. Intenta en breve." }, { status: 429 });
  const parsed = createPackageFromQuoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revisa el nombre y la cotización de origen." }, { status: 422 });
  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  if (!await isQuoteVisibleToViewer(tenant.id, parsed.data.quoteId, tenant.userId, canSeeAll)) {
    return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  }
  try {
    const pkg = await createPackageFromQuote(tenant.id, tenant.userId, parsed.data);
    if (!pkg) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    return NextResponse.json({ package: pkg }, { status: 201 });
  } catch (error) {
    if (error instanceof QuoteInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[templates:save]", error);
    return NextResponse.json({ error: "No se pudo guardar la plantilla. Puedes reintentar." }, { status: 500 });
  }
}
