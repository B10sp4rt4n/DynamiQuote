import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { renameQuoteForTenant } from "@/lib/db/quote-name";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { updateQuoteNameSchema } from "@/lib/validations/quotes";

export async function PATCH(request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rate = enforceRateLimit(`quotes:name:${tenant.id}:${getRequestIdentity(request, tenant.userId)}`, 30, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Demasiadas operaciones, intenta nuevamente en breve" },
    { status: 429, headers: { "Retry-After": Math.ceil((rate.resetAt - Date.now()) / 1000).toString() } });
  const parsed = updateQuoteNameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Escribe un nombre de cotización de 1 a 200 caracteres" }, { status: 422 });
  const { quoteId } = await params;
  const canSeeAll = tenant.isSuperAdmin || ["owner", "admin"].includes(tenant.userRole);
  try {
    const quote = await renameQuoteForTenant(tenant.id, quoteId, tenant.userId, canSeeAll, parsed.data.proposalName);
    if (!quote) return NextResponse.json({ error: "No se pudo guardar el nombre. Revisa que esta cotización siga en borrador y tengas acceso a ella." }, { status: 409 });
    return NextResponse.json({ quote });
  } catch {
    return NextResponse.json({ error: "No se pudo confirmar el nombre. Vuelve a intentarlo." }, { status: 503 });
  }
}
