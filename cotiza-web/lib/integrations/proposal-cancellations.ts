import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeProposalFiscalDocument, paymentFailure } from './proposal-payments';
import { cancelBillingDocument, getBillingCancellation, reconcileBillingCancellation } from './digestor-fiscal';

// Motivo 01 is accepted only by Digestor with a verified same-tenant replacement.
// Cotiza does not accept a raw Digestor ID or an arbitrary replacement UUID from its UI.
const input = z.strictObject({ idempotency_key: z.uuid(), reason: z.enum(['02', '03']), expected_uuid: z.uuid().optional(), confirm_real_operation: z.literal(true).optional() });
type Context = { params: Promise<{ proposalId: string; paymentId?: string }> };

export async function readCancellation(request: Request, context: Context) {
  const { proposalId, paymentId } = await context.params;
  const auth = await authorizeProposalFiscalDocument(proposalId, 'cancellation', request);
  if (auth.error) return auth.error;
  try {
    const result = await getBillingCancellation(auth.draftId, paymentId);
    if (new URL(request.url).searchParams.get('download') === '1') {
      if (!result.acknowledgement_xml) return NextResponse.json({ error: 'No existe acuse disponible' }, { status: 409 });
      return new Response(result.acknowledgement_xml, { headers: {
        'Content-Type': 'application/xml', 'Content-Disposition': 'attachment; filename="acuse-solicitud-cancelacion.xml"',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      } });
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return paymentFailure(error); }
}

export async function requestCancellation(request: Request, context: Context) {
  const { proposalId, paymentId } = await context.params;
  const auth = await authorizeProposalFiscalDocument(proposalId, 'cancellation', request);
  if (auth.error) return auth.error;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Selecciona motivo 02 o 03 y una clave de operación válida' }, { status: 422 });
  if (process.env['DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED'] === 'true' && (parsed.data.confirm_real_operation !== true || !parsed.data.expected_uuid)) {
    return NextResponse.json({error:'Confirma la solicitud de cancelación real'},{status:422});
  }
  const {confirm_real_operation: _consent, ...payload} = parsed.data;
  try { return NextResponse.json(await cancelBillingDocument(auth.draftId, payload, paymentId)); }
  catch (error) { return paymentFailure(error); }
}

export async function reconcileCancellation(request: Request, context: Context) {
  const { proposalId, paymentId } = await context.params;
  const auth = await authorizeProposalFiscalDocument(proposalId, 'cancellation', request);
  if (auth.error) return auth.error;
  try { return NextResponse.json(await reconcileBillingCancellation(auth.draftId, paymentId)); }
  catch (error) { return paymentFailure(error); }
}
