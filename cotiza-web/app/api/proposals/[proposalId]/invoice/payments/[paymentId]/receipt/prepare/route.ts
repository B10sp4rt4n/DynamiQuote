import { NextResponse } from "next/server";
import { authorizeProposalPayments, paymentFailure } from "@/lib/integrations/proposal-payments";
import { preparePaymentReceipt } from "@/lib/integrations/digestor-fiscal";

type Context = { params: Promise<{ proposalId: string; paymentId: string }> };
export async function POST(_: Request, context: Context) {
  const { proposalId, paymentId } = await context.params;
  const auth = await authorizeProposalPayments(proposalId);
  if (auth.error) return auth.error;
  try { return NextResponse.json(await preparePaymentReceipt(auth.draftId, paymentId)); }
  catch (error) { return paymentFailure(error); }
}
