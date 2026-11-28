import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseCustomerEmail } from "./customer-email";

function message(body: string, headers = "") {
  return Buffer.from("From: =?UTF-8?Q?Ana_Cliente_G=C3=B3mez?= <cliente@example.test>\r\nDate: Fri, 27 Nov 2026 20:45:00 -0600\r\nSubject: Re: PROP-1\r\nMessage-ID: <confirmacion@example.test>\r\nIn-Reply-To: <propuesta@example.test>\r\n" + headers + "\r\n" + body);
}
it("decodes the actual sender and date, and retains the response context without modifying the original", async () => {
  const bytes = message("Adelante con la revisión 2.\r\n\r\nEl 27 nov 2026, Ventas escribió:\r\n> PROP-1: renovación por 100 USD.", "Content-Type: text/plain; charset=utf-8\r\n");
  const original = Buffer.from(bytes);
  const result = await parseCustomerEmail(bytes);
  expect(result.email).toMatchObject({ senderName: "Ana Cliente Gómez", senderEmail: "cliente@example.test", sentAt: "2026-11-28T02:45:00.000Z",
    messageId: "<confirmacion@example.test>", inReplyTo: "<propuesta@example.test>", replyText: "Adelante con la revisión 2.", textTruncated: false });
  expect(result.acceptedOn).toBe("2026-11-27");
  expect(result.email.quotedContext).toContain("100 USD"); expect(result.suggestedEvidence).toContain("Contexto de la respuesta");
  expect(result.email.sha256).toBe(createHash("sha256").update(original).digest("hex")); expect(bytes).toEqual(original);
});
it("converts HTML-only/base64 messages to text and does not fetch remote images", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  try {
    const html = '<p>Confirmo la renovación por 100 USD.</p><blockquote><p>PROP-1 revisión 2</p></blockquote><script>alert("no")</script><img src="https://tracker.example.test/a">';
    const result = await parseCustomerEmail(message(Buffer.from(html).toString("base64"), "Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n"));
    expect(result.suggestedEvidence).toContain("Confirmo la renovación"); expect(result.suggestedEvidence).toContain("PROP-1 revisión 2");
    expect(result.suggestedEvidence).not.toContain("<script>"); expect(fetch).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
it("decodes quoted-printable text and recognizes an Outlook reply header", async () => {
  const body = "Acepto la renovaci=F3n.\r\n\r\nDe: Ventas <ventas@example.test>\r\nEnviado el: jueves\r\nPara: Cliente\r\nAsunto: PROP-1\r\nPrecio 100 USD";
  const result = await parseCustomerEmail(message(body, "Content-Type: text/plain; charset=iso-8859-1\r\nContent-Transfer-Encoding: quoted-printable\r\n"));
  expect(result.email.replyText).toBe("Acepto la renovación."); expect(result.email.quotedContext).toContain("De: Ventas");
});
it("does not replace the outer sender with a person quoted inside a forwarded message", async () => {
  const bytes = Buffer.from("From: Vendedor <ventas@example.test>\r\nDate: Fri, 27 Nov 2026 20:45:00 -0600\r\nSubject: RV: Confirmación\r\n\r\nPara registro\r\n-----Mensaje reenviado-----\r\nDe: Cliente <cliente@example.test>\r\nEnviado: ayer\r\nPara: Ventas\r\nAcepto la propuesta");
  const result = await parseCustomerEmail(bytes);
  expect(result.email.senderEmail).toBe("ventas@example.test"); expect(result.email.warnings.join(" ")).toContain("reenvío");
  expect(result.email.quotedContext).toContain("cliente@example.test");
});
it("leaves ambiguous senders and dates for manual review rather than inventing them", async () => {
  for (const date of ["", "Date: no es una fecha\r\n", "Date: Fri, 27 Nov 2026 20:45:00\r\n", "Date: Fri, 27 Nov 2026 20:45:00 -0600\r\nDate: Thu, 26 Nov 2026 20:45:00 -0600\r\n"]) {
    const result = await parseCustomerEmail(Buffer.from("From: Uno <uno@example.test>, Dos <dos@example.test>\r\n" + date + "Subject: Confirmación\r\n\r\nNo aceptamos la propuesta"));
    expect(result.email.senderEmail).toBeNull(); expect(result.email.sentAt).toBeNull(); expect(result.acceptedOn).toBeNull();
    expect(result.suggestedEvidence).toBe("No aceptamos la propuesta"); expect(result.email.warnings.length).toBeGreaterThanOrEqual(2);
  }
});
it("bounds long previews and keeps the full original identifiable", async () => {
  const result = await parseCustomerEmail(message("Respuesta " + "x".repeat(25000) + "\r\nOn Friday, Sales wrote:\r\n> PROP-1 por 100 USD"));
  expect(result.suggestedEvidence.length).toBeLessThanOrEqual(20000); expect(result.email.replyText.length).toBeLessThanOrEqual(20000);
  expect(result.email.textTruncated).toBe(true); expect(result.email.quotedContext).toContain("PROP-1");
  expect(result.email.warnings.join(" ")).toContain("extracto");
});
