import {
  Document,
  Image,
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
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  brandBox: {
    alignItems: "center",
    borderColor: "#e5e7eb",
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: 4,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 6,
    paddingVertical: 4,
    width: "48%",
  },
  brandImage: {
    maxHeight: 40,
    maxWidth: 150,
    objectFit: "contain",
  },
  brandFallback: {
    color: "#6b7280",
    fontSize: 8,
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
    width: "17%",
  },
  cellDesc: {
    paddingRight: 4,
    width: "36%",
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
  traceWrap: {
    marginTop: 10,
    width: "100%",
  },
  traceLine: {
    borderBottomColor: "#e5e7eb",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingVertical: 3,
  },
  traceLineStrong: {
    borderBottomColor: "#1f2937",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingVertical: 4,
  },
  traceLabel: {
    fontSize: 7.6,
    minWidth: 110,
    width: 110,
  },
  traceValue: {
    flex: 1,
    fontSize: 7.6,
    textAlign: "right",
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

function normalizeTextValue(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function formatRecipientIdentity(formal: ProposalWorkflowDetail["formal"]): {
  displayName: string;
  displayTitle: string;
} {
  const rawName = normalizeTextValue(formal?.recipientContactName);
  const rawTitle = normalizeTextValue(formal?.recipientContactTitle);

  if (!rawName && !rawTitle) {
    return {
      displayName: "Contacto por definir",
      displayTitle: "Cargo no definido",
    };
  }

  const titleLooksLikeRole = /(director|gerente|jefe|subdirector|coordinador|lider|lead|manager|ingenier|administrador|owner|responsable)/i.test(rawTitle);

  if (rawName && rawTitle && !titleLooksLikeRole && rawName.split(/\s+/).length === 1) {
    return {
      displayName: `${rawName} ${rawTitle}`.trim(),
      displayTitle: "Cargo no definido",
    };
  }

  return {
    displayName: rawName || "Contacto por definir",
    displayTitle: rawTitle || "Cargo no definido",
  };
}

type ProposalPdfInput = {
  proposal: ProposalWorkflowDetail;
  tenantName: string;
};

export function ProposalPdfDocument({ proposal, tenantName }: ProposalPdfInput) {
  const formal = proposal.formal;
  const recipientIdentity = formatRecipientIdentity(formal);
  const issuerPhoneDisplay = normalizeTextValue(formal?.issuerPhone) || "Telefono no disponible";
  const issuerEmailDisplay = normalizeTextValue(formal?.issuerEmail) || "correo no disponible";
  const recipientEmailDisplay = normalizeTextValue(formal?.recipientEmail) || "correo no disponible";
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
          <View style={styles.brandRow}>
            <View style={styles.brandBox}>
              {formal?.issuerLogoDataUrl ? (
                <Image src={formal.issuerLogoDataUrl} style={styles.brandImage} />
              ) : (
                <Text style={styles.brandFallback}>{formal?.issuerCompany || tenantName}</Text>
              )}
            </View>
            <View style={styles.brandBox}>
              {formal?.clientLogoDataUrl ? (
                <Image src={formal.clientLogoDataUrl} style={styles.brandImage} />
              ) : (
                <Text style={styles.brandFallback}>{formal?.recipientCompany || "Cliente sin logo"}</Text>
              )}
            </View>
          </View>
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
            <Text style={styles.micro}>{issuerPhoneDisplay}</Text>
            <Text style={styles.micro}>{issuerEmailDisplay}</Text>
          </View>
          <View style={styles.metadataColLast}>
            <Text style={styles.companyName}>{formal?.recipientCompany || "Cliente sin definir"}</Text>
            <Text style={styles.micro}>{recipientIdentity.displayName}</Text>
            <Text style={styles.micro}>{recipientIdentity.displayTitle}</Text>
            <Text style={styles.micro}>{recipientEmailDisplay}</Text>
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
          {recipientIdentity.displayName || "Cliente"}: Adjuntamos la propuesta comercial para {formal?.recipientCompany || "su negocio"}. A continuación encontrará el detalle de partidas, precios y condiciones de negociación.
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
        <Text style={styles.sectionHeader}>Hoja de trazabilidad y cierre</Text>
        <Text style={styles.narrativeText}>
          Esta propuesta fue preparada por {formal?.issuerCompany || tenantName} para {formal?.recipientCompany || "cliente sin definir"}. El contenido, precios y condiciones tienen vigencia segun lo indicado en la seccion de condiciones comerciales. Cualquier modificacion posterior a la fecha de emision debera formalizarse por escrito entre las partes.
        </Text>
        <View style={styles.traceWrap}>
          <View style={styles.traceLine}>
            <Text style={styles.traceLabel}>Propuesta:</Text>
            <Text style={styles.traceValue}>{formal?.proposalNumber ?? proposal.proposalId}</Text>
          </View>
          <View style={styles.traceLine}>
            <Text style={styles.traceLabel}>Cotizacion origen:</Text>
            <Text style={styles.traceValue}>{proposal.origin ?? "N/D"}</Text>
          </View>
          <View style={styles.traceLine}>
            <Text style={styles.traceLabel}>Fecha de emision:</Text>
            <Text style={styles.traceValue}>{formatDate(formal?.issuedDate)}</Text>
          </View>
          <View style={styles.traceLine}>
            <Text style={styles.traceLabel}>Vendedor responsable:</Text>
            <Text style={styles.traceValue}>{formal?.issuerContactName || proposal.salesOwner || "Sin asignar"}</Text>
          </View>
          <View style={styles.traceLine}>
            <Text style={styles.traceLabel}>Emisor:</Text>
            <Text style={styles.traceValue}>{formal?.issuerCompany || tenantName}</Text>
          </View>
          <View style={styles.traceLine}>
            <Text style={styles.traceLabel}>Cliente:</Text>
            <Text style={styles.traceValue}>{formal?.recipientCompany || "Sin definir"}</Text>
          </View>
          <View style={styles.traceLine}>
            <Text style={styles.traceLabel}>Contacto receptor:</Text>
            <Text style={styles.traceValue}>
              {recipientIdentity.displayName}{recipientIdentity.displayTitle && recipientIdentity.displayTitle !== "Cargo no definido" ? `\n${recipientIdentity.displayTitle}` : ""}
            </Text>
          </View>
          <View style={styles.traceLine}>
            <Text style={styles.traceLabel}>Partidas incluidas:</Text>
            <Text style={styles.traceValue}>{lines.length}</Text>
          </View>
          <View style={styles.traceLine}>
            <Text style={styles.traceLabel}>Subtotal sin IVA:</Text>
            <Text style={styles.traceValue}>{formatCurrency(totalRevenue)}</Text>
          </View>
          <View style={styles.traceLineStrong}>
            <Text style={styles.traceLabel}>Total con IVA (16%):</Text>
            <Text style={styles.traceValue}>{formatCurrency(grandTotal)}</Text>
          </View>
        </View>
        <Text style={styles.narrativeText}>
          Para cualquier aclaracion relacionada con esta propuesta, favor de contactar a {formal?.issuerContactName || proposal.salesOwner || "el representante comercial"} al correo {issuerEmailDisplay}{issuerPhoneDisplay !== "Telefono no disponible" ? ` o al telefono ${issuerPhoneDisplay}` : ""}.
        </Text>
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