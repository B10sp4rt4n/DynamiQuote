import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { ProcurementDraftPanel } from "@/components/compras/procurement-draft-panel";
export const dynamic="force-dynamic";
export default async function ProcurementPage({params}:{params:Promise<{proposalId:string}>}) {
  const tenant=await getCurrentTenantContext();
  if(!tenant?.userId||tenant.authMode!=="clerk")return <p>Inicia sesión para consultar Compras.</p>;
  const {proposalId}=await params;
  return <ProcurementDraftPanel key={`${tenant.id}:${proposalId}`} tenantId={tenant.id} proposalId={proposalId}/>;
}
