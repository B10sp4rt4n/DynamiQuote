import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeProposalFiscalDocument, paymentFailure } from './proposal-payments';
import { getSatTracking } from './digestor-fiscal';
import { enforceRateLimit } from '@/lib/utils/rate-limit';

type Context = { params: Promise<{ proposalId: string; paymentId?: string }> };
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
  try{return NextResponse.json(await getSatTracking(auth.draftId,uuid.data.toLowerCase(),consult,paymentId),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return paymentFailure(error);}
}
