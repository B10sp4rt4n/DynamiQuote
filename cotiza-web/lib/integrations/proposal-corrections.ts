import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeProposalFiscalDocument, paymentFailure } from './proposal-payments';
import { createFiscalCorrection, fiscalCorrectionAction, getFiscalCorrection } from './digestor-fiscal';

const changes = z.strictObject({
  customer_name: z.string().trim().min(1).max(200).optional(),
  customer_zip: z.string().regex(/^\d{5}$/).optional(), customer_regimen: z.string().regex(/^\d{3}$/).optional(),
  customer_use_cfdi: z.string().regex(/^[GIDS]\d{2}$/).optional(),
  payment_method: z.enum(['PUE', 'PPD']).optional(), payment_form: z.enum(['01','02','03','04','28','99']).optional(),
  operation_reference: z.string().trim().min(1).max(100).optional(),
});
const createInput = z.strictObject({ idempotency_key: z.uuid(), source_uuid: z.uuid(), reason: z.string().trim().min(5).max(500), changes, confirm_real_operation: z.literal(true).optional() });
const recoveryInput = z.strictObject({ receipt_uuid: z.uuid(), revision_id: z.uuid().optional() });
const actionInput = z.strictObject({ revision_id:z.uuid(),confirm_real_operation:z.literal(true).optional() });
const operations = z.enum(['stamp', 'reconcile', 'abandon', 'cancel-original', 'confirm-cancellation']);
type Context = { params: Promise<{ proposalId: string; paymentId?: string; operation?: string }> };

export async function readCorrection(request: Request, context: Context) {
  const { proposalId, paymentId } = await context.params;
  const auth = await authorizeProposalFiscalDocument(proposalId, 'correction_read');
  if (auth.error) return auth.error;
  try {
    const result = await getFiscalCorrection(auth.draftId, paymentId);
    const query = new URL(request.url).searchParams;
    const format = query.get('format');
    if (format === 'diagnostic') {
      const revisionId = query.get('revision');
      const rows = revisionId ? result.history.filter(item => item.id === revisionId) : result.history;
      if (revisionId && !rows.length) return NextResponse.json({ error: 'Sustitución no encontrada' }, { status: 404 });
      // Allowlist the support references. Never export raw XML, credentials or free text.
      const diagnostic = {
        schema: 'cotiza.fiscal-correction-diagnostic', version: 1,
        generated_at: new Date().toISOString(),
        environment: auth.environment,
        proposal_id: proposalId, draft_id: auth.draftId, payment_id: paymentId ?? null,
        kind: result.kind, active_uuid: result.active_uuid, pending: result.pending,
        guidance: 'Este diagnóstico no confirma la emisión ni la cancelación ante el PAC. Ante un resultado incierto, consulta al proveedor antes de repetir la operación.',
        revisions: rows.map(row => ({
          revision_id: row.id,
          pac_reference: { field: 'IdComprobante', value: `revision-${row.id}` },
          status: row.status, source_uuid: row.source_uuid, result_uuid: row.result_uuid,
          source_cancellation_status: row.source_cancellation_status,
          request_xml_sha256: row.request_xml_base64
            ? createHash('sha256').update(Buffer.from(row.request_xml_base64, 'base64')).digest('hex') : null,
        })),
      };
      return NextResponse.json(diagnostic, { headers: {
        'Content-Disposition': 'attachment; filename="diagnostico-sustitucion-fiscal.json"',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      } });
    }
    if (format === 'xml' || format === 'pdf') {
      const revisionId = query.get('revision');
      const row = revisionId ? result.history.find(item => item.id === revisionId) : undefined;
      if (revisionId && !row) return NextResponse.json({ error: 'Sustitución no encontrada' }, { status: 404 });
      const xml = row ? row.result_xml_base64 : result.active_xml_base64;
      const uuid = row ? row.result_uuid : result.active_uuid;
      if (!xml || !uuid || (row && row.status !== 'stamped')) return NextResponse.json({ error: 'Primero confirma el timbrado de la sustituta' }, { status: 409 });
      if (format === 'xml') return new Response(Buffer.from(xml, 'base64'), { headers: {
        'Content-Type': 'application/xml', 'Content-Disposition': 'attachment; filename="comprobante-sustituto.xml"',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      } });
      const [{ renderToBuffer }, { CfdiDocument }, { parseCfdiXml, parsePaymentReceiptXml }, { buildCfdiQrDataUrl }] = await Promise.all([
        import('@react-pdf/renderer'), import('@/lib/pdf/cfdi-document'), import('@/lib/pdf/cfdi-xml'), import('@/lib/pdf/cfdi-qr'),
      ]);
      const cfdi = result.kind === 'receipt' ? parsePaymentReceiptXml(xml, uuid) : parseCfdiXml(xml);
      if (cfdi.timbre.uuid.toLowerCase() !== uuid.toLowerCase()) throw new Error('El XML no corresponde al UUID de la sustitución');
      const next = result.history.find(item => item.source_uuid === uuid);
      const pdf = await renderToBuffer(CfdiDocument({ cfdi, proposalNumber: proposalId, qrDataUrl: await buildCfdiQrDataUrl(cfdi),
        fiscalStatus: next?.source_cancellation_status }));
      return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="comprobante-sustituto.pdf"', 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return paymentFailure(error); }
}

export async function createCorrection(request: Request, context: Context) {
  const { proposalId, paymentId } = await context.params;
  const auth = await authorizeProposalFiscalDocument(proposalId, 'correction', request);
  if (auth.error) return auth.error;
  const parsed = createInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Revisa los datos de corrección; los importes y el RFC se conservan' }, { status: 422 });
  if (auth.environment !== 'sandbox' && process.env['DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED'] === 'true' && parsed.data.confirm_real_operation !== true) {
    return NextResponse.json({error:'Confirma la preparación de la sustitución real'},{status:422});
  }
  const {confirm_real_operation: _consent, ...input} = parsed.data;
  if (paymentId && Object.keys(input.changes).some(key => !['payment_form','operation_reference'].includes(key))) {
    return NextResponse.json({ error: 'El complemento permite corregir forma y referencia, conservando sus importes y fecha' }, { status: 422 });
  }
  try { return NextResponse.json(await createFiscalCorrection(auth.draftId, input, paymentId), { status: 201 }); }
  catch (error) { return paymentFailure(error); }
}

export async function runCorrectionAction(request: Request, context: Context) {
  const { proposalId, paymentId, operation } = await context.params;
  const auth = await authorizeProposalFiscalDocument(proposalId, 'correction', request);
  if (auth.error) return auth.error;
  const parsedAction = operations.safeParse(operation);
  if (!parsedAction.success) return NextResponse.json({ error: 'Acción no admitida' }, { status: 422 });
  const production = auth.environment !== 'sandbox' && process.env['DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED'] === 'true';
  let input: {receipt_uuid?:string;revision_id?:string} | undefined;
  if (parsedAction.data === 'reconcile') {
    const parsed = recoveryInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success || (production && !parsed.data.revision_id)) return NextResponse.json({ error: 'Indica el UUID confirmado y la corrección revisada' }, { status: 422 });
    input = parsed.data;
  } else if (production) {
    const parsed = actionInput.safeParse(await request.json().catch(()=>null));
    if (!parsed.success || (['stamp','cancel-original'].includes(parsedAction.data) && parsed.data.confirm_real_operation !== true)) {
      return NextResponse.json({error:'Confirma la operación y la versión exacta de la corrección'},{status:422});
    }
    input = {revision_id:parsed.data.revision_id};
  }
  try { return NextResponse.json(await fiscalCorrectionAction(auth.draftId, parsedAction.data, input, paymentId)); }
  catch (error) { return paymentFailure(error); }
}
