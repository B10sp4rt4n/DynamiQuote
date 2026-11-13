import Link from "next/link";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { WinConsolidationPanel } from "@/components/propuestas/win-consolidation-panel";
export const dynamic = "force-dynamic";
export default async function WinApprovalPage({ params }: { params: Promise<{ proposalId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId || tenant.authMode !== "clerk") return <p>Inicia sesión para consultar el circuito.</p>;
  return <div className="space-y-4"><Link href="/autorizaciones" className="text-sm text-blue-800 underline">Volver a autorizaciones</Link>
    <WinConsolidationPanel key={`${tenant.id}:${(await params).proposalId}`} tenantId={tenant.id} proposalId={(await params).proposalId} /></div>;
}
