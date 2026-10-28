import { expect, it } from "vitest";
import { dispositionSchema, readDisposition } from "./opportunity-disposition";
it("rejects impossible and past dates and unexpected fields", () => {
  for (const date of ["2099-02-30", "2000-01-01", "2099-13-01"]) expect(dispositionSchema.safeParse({ state: "paused", reason: "Retomar", resumeOn: date, revision: 0 }).success).toBe(false);
  expect(dispositionSchema.safeParse({ state: "no_decision", reason: "Cancelado", resumeOn: "2099-01-01", revision: 0 }).success).toBe(false);
  expect(dispositionSchema.safeParse({ state: "paused", reason: "Retomar", resumeOn: "2099-01-01", revision: 0 }).success).toBe(true);
});
it("does not interpret existing intake metadata as a commercial closure", () => {
  expect(readDisposition({ version: 1, kind: "quote-origin" })).toBeNull();
  expect(readDisposition(null)).toBeNull();
});
