import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { syncProposalFromQuote } from "@/lib/db/proposal-quote-sync";
import { enforceRateLimit } from "@/lib/utils/rate-limit";
export async function POST(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { proposalId } = await context.params;
  if (!enforceRateLimit(`proposal:sync:${tenant.id}:${tenant.userId}:${proposalId}`, 10, 60_000).allowed)
    return NextResponse.json({ error: "Demasiadas solicitudes, intenta en breve" }, { status: 429 });
  const parsed = z.object({ expectedToken: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Recarga la propuesta antes de actualizar sus partidas" }, { status: 422 });
  const result = await syncProposalFromQuote(tenant.id, proposalId,
    { userId: tenant.userId, canSeeAll: tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin" }, parsed.data.expectedToken);
  if (result === "updated" || result === "unchanged") return NextResponse.json({ result });
  const errors = { not_found: "Propuesta no encontrada", forbidden: "No tienes permiso para actualizar esta propuesta", not_draft: "Reabre la propuesta a borrador antes de actualizar desde la cotización",
    fiscal_document: "La propuesta ya tiene preparación fiscal. Revisa su documento fiscal antes de cambiar las partidas", conflict: "La propuesta cambió. Recarga antes de actualizar", missing_quote: "No se encontró la cotización original con partidas válidas" };
  return NextResponse.json({ error: errors[result] }, { status: result === "not_found" ? 404 : result === "forbidden" ? 403 : 409 });
}
