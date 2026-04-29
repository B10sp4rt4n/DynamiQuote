import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { ProposalWorkflowDetail } from "@/lib/db/proposals";

const styles = StyleSheet.create({
  body: {
    color: "#111827",
    fontSize: 11,
    lineHeight: 1.45,
    paddingBottom: 36,
    paddingHorizontal: 36,
    paddingTop: 36,
  },
  block: {
    borderTopColor: "#e5e7eb",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 10,
  },
  heading: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 8,
  },
  label: {
    color: "#6b7280",
    fontSize: 10,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  value: {
    fontSize: 12,
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

type ProposalPdfInput = {
  proposal: ProposalWorkflowDetail;
  tenantName: string;
};

export function ProposalPdfDocument({ proposal, tenantName }: ProposalPdfInput) {
  const formal = proposal.formal;

  return (
    <Document>
      <Page size="A4" style={styles.body}>
        <Text style={styles.heading}>Propuesta Comercial</Text>
        <Text style={styles.value}>Tenant: {tenantName}</Text>

        <View style={styles.block}>
          <View style={styles.row}>
            <View>
              <Text style={styles.label}>Folio</Text>
              <Text style={styles.value}>{formal?.proposalNumber ?? proposal.proposalId}</Text>
            </View>
            <View>
              <Text style={styles.label}>Estado</Text>
              <Text style={styles.value}>{statusLabel(proposal.status)}</Text>
            </View>
          </View>

          <View style={styles.row}>
            <View>
              <Text style={styles.label}>Cliente</Text>
              <Text style={styles.value}>{formal?.recipientCompany ?? "Sin cliente"}</Text>
            </View>
            <View>
              <Text style={styles.label}>Fecha de emision</Text>
              <Text style={styles.value}>{formatDate(formal?.issuedDate)}</Text>
            </View>
          </View>

          <View>
            <Text style={styles.label}>Asunto</Text>
            <Text style={styles.value}>{formal?.subject ?? "Sin asunto"}</Text>
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Condiciones comerciales</Text>
          <Text style={styles.value}>
            {formal?.termsAndConditions?.trim() ||
              "No se registraron condiciones comerciales para esta propuesta."}
          </Text>
        </View>
      </Page>
    </Document>
  );
}