import { describe, expect, it } from "vitest";
import { reviewRecurringRenewal, type RecurringStatus, type RecurringTerms } from "./recurring-services";

const terms = (): RecurringTerms => ({
  title: "Servicio sintético", clientId: "synthetic-client", contractKind: "fixed_term",
  startsOn: "2029-01-01", endsOn: "2030-01-31", autoRenew: false, noticeDays: 30,
  cadence: "monthly", basis: "advance", anchorDay: 1, timezone: "America/Mexico_City",
  dueDays: 10, currency: "MXN", effectiveFrom: "2029-01-01", acceptanceEvidence: "Contrato sintético",
  lines: [{ lineId: "one", description: "Servicio", sku: null, quantity: "1", unitPrice: "100" }],
});
const review = (on: string, changes: Partial<RecurringTerms> = {}, status: RecurringStatus = "active") =>
  reviewRecurringRenewal({ ...terms(), ...changes }, status, new Date(`${on}T18:00:00Z`));

describe("Contract renewal review adapted from Suscripciones-AUP", () => {
  it.each([
    ["2029-12-01", "current", 61], ["2029-12-02", "t60", 60],
    ["2029-12-31", "t60", 31], ["2030-01-01", "t30", 30],
    ["2030-01-30", "t30", 1], ["2030-01-31", "expired", 0],
    ["2030-02-01", "expired", -1],
  ])("classifies civil date %s without dropping expired agreements", (on, state, daysToEnd) => {
    expect(review(on)).toMatchObject({ state, daysToEnd, lastCoveredOn: "2030-01-30" });
  });

  it("brings a 90-day pre-notice forward even outside the T-60 window", () => {
    expect(review("2029-11-02", { noticeDays: 90 })).toMatchObject({
      state: "notice_due", daysToEnd: 90, noticeOn: "2029-11-02", noticeDue: true,
    });
    expect(review("2029-11-01", { noticeDays: 90 }).noticeDue).toBe(false);
  });

  it("does not treat automatic renewal as a confirmed extension or mutate the contract", () => {
    const contract = { ...terms(), autoRenew: true };
    const original = structuredClone(contract);
    expect(reviewRecurringRenewal(contract, "active", new Date("2030-02-01T18:00:00Z")))
      .toMatchObject({ state: "expired", autoRenew: true, endsOn: "2030-01-31" });
    expect(contract).toEqual(original);
  });

  it("keeps contractual review while paused and suppresses alerts for draft or ended agreements", () => {
    expect(review("2030-02-01", {}, "paused").state).toBe("expired");
    for (const status of ["draft", "ended"] as const) {
      expect(review("2030-02-01", {}, status)).toMatchObject({ state: status, noticeDue: false, daysToEnd: null });
    }
  });

  it("does not invent a monthly expiry or use the billing cadence as the contract end", () => {
    expect(review("2030-01-30", { contractKind: "month_to_month", endsOn: null, cadence: "monthly" }))
      .toMatchObject({ state: "open_ended", noticeOn: null, daysToEnd: null });
    expect(review("2030-01-30", { endsOn: null }).state).toBe("incomplete");
    expect(review("2030-01-30", { startsOn: null }).state).toBe("incomplete");
    expect(review("2030-01-30", { endsOn: "2020-02-31" }).state).toBe("incomplete");
    expect(review("2030-01-30", { startsOn: "2030-02-01" }).state).toBe("incomplete");
  });

  it("separates a future contract from an already running one", () => {
    expect(review("2029-12-31", { startsOn: "2030-01-01" }).state).toBe("scheduled");
  });

  it("uses the agreement's date at midnight rather than the server's UTC date", () => {
    const instant = new Date("2030-01-31T01:00:00Z");
    expect(reviewRecurringRenewal(terms(), "active", instant)).toMatchObject({ asOf: "2030-01-30", state: "t30", daysToEnd: 1 });
    expect(reviewRecurringRenewal({ ...terms(), timezone: "UTC" }, "active", instant))
      .toMatchObject({ asOf: "2030-01-31", state: "expired", daysToEnd: 0 });
  });

  it("counts calendar days over daylight-saving changes and leap days", () => {
    expect(review("2030-03-09", { timezone: "America/New_York", endsOn: "2030-03-11" }).daysToEnd).toBe(2);
    expect(review("2032-02-28", { endsOn: "2032-03-01", noticeDays: 1 }))
      .toMatchObject({ daysToEnd: 2, lastCoveredOn: "2032-02-29", noticeOn: "2032-02-29" });
  });

  it("does not depend on price, billing frequency or expected payment dates", () => {
    expect(review("2030-01-01", { dueDays: 365, cadence: "annual", basis: "arrears", currency: "USD", lines: [] }))
      .toEqual(review("2030-01-01"));
  });
});
