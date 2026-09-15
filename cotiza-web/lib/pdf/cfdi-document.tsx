import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { ParsedCfdi } from "@/lib/pdf/cfdi-xml";

// Representacion impresa de un CFDI timbrado, con los elementos que exige el
// Anexo 20 del SAT (folio fiscal, sellos, numeros de certificado, fecha de
// certificacion, cadena original y codigo QR de verificacion). Se arma
// directamente del XML timbrado -- Digestor Fiscal ya no genera este PDF.

const styles = StyleSheet.create({
  cadena: {
    fontFamily: "Courier",
    fontSize: 6,
    wordBreak: "break-all",
  },
  cadenaLabel: {
    color: "#6b7280",
    fontSize: 7,
    marginBottom: 2,
    marginTop: 6,
    textTransform: "uppercase",
  },
  cell: {
    fontSize: 8,
  },
  cellCant: {
    fontSize: 8,
    textAlign: "right",
    width: "8%",
  },
  cellClave: {
    fontSize: 8,
    width: "14%",
  },
  cellDescripcion: {
    fontSize: 8,
    width: "44%",
  },
  cellImporte: {
    fontSize: 8,
    textAlign: "right",
    width: "17%",
  },
  cellPUnit: {
    fontSize: 8,
    textAlign: "right",
    width: "17%",
  },
  fiscalBox: {
    borderColor: "#cbd5e1",
    borderStyle: "solid",
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 8,
  },
  footer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  footerText: {
    color: "#6b7280",
    flex: 1,
    fontSize: 7,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  metaLabel: {
    color: "#6b7280",
    fontSize: 7.5,
    textTransform: "uppercase",
  },
  metaValue: {
    fontSize: 9,
    fontWeight: 700,
    marginBottom: 4,
  },
  page: {
    backgroundColor: "#ffffff",
    color: "#1f2937",
    fontSize: 9,
    paddingBottom: 36,
    paddingHorizontal: 26,
    paddingTop: 20,
  },
  partiesRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  partyBox: {
    borderColor: "#e5e7eb",
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: 4,
    flex: 1,
    padding: 8,
  },
  partyLine: {
    fontSize: 8,
  },
  partyName: {
    fontSize: 9.5,
    fontWeight: 700,
    marginBottom: 3,
  },
  partyTitle: {
    color: "#1d4ed8",
    fontSize: 7.5,
    fontWeight: 700,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  qrImage: {
    height: 70,
    width: 70,
  },
  sello: {
    fontFamily: "Courier",
    fontSize: 6,
    wordBreak: "break-all",
  },
  seloLabel: {
    color: "#6b7280",
    fontSize: 7,
    marginBottom: 2,
    marginTop: 6,
    textTransform: "uppercase",
  },
  tableBody: {
    borderBottomColor: "#e5e7eb",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingVertical: 4,
  },
  tableHead: {
    backgroundColor: "#1d4ed8",
    flexDirection: "row",
    paddingVertical: 5,
  },
  tableHeadCant: {
    color: "#ffffff",
    fontSize: 7.5,
    fontWeight: 700,
    textAlign: "right",
    width: "8%",
  },
  tableHeadClave: {
    color: "#ffffff",
    fontSize: 7.5,
    fontWeight: 700,
    paddingLeft: 3,
    width: "14%",
  },
  tableHeadDescripcion: {
    color: "#ffffff",
    fontSize: 7.5,
    fontWeight: 700,
    width: "44%",
  },
  tableHeadImporte: {
    color: "#ffffff",
    fontSize: 7.5,
    fontWeight: 700,
    paddingRight: 3,
    textAlign: "right",
    width: "17%",
  },
  tableHeadPUnit: {
    color: "#ffffff",
    fontSize: 7.5,
    fontWeight: 700,
    textAlign: "right",
    width: "17%",
  },
  title: {
    color: "#1d4ed8",
    fontSize: 16,
    fontWeight: 700,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  totalRowStrong: {
    borderTopColor: "#1f2937",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    flexDirection: "row",
    fontWeight: 700,
    justifyContent: "space-between",
    paddingTop: 3,
    paddingVertical: 2,
  },
  totalsWrap: {
    alignSelf: "flex-end",
    marginTop: 6,
    width: "42%",
  },
});

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("es-MX", { currency, style: "currency" }).format(value);
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

type CfdiDocumentProps = {
  cfdi: ParsedCfdi;
  proposalNumber: string;
  qrDataUrl: string;
};

export function CfdiDocument({ cfdi, proposalNumber, qrDataUrl }: CfdiDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{cfdi.emisor.nombre}</Text>
            <Text style={styles.partyLine}>RFC: {cfdi.emisor.rfc}</Text>
            <Text style={styles.partyLine}>Régimen fiscal: {cfdi.emisor.regimenFiscal}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Factura (Ingreso)</Text>
            <Text style={styles.metaValue}>
              {cfdi.serie ?? ""}
              {cfdi.folio ?? proposalNumber}
            </Text>
            <Text style={styles.metaLabel}>Lugar y fecha de emisión</Text>
            <Text style={styles.metaValue}>
              {cfdi.lugarExpedicion} — {formatDate(cfdi.fecha)}
            </Text>
          </View>
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.partyBox}>
            <Text style={styles.partyTitle}>Receptor</Text>
            <Text style={styles.partyName}>{cfdi.receptor.nombre}</Text>
            <Text style={styles.partyLine}>RFC: {cfdi.receptor.rfc}</Text>
            {cfdi.receptor.domicilioFiscalReceptor ? (
              <Text style={styles.partyLine}>CP: {cfdi.receptor.domicilioFiscalReceptor}</Text>
            ) : null}
            <Text style={styles.partyLine}>Régimen fiscal: {cfdi.receptor.regimenFiscalReceptor}</Text>
            <Text style={styles.partyLine}>Uso CFDI: {cfdi.receptor.usoCFDI}</Text>
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.partyTitle}>Datos del comprobante</Text>
            <Text style={styles.partyLine}>Moneda: {cfdi.moneda}</Text>
            {cfdi.formaPago ? <Text style={styles.partyLine}>Forma de pago: {cfdi.formaPago}</Text> : null}
            {cfdi.metodoPago ? <Text style={styles.partyLine}>Método de pago: {cfdi.metodoPago}</Text> : null}
            <Text style={styles.partyLine}>Tipo de comprobante: {cfdi.tipoDeComprobante}</Text>
          </View>
        </View>

        <View style={styles.tableHead}>
          <Text style={styles.tableHeadClave}>Clave</Text>
          <Text style={styles.tableHeadDescripcion}>Concepto</Text>
          <Text style={styles.tableHeadCant}>Cant.</Text>
          <Text style={styles.tableHeadPUnit}>P. Unit.</Text>
          <Text style={styles.tableHeadImporte}>Importe</Text>
        </View>
        {cfdi.conceptos.map((concepto, index) => (
          <View key={`${concepto.claveProdServ}-${index}`} style={styles.tableBody}>
            <Text style={styles.cellClave}>{concepto.claveProdServ}</Text>
            <Text style={styles.cellDescripcion}>{concepto.descripcion}</Text>
            <Text style={styles.cellCant}>{concepto.cantidad.toFixed(2)}</Text>
            <Text style={styles.cellPUnit}>{formatCurrency(concepto.valorUnitario, cfdi.moneda)}</Text>
            <Text style={styles.cellImporte}>{formatCurrency(concepto.importe, cfdi.moneda)}</Text>
          </View>
        ))}

        <View style={styles.totalsWrap}>
          <View style={styles.totalRow}>
            <Text style={styles.cell}>Subtotal</Text>
            <Text style={styles.cell}>{formatCurrency(cfdi.subTotal, cfdi.moneda)}</Text>
          </View>
          {cfdi.totalImpuestosTrasladados ? (
            <View style={styles.totalRow}>
              <Text style={styles.cell}>IVA trasladado</Text>
              <Text style={styles.cell}>{formatCurrency(cfdi.totalImpuestosTrasladados, cfdi.moneda)}</Text>
            </View>
          ) : null}
          <View style={styles.totalRowStrong}>
            <Text style={styles.cell}>Total</Text>
            <Text style={styles.cell}>{formatCurrency(cfdi.total, cfdi.moneda)}</Text>
          </View>
        </View>

        <View style={styles.fiscalBox}>
          <View style={styles.footer}>
            <Image src={qrDataUrl} style={styles.qrImage} />
            <View style={{ flex: 1 }}>
              <Text style={styles.metaLabel}>Folio fiscal (UUID)</Text>
              <Text style={styles.metaValue}>{cfdi.timbre.uuid}</Text>
              <Text style={styles.metaLabel}>Fecha y hora de certificación</Text>
              <Text style={styles.metaValue}>{formatDate(cfdi.timbre.fechaTimbrado)}</Text>
              <Text style={styles.footerText}>
                No. Certificado emisor: {cfdi.noCertificado} · No. Certificado SAT: {cfdi.timbre.noCertificadoSAT} ·
                RFC del proveedor de certificación: {cfdi.timbre.rfcProvCertif}
              </Text>
            </View>
          </View>

          <Text style={styles.seloLabel}>Sello digital del CFDI</Text>
          <Text style={styles.sello}>{cfdi.sello}</Text>

          <Text style={styles.seloLabel}>Sello digital del SAT</Text>
          <Text style={styles.sello}>{cfdi.timbre.selloSAT}</Text>

          <Text style={styles.cadenaLabel}>Cadena original del complemento de certificación del SAT</Text>
          <Text style={styles.cadena}>{cfdi.cadenaOriginal}</Text>

          <Text style={[styles.footerText, { marginTop: 8, textAlign: "center" }]}>
            Este documento es una representación impresa de un CFDI
          </Text>
        </View>
      </Page>
    </Document>
  );
}
