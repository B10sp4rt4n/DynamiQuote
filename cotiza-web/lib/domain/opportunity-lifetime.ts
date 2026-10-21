import { mexicoCalendarDate } from "./commercial-close-date";

// Open opportunities retain full elapsed 24-hour periods. A closed opportunity
// uses calendar days: the selected close is a date, not an asserted hour.
// Historical decisions without a confirmed date still have no duration.
export function opportunityLifetimeDays(
  createdAt: string,
  closedAt: string | null,
  stage: "open" | "won" | "lost",
  now: Date,
): number | null {
  const end = stage === "open" ? now.getTime() : closedAt ? Date.parse(closedAt) : NaN;
  const start = Date.parse(createdAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (stage !== "open") {
    const startDay = mexicoCalendarDate(createdAt);
    const endDay = mexicoCalendarDate(new Date(end));
    if (endDay < startDay) return null;
    return (Date.parse(endDay) - Date.parse(startDay)) / 86_400_000;
  }
  if (end < start) return null;
  return Math.floor((end - start) / 86_400_000);
}
