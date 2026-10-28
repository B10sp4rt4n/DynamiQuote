export function archiveReasonFromMetadata(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const history = (value as Record<string,unknown>).archiveHistory;
  if (!Array.isArray(history)) return null;
  const last = history[history.length - 1];
  return last && typeof last === "object" && last.action === "archive" && typeof last.reason === "string" ? last.reason : null;
}
