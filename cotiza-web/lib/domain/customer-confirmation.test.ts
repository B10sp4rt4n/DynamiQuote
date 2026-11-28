import { expect, it } from "vitest";
import { hasWrittenCustomerEvidence, isCustomerEvidencePending, customerConfirmationSchema } from "./customer-confirmation";
import { winActionSchema, winPolicySchema } from "./won-consolidation";

const confirmation = { channel: "email" as const, confirmedBy: "Contacto del cliente", contact: "cliente@example.test" };
it("requires a named customer and refuses client-supplied attachment identifiers", () => {
  expect(customerConfirmationSchema.safeParse(confirmation).success).toBe(true);
  expect(customerConfirmationSchema.safeParse({ ...confirmation, confirmedBy: " " }).success).toBe(false);
  expect(customerConfirmationSchema.safeParse({ ...confirmation, attachment: { id: "foreign-file" } }).success).toBe(false);
});
it("distinguishes manual written evidence from verbal notes and never upgrades old references", () => {
  expect(hasWrittenCustomerEvidence("Aceptamos la propuesta PROP-1", confirmation)).toBe(true);
  expect(hasWrittenCustomerEvidence("Aceptamos la propuesta PROP-1", { ...confirmation, channel: "verbal" })).toBe(false);
  expect(hasWrittenCustomerEvidence("Referencia histórica")).toBe(false);
  expect(isCustomerEvidencePending({ acceptanceEvidence: "Referencia histórica" })).toBe(false);
  expect(isCustomerEvidencePending({ acceptanceEvidence: "Referencia histórica", customerEvidenceRequired: true })).toBe(true);
});
it("allows attachment-only requests, but keeps prior JSON clients and tenant policies compatible", () => {
  const input = { action: "accept", expectedRevision: 0, expectedPolicyRevision: 0, acceptedOn: "2026-11-27", evidence: "" };
  expect(winActionSchema.safeParse(input).success).toBe(false);
  expect(winActionSchema.safeParse({ ...input, confirmation }).success).toBe(true);
  expect(winActionSchema.safeParse({ ...input, evidence: "Referencia del correo" }).success).toBe(true);
  expect(winPolicySchema.parse({ rules: [] }).customerEvidenceRequired).toBeUndefined();
  expect(winPolicySchema.parse({ rules: [], customerEvidenceRequired: true }).customerEvidenceRequired).toBe(true);
});
