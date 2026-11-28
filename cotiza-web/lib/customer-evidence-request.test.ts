import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readCustomerEvidenceRequest } from "./customer-evidence-request";
import { readCustomerEvidenceFile, MAX_CUSTOMER_EVIDENCE_BYTES } from "./db/customer-evidence";

it("preserves pasted emails and accepts an original EML alongside structured confirmation", async () => {
  const data = { evidence: "Cliente: acepto PROP-1\nConforme a condiciones", confirmation: { channel: "email", confirmedBy: "Cliente", contact: "" } };
  const form = new FormData(); form.set("data", JSON.stringify(data));
  form.set("file", new File(["From: cliente@example.test\r\nSubject: Acepto PROP-1\r\n\r\nAdelante"], "confirmacion.eml"));
  const result = await readCustomerEvidenceRequest(new Request("https://cotiza.test", { method: "POST", body: form }));
  expect(result.input).toEqual(data); expect(result.file?.mimeType).toBe("message/rfc822");
  expect(Buffer.from(result.file!.bytes).toString()).toContain("Adelante");
});
it("rejects renamed executable content, empty and oversized files", async () => {
  for (const file of [new File(["MZfake"], "confirmacion.png"), new File([], "empty.pdf"), new File([new Uint8Array(MAX_CUSTOMER_EVIDENCE_BYTES + 1)], "large.pdf")]) {
    await expect(readCustomerEvidenceFile(file)).rejects.toMatchObject({ status: 422 });
  }
});
it("limits a chunked body without trusting Content-Length", async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(129 * 1024)); controller.close(); } });
  const request = new Request("https://cotiza.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
  await expect(readCustomerEvidenceRequest(request)).rejects.toMatchObject({ status: 413 });
});
