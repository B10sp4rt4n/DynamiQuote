import { z } from "zod";

export class LoomError extends Error {
  constructor(message: string, public status = 409, public retryAfter?: string) { super(message); }
}
export type LoomTarget = { tenantId: string; actorId: string; connectionKey: string; clientId: string; opportunityId: string | null };
export type LoomSnapshot = {
  sourceId: string; ari: string; url: string; title: string; type: "ASYNC_VIDEO" | "MEETING_RECORDING";
  createdAt: string | null; durationSeconds: number | null; transcript: string | null;
  transcriptStatus: "ready" | "unavailable"; sourceStatus: string; observedAt: string;
};
export type LoomLink = { linkId: string; revision: number; snapshot: LoomSnapshot };

export function normalizeLoomUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new LoomError("Introduce un enlace válido de Loom", 422); }
  const match = /^\/(?:share|embed)\/([a-f0-9]{32})\/?$/i.exec(url.pathname);
  if (url.protocol !== "https:" || !["loom.com", "www.loom.com"].includes(url.hostname)
    || url.port || url.username || url.password || !match) throw new LoomError("Usa un enlace HTTPS de loom.com/share o loom.com/embed", 422);
  // Query strings/timestamps are not recording identity and are never fetched.
  const sourceId = match[1]!.toLowerCase();
  return { sourceId, url: "https://www.loom.com/share/" + sourceId };
}

const excerpt = z.string().trim().min(3).max(600);
const description = z.string().trim().min(3).max(1000);
const dueDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Introduce una fecha válida");
export const loomFollowupSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("note"), excerpt, description, dueDate: z.null() }).strict(),
  z.object({ kind: z.literal("task"), excerpt, description, dueDate }).strict(),
]);
export type LoomFollowup = z.infer<typeof loomFollowupSchema>;
export const loomRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("review_followup"), linkId: z.string().min(1).max(200), revision: z.number().int().positive(), followup: loomFollowupSchema }).strict(),
  z.object({ action: z.literal("save_followup"), token: z.string().min(1).max(9000) }).strict(),
  z.object({ action: z.literal("preview"), url: z.string().min(1).max(2048) }).strict(),
  z.object({ action: z.literal("link"), url: z.string().min(1).max(2048), previewToken: z.string().min(1).max(4096) }).strict(),
]);
