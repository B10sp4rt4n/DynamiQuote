import "server-only";
import { createHash } from "node:crypto";
import { simpleParser, type ParsedMail } from "mailparser";
import { mexicoCalendarDate } from "@/lib/domain/commercial-close-date";
import { customerEmailSchema, type CustomerEmailPreview } from "@/lib/domain/customer-email";
import { CustomerEvidenceError, MAX_CUSTOMER_EVIDENCE_BYTES } from "@/lib/db/customer-evidence";

const TEXT_LIMIT = 20000;
function clean(value: string | undefined) { return (value ?? "").replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim(); }
function clip(value: string, limit: number) { return value.slice(0, limit).replace(/[\uD800-\uDBFF]$/, ""); }

// This separates only recognizable quoted-message boundaries. The original EML is retained.
export function splitCustomerReply(text: string) {
  const lines = text.split("\n");
  const boundary = lines.findIndex((line, index) => {
    if (/^\s*>/.test(line) || /^\s*-{2,}\s*(original message|mensaje original|forwarded message|mensaje reenviado)\s*-*/i.test(line)
      || /^\s*(begin forwarded message|inicio del mensaje reenviado)\s*:/i.test(line)) return true;
    const paragraph = lines.slice(index, index + 4).join(" ");
    if (/^\s*(on\s.+\bwrote\s*:|el\s.+\bescribi[oó]\s*:)/i.test(paragraph)) return true;
    if (/^\s*(from|de)\s*:/i.test(line)) {
      const next = lines.slice(index + 1, index + 9);
      return next.filter(item => /^\s*(sent|enviado|enviado el|date|fecha|to|para|subject|asunto)\s*:/i.test(item)).length >= 2;
    }
    return false;
  });
  if (boundary < 0 || !lines.slice(0, boundary).join("\n").trim()) return { replyText: text, quotedContext: "" };
  return { replyText: lines.slice(0, boundary).join("\n").trim(), quotedContext: lines.slice(boundary).join("\n").trim() };
}

export async function parseCustomerEmail(bytes: Uint8Array): Promise<CustomerEmailPreview> {
  if (!bytes.length || bytes.length > MAX_CUSTOMER_EVIDENCE_BYTES) throw new CustomerEvidenceError("El correo debe ocupar como máximo 3 MB.");
  let mail: ParsedMail;
  try {
    mail = await simpleParser(Buffer.from(bytes), { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true,
      skipTextLinks: true, maxHtmlLengthToParse: MAX_CUSTOMER_EVIDENCE_BYTES });
  } catch {
    throw new CustomerEvidenceError("No se pudo leer el correo. Descarga nuevamente el original en formato .eml o adjunta un PDF.");
  }
  const headers = (key: string) => mail.headerLines.filter(header => header.key === key).map(header => clean(header.line.replace(/^[^:]+:\s*/, "")));
  const warnings: string[] = [];
  const fromHeaders = headers("from"), dateHeaders = headers("date");
  const senders = mail.from?.value ?? [];
  const sender = fromHeaders.length === 1 && senders.length === 1 && senders[0].address ? senders[0] : null;
  if (!sender) warnings.push("No se identificó un único remitente. Completa quién confirmó y revisa el correo original.");
  const dateHeader = dateHeaders.join("\n");
  const hasZone = /(?:[+-]\d{2}:?\d{2}|\b(?:UT|UTC|GMT|Z|[ECMP][SD]T))(?:\s*\([^)]*\))?\s*$/i.test(dateHeader);
  const sentAt = dateHeaders.length === 1 && hasZone && mail.date && Number.isFinite(mail.date.getTime()) ? mail.date.toISOString() : null;
  if (!sentAt) warnings.push("No se pudo leer una fecha de envío con zona horaria. Selecciona la fecha de aceptación.");
  const subject = clean(mail.subject);
  if (/^\s*(?:\[[^\]]+\]\s*)?(?:fw|fwd|rv|reenv[ií]o)\s*:/i.test(subject)) warnings.push("El archivo es un reenvío. Revisa en el hilo quién dio la aceptación; el remitente mostrado es el del correo adjunto.");
  const text = clean(mail.text);
  if (!text) warnings.push("No se pudo extraer el cuerpo del mensaje. Revisa el original y pega la confirmación relevante.");
  const split = splitCustomerReply(text);
  const combined = split.replyText + (split.quotedContext ? `\n\n--- Contexto de la respuesta ---\n${split.quotedContext}` : "");
  const textTruncated = combined.length > TEXT_LIMIT;
  if (textTruncated) warnings.push("El mensaje es largo: se muestra un extracto. El correo completo se conserva en el archivo original.");
  const email = customerEmailSchema.parse({ sha256: createHash("sha256").update(bytes).digest("hex"),
    senderName: sender ? clip(clean(sender.name), 200) || null : null,
    senderEmail: sender ? clip(clean(sender.address), 300) || null : null,
    fromHeader: clip(fromHeaders.join("\n"), 2000), sentAt, dateHeader: clip(dateHeader, 500), subject: clip(subject, 1000),
    messageId: clip(clean(mail.messageId), 1000) || null, inReplyTo: clip(clean(mail.inReplyTo), 1000) || null,
    replyText: clip(split.replyText, TEXT_LIMIT), quotedContext: clip(split.quotedContext, TEXT_LIMIT), textTruncated, warnings,
  });
  return { email, acceptedOn: sentAt ? mexicoCalendarDate(sentAt) : null, suggestedEvidence: clip(combined, TEXT_LIMIT) };
}
