import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getCustomerEvidenceFile, WinError } from "@/lib/db/won-consolidation";

export async function GET(_request: Request, context: { params: Promise<{ proposalId: string; evidenceId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId || tenant.authMode !== "clerk") return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  const { proposalId, evidenceId } = await context.params;
  if (!z.uuid().safeParse(evidenceId).success) return NextResponse.json({ error: "Respaldo no encontrado" }, { status: 404 });
  try {
    const file = await getCustomerEvidenceFile(tenant.id, proposalId, evidenceId, { ...tenant, userId: tenant.userId });
    if (!file) return NextResponse.json({ error: "Respaldo no encontrado" }, { status: 404 });
    return new NextResponse(new Uint8Array(file.bytes), { headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="confirmacion"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`)}`,
      "Content-Length": String(file.bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof WinError ? error.message : "No se pudo consultar el respaldo" },
      { status: error instanceof WinError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
  }
}
