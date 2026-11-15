import "server-only";
import { gmailConfig } from "./config";
import { digest } from "./crypto";
import { GMAIL_SCOPE, GmailError, type GmailSnapshot, type GmailAttachment } from "./domain";

export type GmailToken = { access_token: string; refresh_token?: string; expires_in: number; scope?: string; token_type: string };
type Part = { partId?: string; mimeType?: string; filename?: string; headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number }; parts?: Part[] };
type Message = { id: string; threadId: string; internalDate: string; sizeEstimate?: number; payload: Part };
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_BYTES = 8 * 1024 * 1024;

// Fixed provider URLs, bounded responses, no redirects, no upstream error bodies in logs/UI.
async function jsonRequest(url: string, init: RequestInit, maxBytes = 12 * 1024 * 1024) {
  const response = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new GmailError(response.status === 401 || response.status === 403
    ? "Google requiere revisar la autorización de Gmail" : "Gmail no respondió. Intenta nuevamente",
    response.status === 401 || response.status === 403 ? 409 : 503);
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes) throw new GmailError("El correo supera el tamaño permitido", 413);
  const reader = response.body?.getReader();
  if (!reader) throw new GmailError("Respuesta de Google no disponible", 503);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new GmailError("El correo supera el tamaño permitido", 413); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function exchangeToken(parameters: Record<string, string>): Promise<GmailToken> {
  const config = gmailConfig();
  const token = await jsonRequest("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...parameters, client_id: config.clientId, client_secret: config.clientSecret }) }, 32_000);
  if (typeof token.access_token !== "string" || token.token_type?.toLowerCase() !== "bearer"
    || !Number.isSafeInteger(token.expires_in) || token.expires_in < 1 || token.expires_in > 86_400) throw new GmailError("Autorización de Google inválida", 422);
  if (token.scope && (!token.scope.split(" ").includes(GMAIL_SCOPE)
    || token.scope.split(" ").some((scope: string) => scope.startsWith("https://www.googleapis.com/auth/gmail.") && scope !== GMAIL_SCOPE)
    || token.scope.split(" ").includes("https://mail.google.com/"))) throw new GmailError("Autoriza únicamente la consulta de Gmail", 422);
  return token;
}
const get = (path: string, token: string, maxBytes?: number) => jsonRequest(API + path,
  { headers: { Authorization: `Bearer ${token}` } }, maxBytes);
export async function accountEmail(token: string): Promise<string> {
  const profile = await get("/profile", token, 32_000);
  if (typeof profile.emailAddress !== "string") throw new GmailError("No se pudo identificar el buzón", 422);
  return profile.emailAddress.trim().toLowerCase();
}
function allParts(part: Part, depth = 0): Part[] {
  if (depth > 20) throw new GmailError("Estructura de correo demasiado compleja", 422);
  return [part, ...(part.parts ?? []).flatMap(child => allParts(child, depth + 1))];
}
function header(part: Part, name: string) {
  return (part.headers ?? []).filter(h => h.name.toLowerCase() === name).map(h => h.value).join(", ");
}
function bodyText(part: Part, data: string) {
  const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(header(part, "content-type"))?.[1] ?? "utf-8";
  let text: string;
  try { text = new TextDecoder(charset).decode(Buffer.from(data, "base64url")); }
  catch { throw new GmailError("No se pudo interpretar la codificación del correo", 422); }
  if (part.mimeType === "text/html") {
    // Only rendered as React text, never as HTML. Preserve full provider payload separately.
    text = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?\s*>|<\/(p|div|li)>/gi, "\n").replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&");
  }
  if (text.length > 200_000) throw new GmailError("El texto del correo supera el tamaño permitido", 413);
  return text;
}
export function projectMessage(message: Message, parts: Part[], attachments: GmailAttachment[]): GmailSnapshot {
  const plain = parts.filter(p => p.mimeType === "text/plain" && !p.filename);
  const bodies = plain.length ? plain : parts.filter(p => p.mimeType === "text/html" && !p.filename);
  const received = Number(message.internalDate);
  if (!message.id || !message.threadId || !Number.isFinite(received) || !message.payload) throw new GmailError("Correo incompleto", 422);
  return { messageId: message.id, threadId: message.threadId, internetMessageId: header(message.payload, "message-id"),
    subject: header(message.payload, "subject"), from: header(message.payload, "from"), to: header(message.payload, "to"),
    cc: header(message.payload, "cc"), date: header(message.payload, "date"), receivedAt: new Date(received).toISOString(),
    bodyText: bodies.map(p => bodyText(p, p.body?.data ?? "")).join("\n"),
    bodyFormat: bodies.length ? (plain.length ? "plain" : "html_as_text") : "unavailable",
    attachments, observedAt: new Date().toISOString() };
}
export async function searchMessages(token: string, query: string, pageToken?: string) {
  const q = new URLSearchParams({ q: `-in:spam -in:trash -in:drafts (${query})`, maxResults: "20", includeSpamTrash: "false" });
  if (pageToken) q.set("pageToken", pageToken);
  const result = await get("/messages?" + q, token, 128_000);
  const ids: { id: string }[] = Array.isArray(result.messages) ? result.messages : [];
  const messages = [];
  // Bounded concurrency, and use MESSAGE ids, never thread ids or subject as identity.
  for (let i = 0; i < Math.min(ids.length, 20); i += 4) {
    messages.push(...await Promise.all(ids.slice(i, i + 4).map(async ({ id }) => {
      if (!/^[a-f0-9]{1,64}$/i.test(id)) throw new GmailError("Identificador de correo inválido", 422);
      const m = await get(`/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, token, 256_000);
      return { messageId: m.id as string, subject: header(m.payload, "subject"), from: header(m.payload, "from"),
        date: header(m.payload, "date") };
    })));
  }
  return { messages, nextPageToken: typeof result.nextPageToken === "string" ? result.nextPageToken : null };
}
export async function readMessage(token: string, id: string) {
  if (!/^[a-f0-9]{1,64}$/i.test(id)) throw new GmailError("Identificador de correo inválido", 422);
  const original: Message = await get(`/messages/${id}?format=full`, token);
  if (original.id !== id || (original.sizeEstimate ?? 0) > MAX_BYTES) throw new GmailError("Correo demasiado grande o no disponible", 413);
  const parts = allParts(original.payload), attachments: GmailAttachment[] = [];
  let total = 0;
  if (parts.length > 200) throw new GmailError("El correo tiene demasiadas partes", 413);
  for (const part of parts) {
    if ((part.body?.size ?? 0) > MAX_BYTES) throw new GmailError("Adjunto demasiado grande", 413);
    if (part.body?.attachmentId) {
      const result = await get(`/messages/${id}/attachments/${encodeURIComponent(part.body.attachmentId)}`, token);
      if (typeof result.data !== "string") throw new GmailError("Adjunto incompleto", 422);
      part.body.data = result.data;
    }
    if (part.body?.data) {
      const bytes = Buffer.from(part.body.data, "base64url"); total += bytes.length;
      if (total > MAX_BYTES) throw new GmailError("Los adjuntos superan el tamaño permitido", 413);
      if (part.filename) attachments.push({ partId: part.partId ?? "", filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream", size: bytes.length, sha256: digest(bytes), data: bytes.toString("base64") });
    }
  }
  return { snapshot: projectMessage(original, parts, attachments), original };
}
