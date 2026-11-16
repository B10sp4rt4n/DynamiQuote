import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { recordiaPilotVisible,revalidateRecordiaActor } from "@/lib/integrations/recordia/access";
import { RecordiaContextPanel } from "@/components/integraciones/recordia-context-panel";
export const dynamic="force-dynamic";
export default async function RecordiaCasePage({params}:{params:Promise<{opportunityId:string}>}) {
  const tenant=await getCurrentTenantContext();
  if(!tenant?.userId||!await recordiaPilotVisible(tenant))notFound();
  await revalidateRecordiaActor({tenantId:tenant.id,actorId:tenant.userId});
  const {opportunityId}=await params;
  return <div className="space-y-4 text-zinc-900"><Link className="inline-flex min-h-11 items-center text-sm text-blue-800 underline" href="/recordia">← Archivo de expedientes</Link>
    <h1 className="text-2xl font-semibold">Expediente conservado</h1>
    <RecordiaContextPanel key={`${tenant.id}:${tenant.userId}:${opportunityId}`} tenantId={tenant.id} opportunityId={opportunityId}/>
  </div>;
}
