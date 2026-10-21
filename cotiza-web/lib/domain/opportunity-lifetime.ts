// Full elapsed 24-hour periods. Closed opportunities without an observed
// decision date deliberately have no duration; creation is never a fallback.
export function opportunityLifetimeDays(
  createdAt: string,
  closedAt: string | null,
  stage: "open" | "won" | "lost",
  now: Date,
): number | null {
  const end = stage === "open" ? now.getTime() : closedAt ? Date.parse(closedAt) : NaN;
  const start = Date.parse(createdAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / 86_400_000);
}
