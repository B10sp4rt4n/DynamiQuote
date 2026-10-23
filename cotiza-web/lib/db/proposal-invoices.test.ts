import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { proposals: { updateMany: mocks.updateMany } },
}));

import {
  claimProposalInvoiceStampByTenant,
  markProposalInvoiceStampedByTenant,
  saveProposalInvoiceDraftByTenant,
} from "./proposal-invoices";

describe("proteccion atomica del timbrado local", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("solo reserva un borrador draft/rejected perteneciente al tenant", async () => {
    expect(await claimProposalInvoiceStampByTenant("t1", "p1", "d1")).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: { invoice_status: "stamping" },
      where: {
        proposal_id: "p1",
        tenant_id: "t1",
        invoice_draft_id: "d1",
        invoice_uuid: null,
        invoice_xml_base64: null,
        invoice_stamped_at: null,
        invoice_status: { in: ["draft", "rejected"] },
      },
    });
  });

  it("si la reserva fue tomada, no permite emitir", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await claimProposalInvoiceStampByTenant("t1", "p1", "d1")).toBe(false);
  });

  it("la regeneracion de borrador solo se permite sin timbrado iniciado", async () => {
    expect(await saveProposalInvoiceDraftByTenant("t1", "p1", "d2", "d1")).toBe(true);
    const call = mocks.updateMany.mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { invoice_status: null },
      { invoice_status: { in: ["draft", "rejected"] } },
    ]);
    expect(call.where.tenant_id).toBe("t1");
    expect(call.where.invoice_draft_id).toBe("d1");
  });

  it("rejects a stale draft identifier before overwriting another request", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await saveProposalInvoiceDraftByTenant("t1", "p1", "d2", "obsolete")).toBe(false);
    expect(mocks.updateMany.mock.calls[0][0].where.invoice_draft_id).toBe("obsolete");
  });

  it("el resultado final exige la misma reserva y el mismo draftId", async () => {
    expect(await markProposalInvoiceStampedByTenant("t1", "p1", "d1", "uuid", "xml")).toBe(true);
    const call = mocks.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      proposal_id: "p1",
      tenant_id: "t1",
      invoice_draft_id: "d1",
        invoice_uuid: null,
        invoice_xml_base64: null,
        invoice_stamped_at: null,
      invoice_status: "stamping",
    });
  });
});
