import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { importQuoteLinesByTenant, type QuoteImportLineInput } from "@/lib/db/quotes";
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

// cost_unit / final_price_unit son Decimal(10,2) en Postgres: 8 digitos
// enteros + 2 decimales como maximo.
const MAX_DECIMAL_10_2 = 99999999.99;

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
}

// Normaliza un header de columna para matchear los alias existentes sin
// importar mayúsculas/acentos (ej. "Descripción", "COSTO", "Cantidad").
function normalizeHeaderKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeaderKey(key)] = value;
  }
  return normalized;
}

type ImportRowResult =
  | { ok: true; item: QuoteImportLineInput }
  | { ok: false; reason: string };

function parseImportRow(row: Record<string, unknown>): ImportRowResult {
  const normalizedRow = normalizeRowKeys(row);

  const description = String(
    normalizedRow["description"] ?? normalizedRow["descripcion"] ?? normalizedRow["description_final"] ?? "",
  ).trim();
  const costUnit = readNumber(normalizedRow["costunit"] ?? normalizedRow["costo"] ?? normalizedRow["cost_unit"]);
  const priceUnit = readNumber(normalizedRow["priceunit"] ?? normalizedRow["precio"] ?? normalizedRow["final_price_unit"]);
  const quantity = readNumber(normalizedRow["quantity"] ?? normalizedRow["cantidad"]) || 1;
  const lineType = String(normalizedRow["linetype"] ?? normalizedRow["line_type"] ?? normalizedRow["tipo"] ?? "product");
  const sku = String(normalizedRow["sku"] ?? "");

  if (description.length === 0 && costUnit === 0 && priceUnit === 0) {
    return { ok: false, reason: "Sin descripción ni valores de costo/precio reconocidos" };
  }

  if (costUnit > MAX_DECIMAL_10_2 || priceUnit > MAX_DECIMAL_10_2) {
    return { ok: false, reason: `Costo o precio excede el maximo permitido (${MAX_DECIMAL_10_2})` };
  }

  return {
    ok: true,
    item: { costUnit, description, lineType, priceUnit, quantity, sku },
  };
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

  let rows: Record<string, unknown>[];

  try {
    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    // Buscar hoja de partidas por nombre o tomar la primera disponible
    const sheet =
      workbook.Sheets["Partidas"] ??
      workbook.Sheets["partidas"] ??
      workbook.Sheets[workbook.SheetNames[0] ?? ""];

    if (!sheet) {
      return NextResponse.json({ error: "No se encontro hoja de partidas en el archivo" }, { status: 400 });
    }

    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: true,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el archivo. Verifica que sea un .xlsx valido." },
      { status: 400 },
    );
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      { error: `El archivo supera el maximo de ${MAX_IMPORT_ROWS} filas` },
      { status: 400 },
    );
  }

  // Hoja "Partidas" sin filas de datos (ej. la plantilla descargada tal
  // cual, sin llenar): no es un error, simplemente no hay nada que importar.
  if (rows.length === 0) {
    return NextResponse.json({ importedCount: 0, quoteId: null, skipped: [], skippedCount: 0 });
  }

  const items: QuoteImportLineInput[] = [];
  const skipped: { reason: string; row: number }[] = [];

  rows.forEach((row, index) => {
    const parsed = parseImportRow(row);

    if (parsed.ok) {
      items.push(parsed.item);
    } else {
      // +2: la fila 1 es el header, la primera fila de datos es la 2.
      skipped.push({ reason: parsed.reason, row: index + 2 });
    }
  });

  if (items.length === 0) {
    return NextResponse.json(
      {
        error: "Ninguna fila del archivo tiene datos reconocibles para importar",
        skipped,
        skippedCount: skipped.length,
      },
      { status: 400 },
    );
  }

  let result: Awaited<ReturnType<typeof importQuoteLinesByTenant>>;

  try {
    result = await importQuoteLinesByTenant(tenant.id, quoteId, items);
  } catch (error) {
    // El desbordamiento por fila individual ya se filtra arriba (skipped);
    // esto cubre el caso restante: la SUMA de costo/precio de todas las
    // filas excede el limite de la cotizacion (tambien Decimal(10,2)).
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const isOverflow = message.includes("numeric field overflow") || message.includes("out of range");

    return NextResponse.json(
      {
        error: isOverflow
          ? "El total de costo o precio de la cotizacion excede el maximo permitido. Revisa las cantidades y valores del archivo."
          : "No se pudo guardar la importacion. Verifica los valores del archivo e intenta de nuevo.",
      },
      { status: isOverflow ? 400 : 500 },
    );
  }

  if (!result) {
    return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
  }

  return NextResponse.json({
    importedCount: result.importedCount,
    quoteId: result.quoteId,
    skipped,
    skippedCount: skipped.length,
  });
}
