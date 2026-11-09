import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { CSF_MAX_BYTES, clientFiscalValuesSchema } from "@/lib/domain/csf-review";
import { signCsfJob, verifyCsfJob } from "@/lib/integrations/csf-access";
import { getCsf, getDocumentJobStatus, isDigestorFiscalEnabledForTenant, uploadCsfDocument,
  validateReceptorFiscalData } from "@/lib/integrations/digestor-fiscal";
import { enforceRateLimit } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const confirmationSchema = z.object({
  token: z.string().max(2000), expectedRevision: z.string().length(64), confirm: z.literal(true),
  values: clientFiscalValuesSchema,
});

async function authorized() {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return { error: json({ error: "No autorizado" }, 401) };
  if (!isDigestorFiscalEnabledForTenant(tenant.id)) {
    return { error: json({ error: "La carga de CSF no está habilitada para esta empresa" }, 403) };
  }
  return { tenant };
}

async function completedCsf(jobId: string) {
  const job = await getDocumentJobStatus(jobId);
  if (job.status !== "done" || !job.documentId) return null;
  return getCsf(job.documentId);
}

// Read the multipart stream with a hard bound before parsing or forwarding it.
async function boundedFormData(request: Request) {
  const max = CSF_MAX_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > max) throw new Error("CSF_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("EMPTY_BODY");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new Error("CSF_TOO_LARGE");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  return new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    body: Buffer.concat(chunks) }).formData();
}

export async function POST(request: Request) {
  const auth = await authorized();
  if (auth.error) return auth.error;
  const tenant = auth.tenant!;
  if (!enforceRateLimit(`clients:csf:${tenant.id}:${tenant.userId}`, 10, 60_000).allowed) {
    return json({ error: "Demasiadas operaciones; intenta nuevamente en un minuto" }, 429);
  }
  if (request.headers.get("content-type")?.includes("application/json")) {
    const parsed = confirmationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Confirma los datos revisados" }, 422);
    const jobId = verifyCsfJob(parsed.data.token, tenant);
    if (!jobId) return json({ error: "La sesión de revisión caducó o no pertenece a este usuario" }, 403);
    try {
      const csf = await completedCsf(jobId);
      if (!csf?.review || csf.review.revision !== parsed.data.expectedRevision) {
        return json({ error: "La constancia cambió; vuelve a cargar y revisar sus datos" }, 409);
      }
      const v = parsed.data.values;
      const validation = await validateReceptorFiscalData({ rfc: v.rfc, nombre: v.company, cp: v.zipCode,
        regimen: v.fiscalRegime }, { pacCheck: false });
      if (!validation.valid) {
        const detail = Object.values(validation.fields ?? {}).filter((field) => !field.valid).map((field) => field.message).join(" ");
        return json({ error: detail || validation.summary, validation }, 422);
      }
      // Only returns reviewed values. Saving the Cotiza client is an explicit subsequent action.
      return json({ values: v, documentId: csf.id, validation });
    } catch { return json({ error: "No fue posible confirmar con Digestor; conserva tu revisión e intenta de nuevo" }, 502); }
  }
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return json({ error: "Selecciona una CSF en PDF" }, 400);
  }
  let file: FormDataEntryValue | null;
  try { file = (await boundedFormData(request)).get("file"); }
  catch (e) { return json({ error: e instanceof Error && e.message === "CSF_TOO_LARGE" ? "El PDF debe pesar como máximo 4 MB" : "No fue posible leer el archivo" }, e instanceof Error && e.message === "CSF_TOO_LARGE" ? 413 : 400); }
  if (!(file instanceof File) || !/\.pdf$/i.test(file.name) || !file.size) return json({ error: "Selecciona un PDF válido" }, 400);
  if (file.size > CSF_MAX_BYTES) return json({ error: "El PDF debe pesar como máximo 4 MB" }, 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) return json({ error: "El archivo no contiene un PDF válido" }, 400);
  try {
    const job = await uploadCsfDocument(bytes, file.name);
    return json({ status: job.status, token: signCsfJob(job.jobId, tenant) }, 202);
  } catch { return json({ error: "No fue posible enviar la CSF a Digestor. Intenta nuevamente" }, 502); }
}

export async function GET(request: Request) {
  const auth = await authorized();
  if (auth.error) return auth.error;
  const tenant = auth.tenant!;
  if (!enforceRateLimit(`clients:csf:read:${tenant.id}:${tenant.userId}`, 90, 60_000).allowed) {
    return json({ error: "Espera un minuto antes de consultar de nuevo" }, 429);
  }
  const jobId = verifyCsfJob(request.headers.get("X-CSF-Review") ?? "", tenant);
  if (!jobId) return json({ error: "La sesión de revisión caducó o no pertenece a este usuario" }, 403);
  try {
    const job = await getDocumentJobStatus(jobId);
    if (job.status === "failed") return json({ status: "failed", error: "No se pudo leer la CSF. Usa el PDF original con texto; los escaneados requieren OCR" });
    if (job.status !== "done" || !job.documentId) return json({ status: job.status });
    const csf = await getCsf(job.documentId);
    if (!csf.review) return json({ error: "Digestor requiere la actualización de revisión de CSF" }, 503);
    return json({ status: "done", review: csf.review, documentId: csf.id });
  } catch { return json({ error: "No fue posible consultar la lectura. Puedes reintentar sin subir otro archivo" }, 502); }
}
