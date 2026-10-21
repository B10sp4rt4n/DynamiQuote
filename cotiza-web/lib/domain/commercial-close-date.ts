/** A calendar date in the business timezone, independent of the browser. */
export function mexicoCalendarDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Date-only anchor, not an assertion about the hour the customer decided.
 * 06:00 UTC preserves the selected CDMX calendar day, including historical DST.
 * The audit payload records datePrecision=day and the actual registration time.
 */
export function closeDateInstant(day: string): Date {
  return new Date(`${day}T06:00:00.000Z`);
}

export function isValidCloseDate(day: string, startedAt: Date | string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = closeDateInstant(day);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return false;
  const startDay = mexicoCalendarDate(startedAt);
  return startDay !== "" && day >= startDay && day <= mexicoCalendarDate(now);
}
