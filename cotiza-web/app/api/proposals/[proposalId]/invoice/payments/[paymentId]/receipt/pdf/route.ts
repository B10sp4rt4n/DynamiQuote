import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { authorizeProposalPayments, paymentFailure } from '@/lib/integrations/proposal-payments';
import { getPaymentReceipt } from '@/lib/integrations/digestor-fiscal';
import { parsePaymentReceiptXml } from '@/lib/pdf/cfdi-xml';
import { buildCfdiQrDataUrl } from '@/lib/pdf/cfdi-qr';
import { CfdiDocument } from '@/lib/pdf/cfdi-document';
export const runtime = 'nodejs';
type Context = { params: Promise<{ proposalId: string; paymentId: string }> };
export async function GET(_: Request, context: Context) {
  const { proposalId, paymentId } = await context.params;
  const auth = await authorizeProposalPayments(proposalId);
  if (auth.error) return auth.error;
  try {
    const receipt = await getPaymentReceipt(auth.draftId, paymentId);
    if (receipt.receipt_status !== 'stamped' || !receipt.xml_base64 || !receipt.receipt_uuid) {
      return NextResponse.json({ error: 'El complemento aún no está timbrado' }, { status: 409 });
    }
    const cfdi = parsePaymentReceiptXml(receipt.xml_base64, receipt.receipt_uuid);
    const pdf = await renderToBuffer(CfdiDocument({ cfdi, proposalNumber: proposalId,
      fiscalStatus: receipt.cancellation_status, qrDataUrl: await buildCfdiQrDataUrl(cfdi) }));
    return new Response(new Uint8Array(pdf), { headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="complemento_${cfdi.timbre.uuid}.pdf"`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return paymentFailure(error); }
}
