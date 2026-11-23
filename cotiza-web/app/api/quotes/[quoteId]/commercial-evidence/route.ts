import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getCommercialEvidenceFile, listCommercialEvidence } from "@/lib/db/commercial-evidence";
import { isQuoteVisibleToViewer } from "@/lib/db/quotes";
import { isTenantCapabilityEnabled } from "@/lib/db/tenant-capabilities";
import { COMMERCIAL_EVIDENCE } from "@/lib/tenant-capabilities";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!await isTenantCapabilityEnabled(tenant.id, COMMERCIAL_EVIDENCE)) {
    return NextResponse.json({ error: "Evidencia comercial desactivada para esta empresa." }, { status: 403 });
  }
  const { quoteId } = await params;
  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  if (!await isQuoteVisibleToViewer(tenant.id, quoteId, tenant.userId, canSeeAll)) {
    return NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 });
  }
  const evidenceId = new URL(request.url).searchParams.get("evidenceId");
  const headers = { "Cache-Control": "private, no-store" };
  if (evidenceId === null) return NextResponse.json({ documents: await listCommercialEvidence(tenant.id, [quoteId]) }, { headers });
  const file = z.uuid().safeParse(evidenceId).success ? await getCommercialEvidenceFile(tenant.id, quoteId, evidenceId) : null;
  if (!file) return NextResponse.json({ error: "Evidencia no encontrada." }, { status: 404 });
  const filename = encodeURIComponent(file.filename.toWellFormed()).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`);
  return new Response(new Uint8Array(file.bytes), { headers: {
    ...headers,
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="evidencia.pdf"; filename*=UTF-8''${filename}`,
    "X-Content-Type-Options": "nosniff",
  } });
}
