import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { importQuoteLinesByTenant } from "@/lib/db/quotes";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ quoteId: string }>;
};

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;
const ALLOWED_FILE_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function POST(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { quoteId } = await context.params;
  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`xlsx:import:quote:${tenant.id}:${quoteId}:${identity}`, 10, 60_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas importaciones, intenta nuevamente en breve" },
      {
        headers: {
          "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
        },
        status: 429,
      },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Debes adjuntar un archivo .xlsx" }, { status: 400 });
  }

  const normalizedName = file.name.trim().toLowerCase();
  const mimeType = file.type.trim().toLowerCase();

  if (!normalizedName.endsWith(".xlsx")) {
    return NextResponse.json({ error: "El archivo debe tener extension .xlsx" }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "El archivo excede el limite de 5 MB o esta vacio" },
      { status: 400 },
    );
  }

  if (mimeType.length > 0 && !ALLOWED_FILE_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: "Tipo de archivo no soportado para importacion" },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  // Buscar hoja de partidas por nombre o tomar la primera disponible
  const sheet =
    workbook.Sheets["Partidas"] ??
    workbook.Sheets["partidas"] ??
    workbook.Sheets[workbook.SheetNames[0] ?? ""];

  if (!sheet) {
    return NextResponse.json({ error: "No se encontro hoja de partidas en el archivo" }, { status: 400 });
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: "El archivo no contiene filas" }, { status: 400 });
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      { error: `El archivo supera el maximo de ${MAX_IMPORT_ROWS} filas` },
      { status: 400 },
    );
  }

  const items = rows.map((row) => ({
    costUnit: readNumber(row["costUnit"] ?? row["costo"] ?? row["cost_unit"]),
    description: String(row["description"] ?? row["descripcion"] ?? row["description_final"] ?? ""),
    lineType: String(row["lineType"] ?? row["line_type"] ?? row["tipo"] ?? "product"),
    priceUnit: readNumber(row["priceUnit"] ?? row["precio"] ?? row["final_price_unit"]),
    quantity: readNumber(row["quantity"] ?? row["cantidad"]) || 1,
    sku: String(row["sku"] ?? row["SKU"] ?? ""),
  }));

  const result = await importQuoteLinesByTenant(tenant.id, quoteId, items);

  if (!result) {
    return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
  }

  return NextResponse.json({ importedCount: result.importedCount, quoteId: result.quoteId });
}
