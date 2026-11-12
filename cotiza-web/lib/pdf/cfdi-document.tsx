import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { existsSync } from "node:fs";
import path from "node:path";

import type { ParsedCfdi } from "@/lib/pdf/cfdi-xml";

// Representacion impresa de un CFDI timbrado, con los elementos que exige el
// Anexo 20 del SAT (folio fiscal, sellos, numeros de certificado, fecha de
// certificacion, cadena original y codigo QR de verificacion). Se arma
// directamente del XML timbrado -- Digestor Fiscal ya no genera este PDF.

// Fuentes locales incrustadas: presentación consistente sin llamadas externas.
const fontDirectory = [path.join(process.cwd(), "public/fonts"), path.join(process.cwd(), "cotiza-web/public/fonts")]
  .find(folder => existsSync(path.join(folder, "CotizaSans-Regular.ttf")));
if (!fontDirectory) throw new Error("No se encontraron las fuentes de los documentos fiscales");
Font.register({ family: "CotizaSans", fonts: [
  { src: path.join(fontDirectory, "CotizaSans-Regular.ttf") },
  { src: path.join(fontDirectory, "CotizaSans-Bold.ttf"), fontWeight: 700 },
] });
Font.register({ family: "CotizaMono", src: path.join(fontDirectory, "CotizaMono-Regular.ttf") });

const colors = { navy: "#142a42", blue: "#1a5b80", ink: "#233140", muted: "#657484", light: "#f3f6f9", line: "#dce4eb" };
const noHyphenation = (word: string) => [word];
const styles = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: colors.ink, fontFamily: "CotizaSans", letterSpacing: 0, fontSize: 9, paddingHorizontal: 48, paddingTop: 48, paddingBottom: 56 },
  runningHeader: { position: "absolute", top: 20, left: 48, right: 48, borderBottomWidth: 1.5, borderBottomColor: colors.blue, paddingBottom: 7, flexDirection: "row", justifyContent: "space-between" },
  runningText: { fontSize: 6.4, color: colors.muted, letterSpacing: 0 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 16, marginBottom: 16, borderBottomWidth: .5, borderBottomColor: colors.line },
  issuer: { width: "63%", paddingRight: 14 }, headerMeta: { width: "34%", textAlign: "right" },
  title: { color: colors.navy, fontFamily: "CotizaSans", fontWeight: 700, fontSize: 14, lineHeight: 1.25, marginBottom: 9, marginTop: 5 },
  metaLabel: { color: colors.muted, fontSize: 6.7, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0 },
  documentTitle: { fontFamily: "CotizaSans", fontWeight: 700, color: colors.blue, fontSize: 12, marginBottom: 8 },
  metaValue: { fontSize: 8.5, fontFamily: "CotizaSans", fontWeight: 700, marginBottom: 6, lineHeight: 1.3 },
  folio: { color: colors.navy, fontFamily: "CotizaSans", fontWeight: 700, marginBottom: 9, lineHeight: 1.2 },
  partiesRow: { marginBottom: 14 },
  partyBox: { padding: 12, backgroundColor: colors.light },
  partyTitle: { color: colors.muted, fontSize: 6.7, fontFamily: "CotizaSans", fontWeight: 700, marginBottom: 5, textTransform: "uppercase" },
  partyName: { fontSize: 11, fontFamily: "CotizaSans", fontWeight: 700, marginBottom: 5, color: colors.navy, lineHeight: 1.25 },
  partyLine: { fontSize: 8, lineHeight: 1.4 },
  mutedLine: { fontSize: 7.5, lineHeight: 1.4, color: colors.muted },
  conditions: { flexDirection: "row", marginBottom: 18 },
  currency: { width: "17%", paddingRight: 8 }, condition: { width: "41.5%", paddingRight: 8 },
  tableHead: { backgroundColor: colors.navy, flexDirection: "row", paddingVertical: 8, paddingHorizontal: 5 },
  tableBody: { borderBottomColor: colors.line, borderBottomWidth: .5, flexDirection: "row", paddingVertical: 9, paddingHorizontal: 5 },
  tableHeadClave: { color: "#ffffff", fontSize: 6.6, fontFamily: "CotizaSans", fontWeight: 700, width: "14%" },
  tableHeadDescripcion: { color: "#ffffff", fontSize: 6.6, fontFamily: "CotizaSans", fontWeight: 700, width: "44%", paddingRight: 8 },
  tableHeadCant: { color: "#ffffff", fontSize: 6.6, fontFamily: "CotizaSans", fontWeight: 700, width: "8%", textAlign: "right", paddingRight: 5 },
  tableHeadPUnit: { color: "#ffffff", fontSize: 6.6, fontFamily: "CotizaSans", fontWeight: 700, width: "17%", textAlign: "right", paddingLeft: 5 },
  tableHeadImporte: { color: "#ffffff", fontSize: 6.6, fontFamily: "CotizaSans", fontWeight: 700, width: "17%", textAlign: "right", paddingLeft: 5 },
  cellClave: { fontSize: 7.5, width: "14%", paddingRight: 5 },
  cellDescripcion: { fontSize: 8.5, lineHeight: 1.35, width: "44%", paddingRight: 8 },
  cellCant: { fontSize: 8.5, width: "8%", textAlign: "right", paddingRight: 5 },
  cellPUnit: { fontSize: 8, width: "17%", textAlign: "right", paddingLeft: 5 },
  cellImporte: { fontSize: 8.5, width: "17%", textAlign: "right", paddingLeft: 5 },
  cell: { fontSize: 8.5 },
  totalsWrap: { alignSelf: "flex-end", marginTop: 12, marginBottom: 17, width: "46%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 4 },
  totalRowStrong: { backgroundColor: colors.navy, flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 11, marginTop: 5 },
  totalLabel: { color: "#ffffff", fontFamily: "CotizaSans", fontWeight: 700, fontSize: 7.5, width: "38%" },
  totalValue: { color: "#ffffff", fontFamily: "CotizaSans", fontWeight: 700, fontSize: 16, textAlign: "right", width: "62%" },
  fiscalBox: { marginTop: 5 },
  footer: { backgroundColor: colors.light, flexDirection: "row", gap: 13, padding: 12, marginBottom: 12 },
  qrImage: { width: 78, height: 78 }, qrWrap: { backgroundColor: "#ffffff", padding: 7, alignSelf: "flex-start" },
  footerText: { color: colors.muted, fontSize: 7, lineHeight: 1.35 },
  seloLabel: { color: colors.muted, fontSize: 6.6, fontFamily: "CotizaSans", fontWeight: 700, marginBottom: 4, marginTop: 7, textTransform: "uppercase", letterSpacing: 0 },
  sello: { fontFamily: "CotizaMono", fontSize: 6.1, lineHeight: 1.35, letterSpacing: 0 },
  cadenaLabel: { color: colors.muted, fontSize: 6.6, fontFamily: "CotizaSans", fontWeight: 700, marginBottom: 4, marginTop: 7, textTransform: "uppercase", letterSpacing: 0 },
  cadena: { fontFamily: "CotizaMono", fontSize: 6.1, lineHeight: 1.35, letterSpacing: 0 },
  pageFooter: { position: "absolute", bottom: 23, left: 48, right: 48, paddingTop: 7, borderTopWidth: .5, borderTopColor: colors.line, flexDirection: "row", justifyContent: "space-between" },
  pageFooterText: { fontSize: 6.3, color: colors.muted, letterSpacing: 0 },
});
const forms: Record<string,string> = { "01": "Efectivo", "02": "Cheque nominativo", "03": "Transferencia electrónica de fondos", "04": "Tarjeta de crédito", "28": "Tarjeta de débito", "99": "Por definir" };
const methods: Record<string,string> = { PUE: "Pago en una sola exhibición", PPD: "Pago en parcialidades o diferido" };
function codeLabel(value: string | null, labels: Record<string,string>) { return value ? value + (labels[value] ? " - " + labels[value] : "") : "No indicado en el XML"; }
function secureLines(value: string) { return (value.match(/.{1,120}/g) ?? [value]).join("\n"); }
function folioLines(value: string) { return value.length > 22 ? (value.match(/.{1,20}/g) ?? [value]).join("\n") : value; }

function formatCurrency(value: number, currency: string, unit = false): string {
  return new Intl.NumberFormat("es-MX", { currency, style: "currency", maximumFractionDigits: unit ? 6 : 2 }).format(value);
}

export function formatCfdiDate(iso: string): string {
  // En XML sin offset se conserva su hora local fiscal, sin asumir UTC.
  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(iso);
  if (local) return `${local[3]}/${local[2]}/${local[1]} ${local[4]}:${local[5]}${local[6] ? ":" + local[6] : ""}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(parsed);
}

type CfdiDocumentProps = {
  cfdi: ParsedCfdi;
  proposalNumber: string;
  qrDataUrl: string;
  fiscalStatus?: string;
};

export function CfdiDocument({ cfdi, proposalNumber, qrDataUrl, fiscalStatus }: CfdiDocumentProps) {
  return (
    <Document title={`CFDI ${cfdi.folio ?? proposalNumber}`} author={cfdi.emisor.nombre} creator="Cotiza">
      <Page size="A4" style={styles.page}>
        <View style={styles.runningHeader} fixed><Text style={styles.runningText}>CFDI 4.0 / TIPO {cfdi.tipoDeComprobante} / REPRESENTACIÓN IMPRESA</Text><Text style={styles.runningText}>{cfdi.emisor.rfc}</Text></View>
        {fiscalStatus && !['not_requested', 'not_sent'].includes(fiscalStatus) ? <Text style={{ color: '#9f1239', marginBottom: 8, fontSize: 10 }}>
          {fiscalStatus === 'cancelled' ? 'COMPROBANTE CANCELADO' : fiscalStatus === 'rejected' ? 'Solicitud de cancelación rechazada' : 'Cancelación con seguimiento pendiente'}
        </Text> : null}
        <View style={styles.headerRow} wrap={false}>
          <View style={styles.issuer}>
            <Text style={styles.partyTitle}>Emisor</Text>
            <Text style={styles.title} hyphenationCallback={noHyphenation}>{cfdi.emisor.nombre}</Text>
            <Text style={styles.partyLine}>RFC: {cfdi.emisor.rfc}</Text>
            <Text style={styles.mutedLine}>Régimen fiscal: {cfdi.emisor.regimenFiscal}</Text>
            <Text style={styles.mutedLine}>CP de expedición: {cfdi.lugarExpedicion}</Text>
          </View>
          <View style={styles.headerMeta}>
            <Text style={styles.documentTitle}>{cfdi.tipoDeComprobante === 'P' ? 'COMPLEMENTO DE PAGO' : cfdi.tipoDeComprobante === 'I' ? 'FACTURA' : 'COMPROBANTE FISCAL'}</Text>
            {cfdi.serie ? <Text style={styles.mutedLine}>Serie: {cfdi.serie}</Text> : null}
            <Text style={styles.metaLabel}>{cfdi.folio ? 'Folio' : 'Referencia'}</Text>
            <Text style={[styles.folio, { fontSize: (cfdi.folio ?? proposalNumber).length > 22 ? 8.2 : (cfdi.folio ?? proposalNumber).length > 12 ? 12 : 21 }]} hyphenationCallback={noHyphenation}>{folioLines(cfdi.folio ?? proposalNumber)}</Text>
            <Text style={styles.metaLabel}>Fecha de emisión</Text>
            <Text style={styles.partyLine}>{formatCfdiDate(cfdi.fecha)}</Text>
          </View>
        </View>
        <View style={styles.partiesRow} wrap={false}>
          <View style={styles.partyBox}>
            <Text style={styles.partyTitle}>Receptor</Text>
            <Text style={styles.partyName} hyphenationCallback={noHyphenation}>{cfdi.receptor.nombre}</Text>
            <Text style={styles.partyLine}>RFC: {cfdi.receptor.rfc}{cfdi.receptor.domicilioFiscalReceptor ? `   |   Código postal: ${cfdi.receptor.domicilioFiscalReceptor}` : ''}</Text>
            <Text style={styles.mutedLine}>Régimen fiscal: {cfdi.receptor.regimenFiscalReceptor}   |   Uso CFDI: {cfdi.receptor.usoCFDI}</Text>
          </View>
        </View>
        <View style={styles.conditions} wrap={false}>
          <View style={styles.currency}><Text style={styles.partyTitle}>Moneda</Text><Text style={styles.partyLine}>{cfdi.moneda}</Text></View>
          <View style={styles.condition}><Text style={styles.partyTitle}>Método de pago</Text><Text style={styles.partyLine}>{codeLabel(cfdi.metodoPago, methods)}</Text></View>
          <View style={styles.condition}><Text style={styles.partyTitle}>Forma de pago</Text><Text style={styles.partyLine}>{codeLabel(cfdi.formaPago, forms)}</Text></View>
        </View>

        {cfdi.relations?.map((relation, index) => <View key={index} style={{ marginTop: 8, padding: 8, borderWidth: 1, borderColor: '#cbd5e1' }} wrap={false}>
          <Text style={styles.partyTitle}>Relación fiscal {relation.type}{relation.type === '04' ? ' · Sustitución de CFDI previos' : ''}</Text>
          {relation.uuids.map(uuid => <Text key={uuid} style={styles.partyLine}>Comprobante relacionado: {uuid}</Text>)}
        </View>)}
        {cfdi.payments?.map((payment, index) => <View key={index} style={{ marginTop: 10 }} wrap={false}>
          <Text style={styles.partyTitle}>Pago recibido: {payment.amount} {payment.currency}</Text>
          <Text style={styles.partyLine}>Fecha: {payment.date} · Forma de pago: {payment.form}</Text>
          {payment.documents.map(document => <View key={document.uuid} style={{ marginTop: 6, padding: 8, borderWidth: 1, borderColor: '#cbd5e1' }}>
            <Text style={styles.partyLine}>Factura relacionada: {document.uuid}</Text>
            <Text style={styles.partyLine}>Parcialidad: {document.partiality} · Moneda: {document.currency}</Text>
            <Text style={styles.partyLine}>Saldo anterior: {document.before} · Importe pagado: {document.paid} · Saldo insoluto: {document.after}</Text>
          </View>)}
        </View>)}

        {cfdi.tipoDeComprobante !== 'P' ? <>
        <View style={styles.tableHead} wrap={false} minPresenceAhead={32}>
          <Text style={styles.tableHeadClave}>Clave</Text>
          <Text style={styles.tableHeadDescripcion}>Concepto</Text>
          <Text style={styles.tableHeadCant}>Cant.</Text>
          <Text style={styles.tableHeadPUnit}>P. Unit.</Text>
          <Text style={styles.tableHeadImporte}>Importe</Text>
        </View>
        {cfdi.conceptos.map((concepto, index) => (
          <View key={`${concepto.claveProdServ}-${index}`} style={[styles.tableBody, index % 2 ? { backgroundColor: colors.light } : {}]} wrap={concepto.descripcion.length > 1200}>
            <View style={styles.cellClave}><Text>{concepto.claveProdServ}</Text><Text style={styles.mutedLine}>Unidad: {concepto.claveUnidad}</Text></View>
            <Text style={styles.cellDescripcion} hyphenationCallback={noHyphenation}>{concepto.descripcion}{concepto.noIdentificacion ? `\nReferencia: ${concepto.noIdentificacion}` : ""}</Text>
            <Text style={styles.cellCant}>{new Intl.NumberFormat("es-MX", { maximumFractionDigits: 6 }).format(concepto.cantidad)}</Text>
            <Text style={styles.cellPUnit}>{formatCurrency(concepto.valorUnitario, cfdi.moneda, true)}</Text>
            <Text style={styles.cellImporte}>{formatCurrency(concepto.importe, cfdi.moneda)}</Text>
          </View>
        ))}

        <View style={styles.totalsWrap} wrap={false}>
          <View style={styles.totalRow}>
            <Text style={styles.cell}>Subtotal</Text>
            <Text style={styles.cell}>{formatCurrency(cfdi.subTotal, cfdi.moneda)}</Text>
          </View>
          {cfdi.totalImpuestosTrasladados !== null ? (
            <View style={styles.totalRow}>
              <Text style={styles.cell}>Impuestos trasladados</Text>
              <Text style={styles.cell}>{formatCurrency(cfdi.totalImpuestosTrasladados, cfdi.moneda)}</Text>
            </View>
          ) : null}
          <View style={styles.totalRowStrong}>
            <Text style={styles.totalLabel}>TOTAL {cfdi.moneda}</Text>
            <Text style={styles.totalValue}>{formatCurrency(cfdi.total, cfdi.moneda)}</Text>
          </View>
        </View>

        </> : <Text style={{ marginTop: 8, fontSize: 8 }}>Total del CFDI de pago: 0. El importe recibido se detalla en el complemento.</Text>}

        <View style={styles.fiscalBox}>
          <View style={styles.footer} wrap={false}>
            <View style={styles.qrWrap}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- Imagen PDF, sin atributo alt de HTML. */}
              <Image src={qrDataUrl} style={styles.qrImage} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaLabel}>Folio fiscal (UUID)</Text>
              <Text style={styles.metaValue} hyphenationCallback={noHyphenation}>{cfdi.timbre.uuid}</Text>
              <Text style={styles.metaLabel}>Fecha y hora de certificación</Text>
              <Text style={styles.metaValue}>{formatCfdiDate(cfdi.timbre.fechaTimbrado)}</Text>
              <Text style={styles.footerText}>Certificado emisor: {cfdi.noCertificado}</Text>
              <Text style={styles.footerText}>Certificado SAT: {cfdi.timbre.noCertificadoSAT}</Text>
              <Text style={styles.footerText}>RFC del certificador: {cfdi.timbre.rfcProvCertif}</Text>
            </View>
          </View>

          <Text style={styles.seloLabel} minPresenceAhead={17}>Sello digital del CFDI</Text>
          <Text style={styles.sello} hyphenationCallback={noHyphenation}>{secureLines(cfdi.sello)}</Text>

          <Text style={styles.seloLabel} minPresenceAhead={17}>Sello digital del SAT</Text>
          <Text style={styles.sello} hyphenationCallback={noHyphenation}>{secureLines(cfdi.timbre.selloSAT)}</Text>

          <Text style={styles.cadenaLabel} minPresenceAhead={17}>Cadena original del complemento de certificación del SAT</Text>
          <Text style={styles.cadena} hyphenationCallback={noHyphenation}>{secureLines(cfdi.cadenaOriginal)}</Text>


        </View>
        <View style={styles.pageFooter} fixed>
          <Text style={styles.pageFooterText}>Este documento es una representación impresa de un CFDI</Text>
          <Text style={styles.pageFooterText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
