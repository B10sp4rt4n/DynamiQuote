import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isTenantCapabilityEnabled } from "@/lib/db/tenant-capabilities";
import { isQuoteVisibleToViewer } from "@/lib/db/quotes";
import { getEditableQuoteLinesByTenant } from "@/lib/db/quote-editor";
import { getMarginPolicyByTenant } from "@/lib/db/margin-policies";
import { GuidedQuotePreview } from "@/components/cotizador/guided-quote-preview";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ quoteId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant || !await isTenantCapabilityEnabled(tenant.id, "cpq_guided_preview")) notFound();
  const { quoteId } = await params;
  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  if (!await isQuoteVisibleToViewer(tenant.id, quoteId, tenant.userId, canSeeAll)) notFound();
  const lines = await getEditableQuoteLinesByTenant(tenant.id, quoteId);
  if (!lines?.length) notFound();
  const policy = await getMarginPolicyByTenant(tenant.id);
  const asOf = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <div className="text-zinc-900"><Link className="font-semibold text-indigo-800 underline" href={`/cotizaciones?quoteId=${encodeURIComponent(quoteId)}`}>Volver a la cotización</Link><p className="my-3">Versión de origen: {quoteId}</p><GuidedQuotePreview sourceQuoteId={quoteId} lines={lines} minMarginPct={policy.minMarginPct} asOf={asOf} /></div>;
}
