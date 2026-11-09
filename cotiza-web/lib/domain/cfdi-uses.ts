import catalog from "@/lib/data/sat-uso-cfdi.json";

export const CFDI_USES = catalog.entries;
export const CFDI_USE_GROUPS = ["Gastos", "Inversiones", "Deducciones personales", "Usos especiales"];

export function isCfdiUseCompatible(code: string, rfc: string, regime: string): boolean {
  const entry = CFDI_USES.find((item) => item.code === code);
  if (!entry) return false;
  const normalizedRfc = rfc.trim().toUpperCase();
  if (["XAXX010101000", "XEXX010101000"].includes(normalizedRfc)) return code === "S01";
  if (/^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/.test(normalizedRfc) && !entry.moral) return false;
  if (/^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/.test(normalizedRfc) && !entry.physical) return false;
  return !regime.trim() || entry.regimes.includes(regime.trim());
}

export function clientCfdiUseIssue(code: string, rfc: string, regime: string): string | null {
  if (!code) return null; // A client can be saved before its fiscal data is complete.
  const entry = CFDI_USES.find((item) => item.code === code);
  if (!entry) return "El uso guardado no está en el catálogo CFDI 4.0. Selecciona una clave vigente o déjalo pendiente.";
  if (entry.document !== "invoice") return `${code} corresponde a ${entry.document === "payment" ? "complementos de pago" : "recibos de nómina"}. Selecciona el uso habitual para facturas o déjalo pendiente.`;
  if (!isCfdiUseCompatible(code, rfc, regime)) return "El uso seleccionado no corresponde al RFC o régimen fiscal capturado. Elige uno compatible o déjalo pendiente.";
  return null;
}
