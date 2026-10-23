import { describe, expect, it } from "vitest";
import { formatTaskDueDate } from "./task-due-date";

describe("task calendar deadlines", () => {
  it.each(["America/Mexico_City", "UTC", "Asia/Tokyo"])("preserves the selected day in %s", (zone) => {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try {
      expect(formatTaskDueDate("2026-10-23T00:00:00.000Z")).toBe("23 oct 2026");
      expect(formatTaskDueDate("2027-01-01T00:00:00.000Z")).toBe("01 ene 2027");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
