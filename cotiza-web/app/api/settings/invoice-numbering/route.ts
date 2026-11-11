import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { invoiceNumberingInput } from "@/lib/domain/invoice-numbering";
import { getInvoiceNumbering, updateInvoiceNumbering, isDigestorFiscalEnabledForTenant } from "@/lib/integrations/digestor-fiscal";
import { DigestorHttpError } from "@/lib/integrations/digestor-error";

async function access(request: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId || tenant.authMode !== "clerk") return { error: "Inicia sesión para configurar los folios", status: 401 } as const;
  if (!(tenant.isSuperAdmin || tenant.userRole === "owner")) return { error: "Sólo el owner o superadmin puede configurar los folios", status: 403 } as const;
  if (request.headers.get("X-Tenant-Context") !== tenant.id) return { error: "La empresa activa cambió. Recarga la configuración", status: 409 } as const;
  if (!isDigestorFiscalEnabledForTenant(tenant.id)) return { error: "La facturación aún no está habilitada para esta empresa", status: 403 } as const;
  return { tenant } as const;
}
function failure(error: unknown) {
  const known = error instanceof DigestorHttpError;
  return NextResponse.json({ error: known ? error.message : "No se pudo consultar o guardar la numeración. Recarga antes de reintentar" },
    { status: known && [400, 403, 409, 422, 503].includes(error.status) ? error.status : 502 });
}
export async function GET(request: Request) {
  const result = await access(request);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  try { return NextResponse.json(await getInvoiceNumbering(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  const result = await access(request);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  const parsed = invoiceNumberingInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Revisa la configuración de folios" }, { status: 422 });
  try { return NextResponse.json(await updateInvoiceNumbering(parsed.data, result.tenant.userId!), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
