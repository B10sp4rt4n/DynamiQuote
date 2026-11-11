import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeProposalFiscalDocument, paymentFailure } from './proposal-payments';
import { getSatTracking, setSatSchedule, type SatTracking } from './digestor-fiscal';
import { enforceRateLimit } from '@/lib/utils/rate-limit';

type Context = { params: Promise<{ proposalId: string; paymentId?: string }> };
function visible(value: SatTracking, canManage: boolean | undefined) {
  return value.schedule ? {...value, schedule:{...value.schedule,can_manage:Boolean(canManage && value.schedule.can_manage)}} : value;
}
export async function satStatus(request: Request, context: Context) {
  const {proposalId,paymentId} = await context.params;
  const auth = await authorizeProposalFiscalDocument(proposalId,'sat_status',request);
  if(auth.error)return auth.error;
  if(auth.environment!=='production')return NextResponse.json({error:'La consulta SAT no está habilitada para comprobantes de prueba'},{status:403});
  const uuid=z.uuid().safeParse(new URL(request.url).searchParams.get('expected_uuid'));
  if(!uuid.success)return NextResponse.json({error:'Selecciona un UUID válido del expediente'},{status:422});
  const consult=request.method==='POST';
  if(!enforceRateLimit(`sat:${auth.tenantId}:${proposalId}:${consult?'consult':'read'}`,consult?6:60,60_000).allowed)
    return NextResponse.json({error:'Límite de consultas alcanzado; espera un minuto'},{status:429});
  try{return NextResponse.json(visible(await getSatTracking(auth.draftId,uuid.data.toLowerCase(),consult,paymentId),auth.canManageSatSchedule),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return paymentFailure(error);}
}

export async function satSchedule(request: Request, context: Context) {
  const {proposalId,paymentId} = await context.params;
  const auth = await authorizeProposalFiscalDocument(proposalId,'sat_status',request);
  if(auth.error)return auth.error;
  if(auth.environment!=='production' || !auth.canManageSatSchedule)
    return NextResponse.json({error:'Se requiere acceso administrativo al seguimiento SAT productivo'},{status:403});
  const uuid=z.uuid().safeParse(new URL(request.url).searchParams.get('expected_uuid'));
  const body=z.object({enabled:z.boolean()}).strict().safeParse(await request.json().catch(()=>null));
  if(!uuid.success || !body.success)return NextResponse.json({error:'Selecciona un UUID y una opción de seguimiento válidos'},{status:422});
  if(!enforceRateLimit(`sat-schedule:${auth.tenantId}:${proposalId}`,10,60_000).allowed)
    return NextResponse.json({error:'Espera un minuto antes de cambiar el seguimiento de nuevo'},{status:429});
  try{return NextResponse.json(visible(await setSatSchedule(auth.draftId,uuid.data.toLowerCase(),body.data.enabled,paymentId),true),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return paymentFailure(error);}
}
