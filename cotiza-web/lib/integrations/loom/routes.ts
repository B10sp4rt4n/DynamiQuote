import "server-only";
import { NextResponse } from "next/server";
import { authorizeLoom } from "./access";
import { readLoomSnapshot } from "./client";
import { loomConfig } from "./config";
import { LoomError, loomRequestSchema, normalizeLoomUrl } from "./domain";
import { signPreview, snapshotHash, verifyPreview } from "./preview";
import { getLoomRevision, listLoomLinks, saveLoomLink } from "./store";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof LoomError ? error.message : "No se pudo consultar Loom. Revisa la configuración del piloto" },
    { status: error instanceof LoomError ? error.status : 503, headers: { ...headers,
      ...(error instanceof LoomError && error.retryAfter ? { "Retry-After": error.retryAfter } : {}) } });
}
export function loomHandlers(kind: "client" | "opportunity") {
  return {
    async read(request: Request, id: string) {
      try { const target = await authorizeLoom(request, kind, id);
        return NextResponse.json({ links: await listLoomLinks(target) }, { headers });
      } catch (error) { return failure(error); }
    },
    async write(request: Request, id: string) {
      try {
        const target = await authorizeLoom(request, kind, id);
        if (Number(request.headers.get("content-length") ?? 0) > 10_000) throw new LoomError("Solicitud demasiado grande", 413);
        const text = await request.text();
        if (text.length > 10_000) throw new LoomError("Solicitud demasiado grande", 413);
        const input = loomRequestSchema.safeParse(JSON.parse(text));
        if (!input.success) throw new LoomError("Revisa el enlace y la vista previa", 422);
        const { sourceId, url } = normalizeLoomUrl(input.data.url), config = loomConfig();
        const preview = input.data.action === "link" ? verifyPreview(input.data.previewToken, target, sourceId, config.key) : null;
        const snapshot = await readLoomSnapshot(url);
        if (preview) {
          if (preview.hash !== snapshotHash(snapshot)) throw new LoomError("La grabación cambió desde la vista previa. Revisa de nuevo", 409);
          const result = await saveLoomLink(target, snapshot, preview.baseRevision);
          return NextResponse.json(result, { status: result.unchanged ? 200 : 201, headers });
        }
        const revision = await getLoomRevision(target, sourceId);
        return NextResponse.json({ snapshot, previewToken: signPreview(target, snapshot, config.key, revision) }, { headers });
      } catch (error) {
        if (error instanceof SyntaxError) return failure(new LoomError("Solicitud no válida", 422));
        return failure(error);
      }
    },
  };
}
