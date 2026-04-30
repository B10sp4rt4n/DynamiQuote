import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { ProposalWorkflowDetail } from "@/lib/db/proposals";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#1f2937",
    fontSize: 10,
    lineHeight: 1.4,
    paddingBottom: 36,
    paddingHorizontal: 26,
    paddingTop: 20,
  },
  header: {
    marginBottom: 10,
    textAlign: "center",
  },
  logo: {
    color: "#be185d",
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  title: {
    color: "#1f2937",
    fontSize: 15,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  folio: {
    color: "#1f2937",
    fontSize: 11,
    fontWeight: 700,
    marginTop: 2,
  },
  metadataHeader: {
    borderColor: "#60a5fa",
    borderStyle: "solid",
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 8,
  },
  metadataHeaderCell: {
    borderRightColor: "#60a5fa",
    borderRightStyle: "solid",
    borderRightWidth: 1,
    color: "#1f2937",
    fontSize: 8,
    fontWeight: 700,
    paddingHorizontal: 6,
    paddingVertical: 3,
    textTransform: "uppercase",
    width: "50%",
  },
  metadataHeaderCellLast: {
    color: "#1f2937",
    fontSize: 8,
    fontWeight: 700,
    paddingHorizontal: 6,
    paddingVertical: 3,
    textTransform: "uppercase",
    width: "50%",
  },
  metadataBody: {
    borderBottomColor: "#cbd5e1",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    borderLeftColor: "#cbd5e1",
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    borderRightColor: "#cbd5e1",
    borderRightStyle: "solid",
    borderRightWidth: 1,
    flexDirection: "row",
    marginBottom: 8,
  },
  metadataCol: {
    borderRightColor: "#e5e7eb",
    borderRightStyle: "solid",
    borderRightWidth: 1,
    minHeight: 82,
    paddingHorizontal: 6,
    paddingVertical: 5,
    width: "50%",
  },
  metadataColLast: {
    minHeight: 82,
    paddingHorizontal: 6,
    paddingVertical: 5,
    width: "50%",
  },
  companyName: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 1,
  },
  micro: {
    fontSize: 8,
    marginBottom: 1,
  },
  dates: {
    marginBottom: 8,
    textAlign: "right",
  },
  subjectBox: {
    borderLeftColor: "#60a5fa",
    borderLeftStyle: "solid",
    borderLeftWidth: 3,
    marginBottom: 8,
    paddingLeft: 8,
  },
  narrativeText: {
    fontSize: 8.5,
    marginBottom: 9,
    textAlign: "justify",
  },
  sectionHeader: {
    borderColor: "#60a5fa",
    borderStyle: "solid",
    borderBottomWidth: 1,
    borderTopWidth: 1,
    color: "#1f2937",
    fontSize: 8,
    fontWeight: 700,
    marginBottom: 0,
    marginTop: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    textTransform: "uppercase",
  },
  tableHeadRow: {
    backgroundColor: "#1f2937",
    flexDirection: "row",
    paddingVertical: 4,
  },
  cellPartida: {
    paddingLeft: 3,
    width: "7%",
  },
  cellSku: {
    width: "12%",
  },
  cellDesc: {
    paddingRight: 4,
    width: "41%",
  },
  cellQty: {
    textAlign: "right",
    width: "9%",
  },
  cellUnit: {
    textAlign: "right",
    width: "14%",
  },
  cellImporte: {
    textAlign: "right",
    width: "17%",
  },
  headText: {
    color: "#ffffff",
    fontSize: 7.4,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  tableBodyRow: {
    borderBottomColor: "#d1d5db",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 22,
    paddingVertical: 4,
  },
  rowText: {
    fontSize: 7.6,
  },
  totalsWrap: {
    alignSelf: "flex-end",
    marginTop: 8,
    width: "42%",
  },
  totalLine: {
    borderBottomColor: "#e5e7eb",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalLineStrong: {
    borderBottomColor: "#1f2937",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  termsList: {
    fontSize: 8,
    marginTop: 4,
  },
  termItem: {
    marginBottom: 2,
  },
  signatureWrap: {
    alignItems: "center",
    marginTop: 18,
  },
  signatureLine: {
    borderTopColor: "#374151",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    width: 170,
  },
  signatureName: {
    fontSize: 8.5,
    fontWeight: 700,
    marginTop: 4,
    textAlign: "center",
  },
  signatureRole: {
    fontSize: 8,
    textAlign: "center",
  },
  footer: {
    borderTopColor: "#e5e7eb",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    bottom: 18,
    color: "#6b7280",
    fontSize: 8,
    left: 32,
    paddingTop: 4,
    position: "absolute",
    right: 32,
    textAlign: "right",
  },
});

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "N/D";
  }

  return new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(value));
}

function statusLabel(value: ProposalWorkflowDetail["status"]): string {
  const labels: Record<ProposalWorkflowDetail["status"], string> = {
    approved: "Aprobada",
    draft: "Borrador",
    expired: "Vencida",
    in_review: "En revision",
    rejected: "Rechazada",
    sent: "Enviada",
  };

  return labels[value] ?? value;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    currency: "MXN",
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function buildTermsList(terms: string): string[] {
  const lines = terms
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.length > 0
    ? lines
    : [
        "Validez de propuesta: 15 dias naturales.",
        "Tiempo de entrega sujeto a disponibilidad y confirmacion de pedido.",
        "Precios en moneda nacional, no incluyen IVA salvo indicacion expresa.",
        "El inicio de servicios queda sujeto a aprobacion formal del cliente.",
      ];
}

type ProposalPdfInput = {
  proposal: ProposalWorkflowDetail;
  tenantName: string;
};

export function ProposalPdfDocument({ proposal, tenantName }: ProposalPdfInput) {
  const formal = proposal.formal;
  const lines = proposal.items ?? [];
  const totalCost = lines.reduce((sum, item) => sum + item.subtotalCost, 0);
  const totalRevenue = lines.reduce((sum, item) => sum + item.subtotalPrice, 0);
  const grossProfit = totalRevenue - totalCost;
  const iva = totalRevenue * 0.16;
  const grandTotal = totalRevenue + iva;
  const terms = buildTermsList(formal?.termsAndConditions?.trim() ?? "");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.logo}>{formal?.issuerCompany || tenantName}</Text>
          <Text style={styles.title}>Propuesta Comercial</Text>
          <Text style={styles.folio}>{formal?.proposalNumber ?? proposal.proposalId}</Text>
        </View>

        <View style={styles.metadataHeader}>
          <Text style={styles.metadataHeaderCell}>Datos del emisor</Text>
          <Text style={styles.metadataHeaderCellLast}>Datos del cliente</Text>
        </View>
        <View style={styles.metadataBody}>
          <View style={styles.metadataCol}>
            <Text style={styles.companyName}>{formal?.issuerCompany || tenantName}</Text>
            <Text style={styles.micro}>{formal?.issuerContactName || proposal.salesOwner || "Sin vendedor"}</Text>
            <Text style={styles.micro}>{formal?.issuerPhone || "Telefono no disponible"}</Text>
            <Text style={styles.micro}>{formal?.issuerEmail || "correo no disponible"}</Text>
          </View>
          <View style={styles.metadataColLast}>
            <Text style={styles.companyName}>{formal?.recipientCompany || "Cliente sin definir"}</Text>
            <Text style={styles.micro}>{formal?.recipientContactName || "Contacto por definir"}</Text>
            <Text style={styles.micro}>{formal?.recipientContactTitle || "Cargo no definido"}</Text>
            <Text style={styles.micro}>{formal?.recipientEmail || "correo no disponible"}</Text>
          </View>
        </View>

        <View style={styles.dates}>
          <Text style={styles.micro}>Fecha: {formatDate(formal?.issuedDate)}</Text>
          <Text style={styles.micro}>Estado: {statusLabel(proposal.status)}</Text>
        </View>

        <View style={styles.subjectBox}>
          <Text style={styles.rowText}>Asunto: {formal?.subject ?? "Sin asunto"}</Text>
        </View>

        <Text style={styles.narrativeText}>
          C. {formal?.recipientContactName || "Cliente"}: por medio de la presente, {formal?.issuerCompany || tenantName} presenta esta propuesta comercial con base en la informacion vigente de la cotizacion {proposal.origin ?? "N/D"}. Esta propuesta mantiene trazabilidad por tenant, vendedor responsable y estructura de costos/venta por partida.
        </Text>

        <Text style={styles.sectionHeader}>Detalle de la propuesta</Text>

        <View style={styles.tableHeadRow}>
            <Text style={[styles.headText, styles.cellPartida]}>#</Text>
            <Text style={[styles.headText, styles.cellSku]}>SKU</Text>
            <Text style={[styles.headText, styles.cellDesc]}>Descripcion</Text>
            <Text style={[styles.headText, styles.cellQty]}>Cant.</Text>
            <Text style={[styles.headText, styles.cellUnit]}>Precio unit.</Text>
            <Text style={[styles.headText, styles.cellImporte]}>Importe</Text>
        </View>

        {lines.length > 0 ? (
            lines.map((item, index) => (
              <View key={`${item.itemNumber}-${index}`} style={styles.tableBodyRow}>
                <Text style={[styles.rowText, styles.cellPartida]}>{item.itemNumber}</Text>
                <Text style={[styles.rowText, styles.cellSku]}>{item.sku || "-"}</Text>
                <Text style={[styles.rowText, styles.cellDesc]}>{item.description || "Sin descripcion"}</Text>
                <Text style={[styles.rowText, styles.cellQty]}>{formatQuantity(item.quantity)}</Text>
                <Text style={[styles.rowText, styles.cellUnit]}>{formatCurrency(item.priceUnit)}</Text>
                <Text style={[styles.rowText, styles.cellImporte]}>{formatCurrency(item.subtotalPrice)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.tableBodyRow}>
              <Text style={[styles.rowText, styles.cellDesc]}>No hay partidas registradas.</Text>
            </View>
          )}

        <View style={styles.totalsWrap}>
            <View style={styles.totalLine}>
              <Text style={styles.rowText}>Subtotal:</Text>
              <Text style={styles.rowText}>{formatCurrency(totalRevenue)}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.rowText}>IVA (16%):</Text>
              <Text style={styles.rowText}>{formatCurrency(iva)}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.rowText}>Utilidad:</Text>
              <Text style={styles.rowText}>{formatCurrency(grossProfit)}</Text>
            </View>
            <View style={styles.totalLineStrong}>
              <Text style={styles.rowText}>TOTAL:</Text>
              <Text style={styles.rowText}>{formatCurrency(grandTotal)}</Text>
            </View>
          </View>

        <Text style={styles.sectionHeader}>Terminos y condiciones</Text>
        <View style={styles.termsList}>
          {terms.map((term, index) => (
            <Text key={`term-${index}`} style={styles.termItem}>
              - {term}
            </Text>
          ))}
        </View>

        <View style={styles.signatureWrap}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureName}>{formal?.issuerContactName || proposal.salesOwner || "Responsable comercial"}</Text>
          <Text style={styles.signatureRole}>Representante Comercial</Text>
          <Text style={styles.signatureRole}>{formal?.issuerCompany || tenantName}</Text>
        </View>

        <Text
          fixed
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Pagina ${pageNumber} de ${totalPages}`
          }
          style={styles.footer}
        />
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionHeader}>Anexo tecnico y alcance</Text>
        <Text style={styles.narrativeText}>
          Este anexo se entrega en modo prueba para validar el flujo completo de propuesta formal. El objetivo es asegurar que la informacion de emisor, receptor, vendedor, partidas y terminos se conserve correctamente en cada version del documento, con trazabilidad por tenant y consistencia operativa durante el ciclo cotizacion-propuesta.
        </Text>
        <Text style={styles.narrativeText}>
          El contenido de este documento puede adaptarse por industria sin modificar el motor base. Para un despliegue productivo, se recomienda cargar logotipo oficial del emisor, reglas fiscales definitivas y condiciones comerciales estandarizadas por tenant.
        </Text>
        <View style={styles.totalsWrap}>
          <View style={styles.totalLine}>
            <Text style={styles.rowText}>Referencia propuesta:</Text>
            <Text style={styles.rowText}>{formal?.proposalNumber ?? proposal.proposalId}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={styles.rowText}>Cotizacion origen:</Text>
            <Text style={styles.rowText}>{proposal.origin ?? "N/D"}</Text>
          </View>
          <View style={styles.totalLineStrong}>
            <Text style={styles.rowText}>Emisor:</Text>
            <Text style={styles.rowText}>{formal?.issuerCompany || tenantName}</Text>
          </View>
        </View>
        <Text
          fixed
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Pagina ${pageNumber} de ${totalPages}`
          }
          style={styles.footer}
        />
      </Page>
    </Document>
  );
}