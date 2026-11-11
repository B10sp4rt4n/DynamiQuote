import Link from "next/link";
import { InvoiceNumberingPanel } from "@/components/configuracion/invoice-numbering-panel";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getInvoiceNumbering, isDigestorFiscalEnabledForTenant } from "@/lib/integrations/digestor-fiscal";

export const dynamic = "force-dynamic";
export default async function InvoiceNumberingPage() {
  const tenant = await getCurrentTenantContext();
  let initial;
  if (tenant?.userId && tenant.authMode === "clerk" && (tenant.isSuperAdmin || tenant.userRole === "owner") && isDigestorFiscalEnabledForTenant(tenant.id)) {
    try { initial = await getInvoiceNumbering(); } catch { /* El servicio anterior conserva el flujo existente. */ }
  }
  return <div className="space-y-5">
    <Link href="/configuracion" className="inline-block text-sm underline">Volver a Configuración</Link>
    {initial && tenant ? <InvoiceNumberingPanel key={tenant.id} tenantId={tenant.id} tenantName={tenant.name} initial={initial} /> :
      <section className="rounded-xl border bg-white p-6"><h1 className="text-xl font-semibold">Series y folios de facturas</h1>
        <p className="mt-2 text-sm">Requiere sesión del owner o superadmin y conexión de facturación habilitada para esta empresa. Si ya tienes acceso, la configuración puede estar pendiente de puesta en servicio.</p></section>}
  </div>;
}
