import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { setProposalRelationship } from "@/lib/db/proposal-relationships";
import { proposalRelationshipInputSchema } from "@/lib/domain/proposal-relationship";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

export async function PATCH(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rate = enforceRateLimit(`proposal-relationship:${tenant.id}:${getRequestIdentity(request, tenant.userId)}`, 30, 60000);
  if (!rate.allowed) return NextResponse.json({ error: "Intenta en un momento" }, { status: 429 });

  const parsed = proposalRelationshipInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revisa la relación y la propuesta que quieres contar." }, { status: 422 });
  const { opportunityId } = await params;
  const canSeeAll = tenant.isSuperAdmin || ["owner", "admin"].includes(tenant.userRole);
  const result = await setProposalRelationship(tenant.id, opportunityId, { userId: tenant.userId, canSeeAll }, parsed.data).catch(() => "error" as const);
  if (result === "updated") return NextResponse.json({ ok: true });
  if (result === "not_found") return NextResponse.json({ error: "Oportunidad o propuestas fuera de tu vista." }, { status: 404 });
  if (result === "legacy") return NextResponse.json({ error: "Las opciones de este negocio se gestionan en Opción en negociación." }, { status: 409 });
  if (result === "decided") return NextResponse.json({ error: "La relación solo se puede editar con el negocio abierto y antes de registrar un desenlace o un documento fiscal." }, { status: 409 });
  if (result === "error") return NextResponse.json({ error: "No se pudo guardar la relación. Intenta de nuevo." }, { status: 500 });
  return NextResponse.json({ error: "La oportunidad o sus propuestas cambiaron. Actualiza la ficha y vuelve a intentarlo." }, { status: 409 });
}
