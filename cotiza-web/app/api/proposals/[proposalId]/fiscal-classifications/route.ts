import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getProposalWorkflowByTenant, isProposalVisibleToViewer } from "@/lib/db/proposals";
import { getProposalInvoiceStatusByTenant } from "@/lib/db/proposal-invoices";
import { classificationMemory, recordClassification } from "@/lib/db/fiscal-classifications";
import { invoiceBasisFingerprint } from "@/lib/domain/invoice-profile";
import { confirmClassificationSchema, SALE_NATURES, type SaleNature } from "@/lib/domain/fiscal-classification";
import { isDigestorFiscalEnabledForTenant, searchSatCatalog, validateSatClassifications } from "@/lib/integrations/digestor-fiscal";

type Context = { params: Promise<{ proposalId: string }> };
async function scope(context: Context) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (!isDigestorFiscalEnabledForTenant(tenant.id)) return { error: NextResponse.json({ error: "La facturación no está habilitada para esta empresa" }, { status: 403 }) };
  const { proposalId } = await context.params;
  const all = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  if (!await isProposalVisibleToViewer(tenant.id, proposalId, tenant.userId, all)) return { error: NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 }) };
  const proposal = await getProposalWorkflowByTenant(tenant.id, proposalId);
  if (!proposal) return { error: NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 }) };
  return { tenant, proposalId, proposal };
}

export async function GET(request: Request, context: Context) {
  const access = await scope(context);
  if (access.error) return access.error;
  const { tenant, proposal } = access;
  const params = new URL(request.url).searchParams;
  const nature = params.get("nature") ?? "other";
  if (!Object.hasOwn(SALE_NATURES, nature)) return NextResponse.json({ error: "Selecciona el tipo de operación" }, { status: 422 });
  const item = proposal.items.find(row => row.itemNumber === Number(params.get("itemNumber")));
  if (!item) return NextResponse.json({ error: "Partida no encontrada" }, { status: 404 });
  try {
    if (params.get("mode") === "memory") {
      const memory = await classificationMemory(tenant.id, item, nature as SaleNature);
      if (!memory) return NextResponse.json({ memory: null });
      const validation = await validateSatClassifications([{ itemNumber: item.itemNumber, ...memory }].map(({ itemNumber, satProductCode, unitCode }) => ({ itemNumber, satProductCode, unitCode })));
      return NextResponse.json({ memory, validation });
    }
    const kind = params.get("kind"), q = params.get("q")?.trim();
    if ((kind !== "product" && kind !== "unit") || !q || q.length > 200) return NextResponse.json({ error: "Busca por descripción o clave (máximo 200 caracteres)" }, { status: 422 });
    return NextResponse.json(await searchSatCatalog(kind, q, nature as SaleNature));
  } catch {
    return NextResponse.json({ error: "No se pudo consultar el catálogo SAT. Intenta nuevamente" }, { status: 503 });
  }
}

export async function POST(request: Request, context: Context) {
  const access = await scope(context);
  if (access.error) return access.error;
  const parsed = confirmClassificationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revisa la partida, el tipo de operación y ambas claves antes de confirmar" }, { status: 422 });
  const { tenant, proposalId, proposal } = access, input = parsed.data;
  const item = proposal.items.find(row => row.itemNumber === input.itemNumber);
  if (!item) return NextResponse.json({ error: "Partida no encontrada" }, { status: 404 });
  if (invoiceBasisFingerprint(proposal) !== input.expectedFingerprint) return NextResponse.json({ error: "La propuesta cambió. Recarga y revisa la clasificación" }, { status: 409 });
  const invoice = await getProposalInvoiceStatusByTenant(tenant.id, proposalId);
  if (!invoice) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  if (invoice.uuid || invoice.stampedAt || invoice.status === "stamping" || invoice.status === "stamped") return NextResponse.json({ error: "El documento ya fue emitido o tiene una emisión pendiente" }, { status: 409 });
  try {
    const validation = await validateSatClassifications([{ itemNumber: input.itemNumber, satProductCode: input.satProductCode, unitCode: input.unitCode }], input.catalogVersion);
    if (!validation.valid) return NextResponse.json({ error: validation.error ?? "Alguna clave no existe o no está vigente" }, { status: validation.error ? 409 : 422 });
    const event = await recordClassification({ tenantId: tenant.id, actorUserId: tenant.userId!, proposalId, item,
      fingerprint: input.expectedFingerprint, nature: input.nature, satProductCode: input.satProductCode,
      unitCode: input.unitCode, catalogVersion: input.catalogVersion, remember: input.remember });
    return NextResponse.json({ classification: { itemNumber: input.itemNumber, satProductCode: input.satProductCode,
      unitCode: input.unitCode, catalogVersion: input.catalogVersion, classificationEventId: event.id }, confirmedAt: event.confirmedAt });
  } catch {
    return NextResponse.json({ error: "No se pudo confirmar la clasificación. Intenta nuevamente" }, { status: 503 });
  }
}
