/** Older quotes persisted this placeholder as if it were a commercial name. */
export function normalizeQuoteName(value: string | null | undefined): string {
  const name = value?.trim() ?? "";
  return ["sin propuesta", "cotización sin nombre"].includes(name.toLocaleLowerCase("es-MX")) ? "" : name;
}

export function quoteNameLabel(value: string | null | undefined): string {
  return normalizeQuoteName(value) || "Cotización sin nombre";
}
