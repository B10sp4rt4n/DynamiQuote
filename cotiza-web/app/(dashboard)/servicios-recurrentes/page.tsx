import { notFound } from "next/navigation";
import { authorizeRecurring } from "@/lib/recurring-access";
import { listRecurring } from "@/lib/db/recurring-services";
import { RecurringServicesPanel } from "@/components/servicios/recurring-services-panel";
export const dynamic='force-dynamic';
export default async function RecurringServicesPage() {
  let actor,workspace;
  try{actor=await authorizeRecurring();workspace=await listRecurring(actor);}catch{notFound();}
  return <RecurringServicesPanel key={`${actor.tenantId}:${actor.actorId}`} tenantId={actor.tenantId} initialWorkspace={workspace}/>;
}
