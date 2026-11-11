import "server-only";
import { z } from "zod";
import { loomConfig } from "./config";
import { LoomError, normalizeLoomUrl, type LoomSnapshot } from "./domain";
import { LoomMcp } from "./mcp";

const componentSchema = z.object({
  component: z.string(), status: z.string().max(40),
  payload: z.object({ content: z.string().max(200_000).optional(), totalCharacters: z.number().int().nonnegative().optional(),
    nextCursor: z.string().max(8192).nullish() }).passthrough().nullish(),
  nextCursor: z.string().max(8192).nullish(),
});
const itemSchema = z.object({
  status: z.literal("OK"), ari: z.string().max(1000), title: z.string().min(1).max(1000),
  type: z.enum(["ASYNC_VIDEO", "MEETING_RECORDING"]), createdAt: z.string().nullish(),
  durationSeconds: z.number().nonnegative().finite().nullish(), content: z.array(componentSchema).max(10).optional(),
});
function unwrap(value: unknown): unknown {
  const obj = value as { isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[]; data?: unknown };
  if (!obj || typeof obj !== "object") throw new LoomError("Respuesta de Loom no válida", 502);
  if (obj.isError) throw new LoomError("Loom no permitió recuperar esta grabación", 502);
  if (obj.structuredContent) return unwrap(obj.structuredContent);
  if (Array.isArray(obj.content) && obj.content[0]?.type === "text") {
    try { return unwrap(JSON.parse(obj.content[0].text ?? "")); } catch (error) {
      if (error instanceof LoomError) throw error;
      throw new LoomError("Loom devolvió contenido no válido", 502);
    }
  }
  return obj.data ?? obj;
}
export function parseLoomPage(value: unknown, sourceId: string, cloudId: string) {
  const parsed = z.object({ items: z.array(itemSchema).length(1) }).safeParse(unwrap(value));
  if (!parsed.success) throw new LoomError("No se pudo leer la grabación con los permisos actuales", 403);
  const item = parsed.data.items[0]!;
  if (!item.ari.startsWith("ari:cloud:loom:" + cloudId + ":video/") || !item.ari.endsWith("/" + sourceId)) {
    throw new LoomError("Loom devolvió una grabación de otro sitio o enlace", 502);
  }
  if (item.createdAt && !Number.isFinite(Date.parse(item.createdAt))) throw new LoomError("La fecha de origen de Loom no es válida", 502);
  return { item, transcript: item.content?.find(c => c.component === "transcript") };
}
export async function readLoomSnapshot(inputUrl: string): Promise<LoomSnapshot> {
  const { sourceId, url } = normalizeLoomUrl(inputUrl);
  const config = loomConfig(), mcp = new LoomMcp(config.authorization);
  try {
    let page = parseLoomPage(await mcp.read(config.cloudId, url), sourceId, config.cloudId);
    const first = page.item;
    let text = "", cursor: string | null | undefined;
    const seen = new Set<string>();
    const total = page.transcript?.payload?.totalCharacters;
    for (let i = 0; i < 4; i++) {
      const component = page.transcript;
      if (!component || component.status !== "READY") {
        if (i > 0 || component?.nextCursor || component?.payload?.nextCursor) throw new LoomError("La transcripción cambió durante la lectura. Intenta de nuevo", 409);
        return { sourceId, ari: first.ari, url, title: first.title, type: first.type,
          createdAt: first.createdAt ?? null, durationSeconds: first.durationSeconds ?? null, transcript: null,
          transcriptStatus: "unavailable", sourceStatus: component?.status ?? "ABSENT", observedAt: new Date().toISOString() };
      }
      if (typeof component.payload?.content !== "string") throw new LoomError("La transcripción de Loom está incompleta", 502);
      text += component.payload.content;
      if (text.length > 200_000) throw new LoomError("La transcripción supera el límite de lectura del piloto", 413);
      cursor = component.nextCursor ?? component.payload.nextCursor;
      if (!cursor) break;
      if (seen.has(cursor) || i === 3) throw new LoomError("La transcripción necesita más páginas de las admitidas en el piloto", 413);
      seen.add(cursor);
      page = parseLoomPage(await mcp.read(config.cloudId, url, cursor), sourceId, config.cloudId);
      if (page.item.ari !== first.ari || page.item.title !== first.title) throw new LoomError("La grabación cambió durante la lectura", 409);
    }
    if (cursor || (total !== undefined && total !== text.length)) throw new LoomError("La transcripción de Loom está incompleta", 502);
    return { sourceId, ari: first.ari, url, title: first.title, type: first.type,
      createdAt: first.createdAt ?? null, durationSeconds: first.durationSeconds ?? null, transcript: text,
      transcriptStatus: "ready", sourceStatus: "READY", observedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof LoomError) throw error;
    throw new LoomError("No se pudo completar la lectura de Loom. Intenta de nuevo", 503);
  } finally { await mcp.close(); }
}
