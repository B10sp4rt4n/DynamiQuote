import { describe, expect, it } from "vitest";
import { opportunityLifetimeDays } from "./opportunity-lifetime";

describe("opportunity lifetime", () => {
  const now = new Date("2026-10-20T20:00:00Z");
  it("keeps counting open opportunities from their original start", () => {
    expect(opportunityLifetimeDays("2026-09-20T20:00:00Z", null, "open", now)).toBe(30);
  });
  it("freezes the duration at the commercial close, even months later", () => {
    expect(opportunityLifetimeDays("2026-09-20T20:00:00Z", "2026-10-01T20:00:00Z", "won", now)).toBe(11);
  });
  it("does not invent a duration for undated historical wins or losses", () => {
    expect(opportunityLifetimeDays("2026-09-20T20:00:00Z", null, "won", now)).toBeNull();
    expect(opportunityLifetimeDays("2026-09-20T20:00:00Z", null, "lost", now)).toBeNull();
  });
  it("counts full 24-hour periods, including zero-day decisions", () => {
    expect(opportunityLifetimeDays("2026-10-20T19:00:00Z", "2026-10-20T20:00:00Z", "won", now)).toBe(0);
    expect(opportunityLifetimeDays("2026-10-19T20:00:01Z", null, "open", now)).toBe(0);
  });
  it("does not hide invalid dates or a close preceding creation", () => {
    expect(opportunityLifetimeDays("invalid", null, "open", now)).toBeNull();
    expect(opportunityLifetimeDays("2026-10-21T00:00:00Z", "2026-10-20T00:00:00Z", "lost", now)).toBeNull();
  });
});
