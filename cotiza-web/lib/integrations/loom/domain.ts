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

export const loomRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), url: z.string().min(1).max(2048) }).strict(),
  z.object({ action: z.literal("link"), url: z.string().min(1).max(2048), previewToken: z.string().min(1).max(4096) }).strict(),
]);
