import { NextResponse } from "next/server";
import { authorizeProposalPayments, paymentFailure } from "@/lib/integrations/proposal-payments";
import { getBillingPayments, registerBillingPayment } from "@/lib/integrations/digestor-fiscal";
import { registerBillingPaymentSchema } from "@/lib/validations/billing-payment";

type Context = { params: Promise<{ proposalId: string }> };
export async function GET(_: Request, context: Context) {
  const { proposalId } = await context.params;
  const auth = await authorizeProposalPayments(proposalId);
  if (auth.error) return auth.error;
  try { return NextResponse.json(await getBillingPayments(auth.draftId)); }
  catch (error) { return paymentFailure(error); }
}
export async function POST(request: Request, context: Context) {
  const { proposalId } = await context.params;
  const auth = await authorizeProposalPayments(proposalId);
  if (auth.error) return auth.error;
  const parsed = registerBillingPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 422 });
  try { return NextResponse.json(await registerBillingPayment(auth.draftId, parsed.data), { status: 201 }); }
  catch (error) { return paymentFailure(error); }
}
