import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantContext } from '@/lib/auth/tenant-context';
import { getProposalInvoiceStatusByTenant } from '@/lib/db/proposal-invoices';
import { isProposalVisibleToViewer } from '@/lib/db/proposals';
import { isDigestorFiscalEnabledForTenant, liveCancellation } from '@/lib/integrations/digestor-fiscal';

export const maxDuration = 180;
type Context = {params:Promise<{proposalId:string}>};
const input = z.discriminatedUnion('operation', [
  z.object({operation:z.literal('submit'),confirm:z.literal(true)}).strict(),
  z.object({operation:z.literal('reconcile')}).strict(),
]);

async function handle(request: Request, context: Context, mutate: boolean) {
  const tenant = await getCurrentTenantContext();
  if (!tenant || tenant.authMode !== 'clerk' || !tenant.userId) return NextResponse.json({error:'Sesión requerida'},{status:401});
  if (!isDigestorFiscalEnabledForTenant(tenant.id) || !(tenant.isSuperAdmin || tenant.userRole === 'owner' || tenant.userRole === 'admin')) {
    return NextResponse.json({error:'Acceso fiscal administrativo requerido'},{status:403});
  }
  if (mutate && request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({error:'Origen no autorizado'},{status:403});
  const {proposalId} = await context.params;
  if (!await isProposalVisibleToViewer(tenant.id,proposalId,tenant.userId,true)) return NextResponse.json({error:'Propuesta no encontrada'},{status:404});
  const invoice = await getProposalInvoiceStatusByTenant(tenant.id,proposalId);
  const expected = process.env['DIGESTOR_FISCAL_LIVE_CANCEL_UUID'];
  if (!expected || !invoice?.uuid || expected.toLowerCase() !== invoice.uuid.toLowerCase()) return NextResponse.json({enabled:false});
  if (!invoice.draftId || !invoice.xmlBase64 || invoice.status !== 'stamped') return NextResponse.json({error:'Se requiere el comprobante original emitido'},{status:409});
  let operation: 'read' | 'submit' | 'reconcile' = 'read';
  if (mutate) {
    const parsed = input.safeParse(await request.json().catch(()=>null));
    if (!parsed.success) return NextResponse.json({error:'Confirma la operación exacta'},{status:422});
    operation = parsed.data.operation;
  }
  try {
    const result = await liveCancellation(invoice.draftId,operation,invoice.uuid);
    return NextResponse.json({enabled:true,...result},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error ? error.message : 'Consulta fiscal sin confirmar; no repitas la solicitud'},{status:502});
  }
}

export function GET(request: Request, context: Context) {return handle(request,context,false);}
export function POST(request: Request, context: Context) {return handle(request,context,true);}
