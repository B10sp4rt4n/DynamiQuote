import { NextResponse } from "next/server";
import { authorizeProposalPayments, paymentFailure } from "@/lib/integrations/proposal-payments";
import { getPaymentReceipt } from "@/lib/integrations/digestor-fiscal";

type Context = { params: Promise<{ proposalId: string; paymentId: string }> };
export async function GET(request: Request, context: Context) {
  const { proposalId, paymentId } = await context.params;
  const auth = await authorizeProposalPayments(proposalId);
  if (auth.error) return auth.error;
  try {
    const result = await getPaymentReceipt(auth.draftId, paymentId);
    if (new URL(request.url).searchParams.get("download") === "1") {
      if (result.receipt_status !== "stamped" || !result.xml_base64) {
        return NextResponse.json({ error: "El complemento aún no está timbrado" }, { status: 409 });
      }
      return new Response(Buffer.from(result.xml_base64, "base64"), { headers: {
        "Content-Type": "application/xml", "Content-Disposition": 'attachment; filename="complemento-pago.xml"',
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      } });
    }
    return NextResponse.json(result);
  } catch (error) { return paymentFailure(error); }
}
