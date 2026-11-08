import { describe, expect, it } from "vitest";
import { createProposalInvoiceSchema } from "./proposal-invoice";
import { invoiceBasisFingerprint } from "@/lib/domain/invoice-profile";

const valid = { customerName: "Synthetic", customerRegimen: "601", customerRfc: "AAA010101AAA",
  customerUseCfdi: "G03", customerZip: "01000", paymentMethod: "PUE", paymentForm: "03",
  itemsFingerprint: "a".repeat(64), fiscalItems: [{ itemNumber: 1, satProductCode: "80101500", unitCode: "E48" }] };
describe("explicit first fiscal scenario", () => {
  it("accepts PPD only paired with form 99", () => expect(createProposalInvoiceSchema.safeParse({ ...valid, paymentMethod: "PPD", paymentForm: "99" }).success).toBe(true));
  it("accepts a named national customer and explicit classifications", () => expect(createProposalInvoiceSchema.safeParse(valid).success).toBe(true));
  it.each([
    { ...valid, customerRfc: "BAD" }, { ...valid, customerZip: "X" },
    { ...valid, paymentMethod: "PPD", paymentForm: "03" }, { ...valid, paymentForm: "99" },
    { ...valid, customerRfc: "XEXX010101000" }, { ...valid, customerRegimen: "BAD" },
    { ...valid, fiscalItems: [] }, { ...valid, fiscalItems: [{ itemNumber: 1, satProductCode: "", unitCode: "" }] },
    { ...valid, fiscalItems: [{ ...valid.fiscalItems[0], price: 1 }] },
  ])("rejects unsupported or incomplete payload", value => expect(createProposalInvoiceSchema.safeParse(value).success).toBe(false));
  it("fingerprints source identity, description, amounts and currency without exposing cost", () => {
    const proposal = { proposalId: "p", formal: { currency: "MXN" }, items: [{ itemNumber: 1, description: "License", quantity: 1, priceUnit: 100 }] };
    expect(invoiceBasisFingerprint(proposal)).not.toBe(invoiceBasisFingerprint({ ...proposal, items: [{ ...proposal.items[0], description: "Different" }] }));
    expect(invoiceBasisFingerprint(proposal)).not.toBe(invoiceBasisFingerprint({ ...proposal, formal: { currency: "USD" } }));
    expect(invoiceBasisFingerprint(proposal)).not.toBe(invoiceBasisFingerprint({ ...proposal, items: [{ ...proposal.items[0], priceUnit: 101 }] }));
  });
});
