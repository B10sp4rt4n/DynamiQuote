import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isTenantCapabilityEnabled, THREATDOWN_PDF_IMPORT } from "@/lib/db/tenant-capabilities";
import { isQuoteVisibleToViewer } from "@/lib/db/quotes";
import { createDraftFromQuoteInput } from "@/lib/db/quote-input";
import { readThreatDownPdf } from "@/lib/import/threatdown-pdf";
import { priceThreatDownQuote } from "@/lib/domain/threatdown-quote";
import { QuoteInputError } from "@/lib/domain/quote-input";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;
const amount = z.string().trim().min(1).transform(Number).pipe(z.number().finite());
const applySchema = z.object({
  operationId: z.string().uuid(), expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  exchangeRate: amount.pipe(z.number().positive().max(1000)),
  marginPct: amount.pipe(z.number().min(0).lt(100)), confirmed: z.literal("yes"),
});

export async function POST(request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!await isTenantCapabilityEnabled(tenant.id, THREATDOWN_PDF_IMPORT)) {
    return NextResponse.json({ error: "La importación de PDF ThreatDown no está habilitada para esta empresa. Contacta a superadmin." }, { status: 403 });
  }
  const { quoteId } = await params;
  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  if (!await isQuoteVisibleToViewer(tenant.id, quoteId, tenant.userId, canSeeAll)) {
    return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  }
  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rate = enforceRateLimit(`td-pdf:${tenant.id}:${identity}`, 10, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Espera un momento antes de volver a leer el PDF." },
    { status: 429, headers: { "Retry-After": String(Math.ceil((rate.resetAt - Date.now()) / 1000)) } });
  if (Number(request.headers.get("content-length") ?? 0) > 3 * 1024 * 1024 + 16384) {
    return NextResponse.json({ error: "El PDF supera el límite de 3 MB." }, { status: 413 });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    const action = form.get("action");
    if (action !== "preview" && action !== "apply") throw new QuoteInputError("Acción inválida.");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pdf") || file.size === 0 || file.size > 3 * 1024 * 1024) {
      throw new QuoteInputError("Adjunta un PDF de ThreatDown de hasta 3 MB.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const parsed = action === "apply" ? applySchema.safeParse(Object.fromEntries(form)) : null;
    if (parsed && !parsed.success) throw new QuoteInputError("Revisa el margen, tipo de cambio y confirmación.");
    if (parsed?.success && parsed.data.expectedHash !== fileHash) throw new QuoteInputError("El archivo cambió. Vuelve a revisar la vista previa.", 409);
    const source = await readThreatDownPdf(bytes);
    if (!parsed?.success) return NextResponse.json({ source, fileHash });
    const { exchangeRate, marginPct, operationId } = parsed.data;
    const priced = priceThreatDownQuote(source, exchangeRate, marginPct);
    const result = await createDraftFromQuoteInput({ tenantId: tenant.id, quoteId, operationId,
      mode: "replace", lines: priced.lines,
      source: { kind: "threatdown-pdf", id: source.quoteNumber, revision: fileHash,
        commercial: { currency: "USD", targetCurrency: "MXN", exchangeRate, marginPct,
          expiresOn: source.expiresOn, startsOn: source.startsOn, endsOn: source.endsOn,
          termMonths: source.termMonths, preliminary: source.preliminary, netTotal: source.netTotal,
          reviewedBy: tenant.userId,
          lines: source.lines.map(({ sku, quantity, costUnit, netTotal }) => ({ sku, quantity, costUnit, netTotal })) } },
    });
    if (!result) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof QuoteInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    // Parsing/password/encoding failures never expose PDF contents or credentials.
    console.error("[threatdown:import]", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "No se pudo procesar el PDF. Usa una cotización digital sin contraseña y vuelve a intentarlo." }, { status: 422 });
  }
}
