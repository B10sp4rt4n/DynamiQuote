import { describe, expect, it } from "vitest";
import { closeDateInstant, earliestCommercialStart, isValidCloseDate, mexicoCalendarDate } from "./commercial-close-date";

describe("selected commercial close date", () => {
  const now = new Date("2026-10-22T02:00:00Z"); // still October 21 in CDMX
  const start = "2026-07-01T19:00:00Z";
  it("uses the business day, not UTC or the browser timezone", () => {
    expect(mexicoCalendarDate(now)).toBe("2026-10-21");
    expect(mexicoCalendarDate(closeDateInstant("2026-09-01"))).toBe("2026-09-01");
    expect(isValidCloseDate("2026-10-21", start, now)).toBe(true);
    expect(isValidCloseDate("2026-10-22", start, now)).toBe(false);
  });
  it("accepts a same-day close even though no hour was requested", () => {
    expect(isValidCloseDate("2026-07-01", start, now)).toBe(true);
    expect(isValidCloseDate("2026-06-30", start, now)).toBe(false);
  });
  it("rejects nonexistent calendar days and malformed values", () => {
    for (const day of ["2026-02-30", "2026-13-01", "today", "2026-2-3", "2026-07-01T12:00Z"]) {
      expect(isValidCloseDate(day, "2025-01-01", now)).toBe(false);
    }
  });
});

describe("historical close after late opportunity creation", () => {
  it("allows August despite October creation, with original and future limits", () => {
    const start = earliestCommercialStart("2026-10-19T18:00:00Z", "2026-10-22T18:00:00Z", "2026-08-11T18:00:00Z")!;
    const now = new Date("2026-10-22T18:00:00Z");
    expect(mexicoCalendarDate(start)).toBe("2026-08-11");
    expect(isValidCloseDate("2026-08-25", start, now)).toBe(true);
    expect(isValidCloseDate("2026-08-10", start, now)).toBe(false);
    expect(isValidCloseDate("2026-10-23", start, now)).toBe(false);
  });
  it("retains an earlier opportunity and ignores missing references", () => {
    expect(mexicoCalendarDate(earliestCommercialStart(null, "invalid", "2026-07-01T18:00:00Z", "2026-08-11T18:00:00Z")!)).toBe("2026-07-01");
    expect(earliestCommercialStart(null, undefined, "invalid")).toBeNull();
  });
});
