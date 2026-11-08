import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeProposalPayments, paymentFailure } from '@/lib/integrations/proposal-payments';
import { recoverPaymentReceipt } from '@/lib/integrations/digestor-fiscal';
const input = z.strictObject({ receipt_uuid: z.uuid() });
type Context = { params: Promise<{ proposalId: string; paymentId: string }> };
export async function POST(request: Request, context: Context) {
  const { proposalId, paymentId } = await context.params;
  const auth = await authorizeProposalPayments(proposalId, request);
  if (auth.error) return auth.error;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Se requiere el UUID que confirmó el proveedor' }, { status: 422 });
  try { return NextResponse.json(await recoverPaymentReceipt(auth.draftId, paymentId, parsed.data.receipt_uuid)); }
  catch (error) { return paymentFailure(error); }
}
