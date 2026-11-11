import "server-only";
import { LoomError } from "./domain";

const ENDPOINT = "https://mcp.atlassian.com/v2/mcp";
const PROTOCOL = "2025-11-25";
const MAX_BYTES = 1_500_000;
type Rpc = { jsonrpc: "2.0"; id?: number; method: string; params?: Record<string, unknown> };
type Json = Record<string, unknown>;
function record(value: unknown): value is Json { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

/** A bounded, read-only Streamable HTTP client. No user-selected server or tool name. */
export class LoomMcp {
  private session: string | null = null;
  private id = 0;
  private initialized = false;
  private deadline = Date.now() + 45_000;
  constructor(private authorization: string, private fetcher: typeof fetch = fetch) {}

  private async post(message: Rpc): Promise<unknown> {
    const remaining = this.deadline - Date.now();
    if (remaining <= 0) throw new LoomError("La lectura de Loom tardó demasiado. Intenta de nuevo", 503);
    const response = await this.fetcher(ENDPOINT, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(Math.min(12_000, remaining)),
      headers: { Authorization: this.authorization, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
        ...(this.initialized ? { "MCP-Protocol-Version": PROTOCOL } : {}),
        ...(this.session ? { "Mcp-Session-Id": this.session } : {}) },
      body: JSON.stringify(message),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403].includes(response.status)) throw new LoomError("La conexión de Loom requiere autorización o permisos de lectura", 403);
      if (response.status === 429) {
        const retry = response.headers.get("retry-after");
        throw new LoomError("Loom limitó las consultas. Intenta más tarde", 429, retry && /^\d{1,5}$/.test(retry) ? retry : undefined);
      }
      throw new LoomError("No se pudo consultar Loom. La copia guardada se conserva", 503);
    }
    if (message.id === undefined) { await response.body?.cancel(); return null; }
    const session = response.headers.get("mcp-session-id");
    if (session) {
      if (!/^[\x21-\x7E]{1,1024}$/.test(session)) throw new LoomError("Loom devolvió una sesión no válida", 502);
      this.session = session;
    }
    const reader = response.body?.getReader();
    if (!reader) throw new LoomError("Loom devolvió una respuesta vacía", 502);
    const decoder = new TextDecoder();
    const sse = response.headers.get("content-type")?.includes("text/event-stream");
    if (!sse && !response.headers.get("content-type")?.includes("application/json")) { await reader.cancel(); throw new LoomError("Formato de respuesta de Loom no soportado", 502); }
    let buffer = "", bytes = 0;
    const accept = (value: unknown): { found: true; result: unknown } | null => {
      if (!record(value) || value.jsonrpc !== "2.0" || value.id !== message.id) return null;
      if (value.error) throw new LoomError("Loom no pudo completar la lectura solicitada", 502);
      if (!("result" in value)) throw new LoomError("Respuesta incompleta de Loom", 502);
      return { found: true, result: value.result };
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (value) { bytes += value.byteLength; buffer += decoder.decode(value, { stream: true }); }
        if (bytes > MAX_BYTES) throw new LoomError("La respuesta de Loom supera el límite del piloto", 413);
        if (done) buffer += decoder.decode();
        if (sse) {
          // Normalize complete CRLF pairs after concatenation, including split chunks.
          buffer = buffer.replace(/\r\n/g, "\n");
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            const data = event.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).replace(/^ /, "")).join("\n");
            if (data) { const result = accept(JSON.parse(data)); if (result) return result.result; }
          }
        }
        if (done) {
          if (!sse) { const result = accept(JSON.parse(buffer)); if (result) return result.result; }
          throw new LoomError("La respuesta de Loom quedó incompleta", 502);
        }
      }
    } finally { await reader.cancel().catch(() => {}); }
  }

  async read(cloudId: string, url: string, resume?: string) {
    if (!this.initialized) {
      const result = await this.post({ jsonrpc: "2.0", id: ++this.id, method: "initialize",
        params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "cotiza-loom-reader", version: "1.0.0" } } });
      if (!record(result) || result.protocolVersion !== PROTOCOL || !record(result.capabilities) || !record(result.capabilities.tools)) {
        throw new LoomError("La conexión de Loom no ofrece el protocolo de lectura esperado", 502);
      }
      this.initialized = true;
      await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
    }
    return this.post({ jsonrpc: "2.0", id: ++this.id, method: "tools/call", params: {
      name: "getLoomObjectsContent", arguments: { cloudId, identifiers: [url], expand: ["transcript"], ...(resume ? { resume: [resume] } : {}) },
    } });
  }

  async close() {
    if (!this.session) return;
    await this.fetcher(ENDPOINT, { method: "DELETE", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(2000),
      headers: { Authorization: this.authorization, "MCP-Protocol-Version": PROTOCOL, "Mcp-Session-Id": this.session },
    }).then(response => response.body?.cancel()).catch(() => {});
  }
}
