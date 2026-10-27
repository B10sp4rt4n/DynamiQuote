import { intakeMissingFields } from "./opportunity-intake";
export function readIntakeMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  return data.version === 1 && data.kind === "quote-origin" ? data : null;
}
export function intakeSummary(value: unknown): { intakePending?: boolean; intakeQuoteId?: string } {
  const data = readIntakeMetadata(value);
  if (!data) return {};
  const title = typeof data.confirmedTitle === "string" ? data.confirmedTitle : "";
  const need = typeof data.need === "string" ? data.need : "";
  const source = typeof data.source === "string" ? data.source : "";
  return { intakePending: intakeMissingFields({ title, need, source }).length > 0,
    ...(typeof data.sourceQuoteId === "string" ? { intakeQuoteId: data.sourceQuoteId } : {}) };
}
