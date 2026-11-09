export type BusinessStage = "open" | "won" | "lost" | "paused" | "no_decision";
export type CommercialContext = {
  opportunityId: string; opportunityNumber?: string; title?: string;
  quoteId?: string; proposalId?: string; stage?: BusinessStage;
};
export type WorkspaceQuote = { quote_id: string; quote_group_id: string | null; status: string | null };
export type WorkspaceProposal = {
  proposal_id: string; status: string; outcome: string | null;
  invoice_status?: string | null; invoice_draft_id?: string | null;
  invoice_uuid?: string | null; invoice_stamped_at?: Date | string | null;
  formal_proposals: readonly { status: string | null; currency?: string | null }[];
};
export type BusinessAction = { label: string; href: string; message: string };

export function isProposalAuthorized(proposal: WorkspaceProposal): boolean {
  const status = (proposal.formal_proposals[0]?.status ?? proposal.status).trim().toLowerCase();
  return ["approved", "aprobada"].includes(status);
}

export function proposalStatusLabel(proposal: WorkspaceProposal): string {
  const status = (proposal.formal_proposals[0]?.status ?? proposal.status).trim().toLowerCase();
  const labels: Record<string, string> = { approved: "Autorizada", aprobada: "Autorizada", draft: "Borrador", borrador: "Borrador",
    in_review: "En revisión", "en revisión": "En revisión", "en revision": "En revisión", "in review": "En revisión",
    rejected: "Rechazada", rechazada: "Rechazada", expired: "Vencida", vencida: "Vencida", sent: "Enviada", enviada: "Enviada" };
  return labels[status] ?? "Sin estado identificado";
}

export function proposalBillingLabel(proposal: WorkspaceProposal): string {
  if (proposal.invoice_status === "stamping") return "Timbrado por verificar";
  if (proposal.invoice_uuid?.trim()) return "CFDI registrado";
  if (proposal.invoice_status === "stamped" || proposal.invoice_stamped_at) return "Registro fiscal incompleto";
  if (proposal.invoice_status === "rejected") return "Prefactura por revisar";
  if (proposal.invoice_draft_id) return "Prefactura preparada";
  return "Sin CFDI registrado";
}

export function businessBillingSection(proposals: readonly WorkspaceProposal[], enabled: boolean, opportunityId: string, needsReview = false) {
  const fallback = `/oportunidades/${encodeURIComponent(opportunityId)}#propuestas`;
  if (!enabled) return { href: fallback, label: "No habilitada para esta empresa" };
  const winning = proposals.filter(row => row.outcome === "won");
  if (needsReview || winning.length > 1) return { href: fallback, label: "Revisar propuestas ganadas" };
  const proposal = winning[0];
  if (!proposal) return { href: fallback, label: "Sin propuesta ganada vinculada" };
  const state = proposalBillingLabel(proposal);
  if (state === "Sin CFDI registrado" && !isProposalAuthorized(proposal)) return { href: `/propuestas/${encodeURIComponent(proposal.proposal_id)}`, label: "Autorización pendiente" };
  return { href: `/propuestas/${encodeURIComponent(proposal.proposal_id)}#facturacion`,
    label: state === "Sin CFDI registrado" ? "Pendiente de preparar" : state };
}

export function businessDocumentSummary(quotes: readonly WorkspaceQuote[], proposals: readonly WorkspaceProposal[]) {
  const quoteCount = new Set(quotes.map(quote => quote.quote_group_id?.trim() || quote.quote_id)).size;
  const authorizedCount = proposals.filter(isProposalAuthorized).length;
  return {
    quotes: quoteCount ? `${quoteCount} ${quoteCount === 1 ? "cotización" : "cotizaciones"} · ${quotes.length} ${quotes.length === 1 ? "revisión" : "revisiones"}` : "Sin cotizaciones vinculadas en esta vista",
    proposals: proposals.length ? `${proposals.length} ${proposals.length === 1 ? "propuesta" : "propuestas"} · ${authorizedCount} ${authorizedCount === 1 ? "autorizada" : "autorizadas"}` : "Sin propuestas vinculadas en esta vista",
  };
}

export function businessAmountCurrency(proposals: readonly WorkspaceProposal[], stage: BusinessStage) {
  const relevant = proposals.filter(proposal => stage === "won" ? proposal.outcome === "won" : stage === "lost" ? proposal.outcome === "lost" : proposal.outcome === null);
  const values = relevant.map(proposal => proposal.formal_proposals[0]?.currency?.trim().toUpperCase());
  const known = values.filter((value): value is string => Boolean(value && /^[A-Z]{3}$/.test(value)));
  const distinct = [...new Set(known)];
  return { currency: values.length && known.length === values.length && distinct.length === 1 ? distinct[0]! : null,
    label: distinct.length > 1 ? "Varias monedas; revisar importes" : "Moneda por confirmar", mixed: distinct.length > 1 };
}

export function getBusinessFollowUp(input: {
  opportunityId: string; stage: BusinessStage; clientId: string | null;
  quotes: readonly WorkspaceQuote[]; proposals: readonly WorkspaceProposal[];
  billingEnabled: boolean; alternativesNeedReview?: boolean;
}): BusinessAction {
  const { opportunityId, stage, quotes, proposals } = input;
  const base = `/oportunidades/${encodeURIComponent(opportunityId)}`;
  const proposalLink = (id: string) => `/propuestas/${encodeURIComponent(id)}`;
  const winning = proposals.filter(proposal => proposal.outcome === "won");
  if (stage === "won") {
    if (input.alternativesNeedReview) return { label: "Revisar alternativas ganadas", href: `${base}#propuestas`, message: "El negocio está ganado. Hay decisiones de alternativas que requieren revisión antes de continuar con la facturación." };
    if (!winning.length) return { label: "Revisar documentos del cierre", href: `${base}#${quotes.length ? "cotizaciones" : "propuestas"}`, message: !quotes.length && !proposals.length
      ? "Cierre registrado sin cotización o propuesta vinculada en esta vista. Puedes consultar sus antecedentes sin volver a iniciar el proceso comercial."
      : "El cierre está registrado. No hay una propuesta ganada vinculada en esta vista; revisa los documentos disponibles como antecedente." };
    if (winning.length > 1) return { label: "Revisar propuestas ganadas", href: `${base}#propuestas`, message: "El negocio está ganado. Revisa la facturación y el seguimiento de cada propuesta ganada vinculada." };
    const proposal = winning[0]!;
    if (!input.billingEnabled) return { label: "Consultar propuesta ganada", href: proposalLink(proposal.proposal_id), message: "El negocio está ganado. Consulta el cierre y sus documentos; la facturación no está habilitada para esta empresa." };
    const href = `${proposalLink(proposal.proposal_id)}#facturacion`;
    const hasUuid = Boolean(proposal.invoice_uuid?.trim());
    if (proposal.invoice_status === "stamping" || (!hasUuid && (proposal.invoice_status === "stamped" || proposal.invoice_stamped_at))) return { label: "Verificar resultado del timbrado", href, message: "El cierre está registrado y el resultado fiscal requiere verificación. Consulta el estado de la operación antes de volver a emitir." };
    if (hasUuid) return { label: "Revisar factura y pagos", href, message: "Hay un CFDI registrado para la propuesta ganada. Consulta su estado fiscal y los pagos en el seguimiento de la propuesta." };
    if (!isProposalAuthorized(proposal)) return { label: "Revisar autorización de la propuesta", href: proposalLink(proposal.proposal_id), message: "El negocio está ganado. Revisa la autorización actual de la propuesta antes de preparar su prefactura." };
    if (proposal.invoice_draft_id || proposal.invoice_status === "rejected") return { label: "Revisar prefactura", href, message: "El negocio está ganado. Revisa la prefactura y los datos fiscales antes de continuar con la emisión." };
    return { label: "Preparar prefactura", href, message: "El negocio está ganado. Confirma los datos fiscales del cliente para preparar la prefactura de la propuesta ganada." };
  }
  if (stage === "paused") return { label: "Revisar pausa y seguimiento", href: `${base}#resumen-negocio`, message: "El negocio está pausado. Consulta el motivo y la fecha para retomarlo en Revisar oportunidad." };
  if (stage === "lost" || stage === "no_decision") return { label: "Consultar antecedentes del cierre", href: `${base}#propuestas`, message: "El negocio está cerrado. Conserva sus documentos y consulta el resultado registrado." };
  if (!input.clientId) return { label: "Revisar datos del negocio", href: `${base}#datos-oportunidad`, message: "El negocio no tiene un cliente asociado. Revisa sus datos antes de continuar con la cotización." };
  const active = proposals.find(proposal => proposal.outcome === null);
  if (active) return { label: isProposalAuthorized(active) ? "Revisar propuesta autorizada" : "Revisar propuesta", href: proposalLink(active.proposal_id), message: "Continúa con la propuesta vinculada y registra el resultado cuando el cliente tome una decisión." };
  const quote = quotes.find(quote => quote.status !== "archived");
  if (quote) return { label: "Continuar cotización", href: `/cotizaciones?quoteId=${encodeURIComponent(quote.quote_id)}`, message: "Revisa productos y precios de la cotización para preparar la propuesta." };
  if (quotes.length) return { label: "Revisar cotizaciones archivadas", href: `${base}#cotizaciones`, message: "Las cotizaciones vinculadas están archivadas. Consulta el antecedente que corresponda antes de continuar." };
  return { label: "Crear primera cotización", href: `/cotizaciones?opportunityId=${encodeURIComponent(opportunityId)}`, message: "Prepara los productos y precios del negocio para generar su primera propuesta." };
}
