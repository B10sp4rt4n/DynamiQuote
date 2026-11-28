import "server-only";
import { CustomerEvidenceError, MAX_CUSTOMER_EVIDENCE_BYTES, readCustomerEvidenceFile } from "@/lib/db/customer-evidence";

// Bound the actual streamed body as well as Content-Length, including chunked uploads.
export async function readCustomerEvidenceRequest(request: Request) {
  const type = request.headers.get("content-type")?.split(";")[0];
  if (type !== "application/json" && type !== "multipart/form-data") throw new CustomerEvidenceError("Usa JSON o un formulario con el respaldo", 415);
  const max = type === "application/json" ? 128 * 1024 : MAX_CUSTOMER_EVIDENCE_BYTES + 128 * 1024;
  if (Number(request.headers.get("content-length")) > max) throw new CustomerEvidenceError("La solicitud excede el tamaño permitido", 413);
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > max) { await reader.cancel(); throw new CustomerEvidenceError("La solicitud excede el tamaño permitido", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const body = Buffer.concat(chunks);
  if (type === "application/json") return { input: JSON.parse(body.toString("utf8")), file: undefined };
  const form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
  if (form.getAll("data").length !== 1 || form.getAll("file").length > 1 || [...form.keys()].some(key => key !== "data" && key !== "file")) throw new CustomerEvidenceError("Revisa los campos de la confirmación");
  const data = form.get("data"), file = form.get("file");
  if (typeof data !== "string") throw new CustomerEvidenceError("Faltan los datos de la confirmación");
  return { input: JSON.parse(data), file: file === null ? undefined : await readCustomerEvidenceFile(file) };
}
