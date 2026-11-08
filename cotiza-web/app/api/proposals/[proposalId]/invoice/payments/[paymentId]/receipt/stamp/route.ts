import { NextResponse } from "next/server";
import { authorizeProposalPayments, paymentFailure } from "@/lib/integrations/proposal-payments";
import { stampPaymentReceipt } from "@/lib/integrations/digestor-fiscal";

type Context = { params: Promise<{ proposalId: string; paymentId: string }> };
export async function POST(request: Request, context: Context) {
  const { proposalId, paymentId } = await context.params;
  const auth = await authorizeProposalPayments(proposalId, request);
  if (auth.error) return auth.error;
  if (process.env['DIGESTOR_FISCAL_PPD_PRODUCTION_ENABLED'] === 'true') {
    const consent = await request.json().catch(() => null);
    if (consent?.confirm_real_receipt !== true) return NextResponse.json({ error: "Confirma la emisión del complemento fiscal real" }, { status: 422 });
  }
  try { return NextResponse.json(await stampPaymentReceipt(auth.draftId, paymentId)); }
  catch (error) { return paymentFailure(error); }
}
