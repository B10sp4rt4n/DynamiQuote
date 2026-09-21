// Terminos y condiciones del PDF de propuesta. Cuando la propuesta no trae
// terminos propios, los por defecto se arman con los datos de la MISMA
// propuesta (vigencia, moneda, IVA) en vez de texto fijo -- antes decian
// "15 dias naturales" y "moneda nacional" aunque el encabezado del mismo
// documento dijera "Valido hasta: 30 de septiembre" y "Moneda: USD".
// Salvador, 2026-09-21: "o se quitan o se replican, no son consistentes".
export type ProposalTermsContext = {
  currency: string | null | undefined;
  // Ya formateada por el PDF (misma cadena que el encabezado "Valido hasta")
  // para que ambos lugares nunca difieran.
  validUntilLabel: string | null;
};

const CURRENCY_LABELS: Record<string, string> = {
  EUR: "euros (EUR)",
  MXN: "pesos mexicanos (MXN)",
  USD: "dolares estadounidenses (USD)",
};

export function buildDefaultTermsLines(context: ProposalTermsContext): string[] {
  const validity = context.validUntilLabel
    ? `Vigencia de la propuesta: hasta el ${context.validUntilLabel}.`
    : "Vigencia de la propuesta: 15 dias naturales a partir de su emision.";

  const currencyCode = context.currency?.trim().toUpperCase();
  const currencyLabel = currencyCode ? (CURRENCY_LABELS[currencyCode] ?? currencyCode) : null;
  const taxNote = "Los importes no incluyen IVA; el IVA (16%) se desglosa en los totales.";
  const prices = currencyLabel ? `Precios expresados en ${currencyLabel}. ${taxNote}` : taxNote;

  return [
    validity,
    "Tiempo de entrega sujeto a disponibilidad y confirmacion de pedido.",
    prices,
    "El inicio de servicios queda sujeto a aprobacion formal del cliente.",
  ];
}

export function buildTermsList(terms: string, context: ProposalTermsContext): string[] {
  const lines = terms
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.length > 0 ? lines : buildDefaultTermsLines(context);
}
