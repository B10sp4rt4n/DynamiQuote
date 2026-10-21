import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { ProposalKpiPdfDocument } from "@/lib/pdf/proposal-kpi-document";
import { getProposalKpiReportData } from "@/lib/reports/proposal-kpis";
import { enforceRateLimit } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const limit = enforceRateLimit(`kpi-pdf:${tenant.id}:${tenant.userId}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Espera un momento antes de descargar otro reporte." }, {
      status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))) },
    });
  }

  const report = await getProposalKpiReportData(tenant);
  const generatedAt = new Date();
  const buffer = await renderToBuffer(ProposalKpiPdfDocument({ report, generatedAt }));
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(generatedAt);
  const tenantFilename = tenant.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 70) || "empresa";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="KPIs_${tenantFilename}_${date}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
