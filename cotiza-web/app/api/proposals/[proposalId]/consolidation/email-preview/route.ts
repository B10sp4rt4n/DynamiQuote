import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getWinView, WinError } from "@/lib/db/won-consolidation";
import { CustomerEvidenceError } from "@/lib/db/customer-evidence";
import { readCustomerEvidenceRequest } from "@/lib/customer-evidence-request";
import { parseCustomerEmail } from "@/lib/customer-email";
import { enforceRateLimit } from "@/lib/utils/rate-limit";

export async function POST(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId || tenant.authMode !== "clerk") return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  if (request.headers.get("X-Tenant-Context") !== tenant.id) return NextResponse.json({ error: "La empresa activa cambió. Recarga" }, { status: 409 });
  if (!enforceRateLimit(`customer-email:${tenant.id}:${tenant.userId}`, 20, 60_000).allowed) return NextResponse.json({ error: "Demasiadas lecturas. Intenta en breve" }, { status: 429 });
  try {
    const proposalId = (await context.params).proposalId;
    const view = await getWinView(tenant.id, proposalId, { ...tenant, userId: tenant.userId });
    if (!view.canRecordAcceptance) return NextResponse.json({ error: "La propuesta no admite registrar una nueva aceptación" }, { status: 403 });
    const { input, file } = await readCustomerEvidenceRequest(request);
    if (!z.object({ action: z.literal("preview-email") }).strict().safeParse(input).success || file?.mimeType !== "message/rfc822") {
      return NextResponse.json({ error: "Adjunta el correo original en formato .eml" }, { status: 422 });
    }
    const preview = await parseCustomerEmail(file.bytes);
    return NextResponse.json({ tenantId: tenant.id, proposalId, ...preview }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof WinError || error instanceof CustomerEvidenceError;
    return NextResponse.json({ error: known ? error.message : "No se pudo leer el correo" }, { status: known ? error.status : error instanceof SyntaxError ? 422 : 500, headers: { "Cache-Control": "no-store" } });
  }
}
