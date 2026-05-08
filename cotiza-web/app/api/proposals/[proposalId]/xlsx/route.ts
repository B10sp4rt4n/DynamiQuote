import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  getProposalExcelPayloadByTenant,
  importProposalItemsByTenant,
} from "@/lib/db/proposals";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { proposalImportPayloadSchema } from "@/lib/validations/proposals";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ proposalId: string }>;
};

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;
const ALLOWED_FILE_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_");
}

function buildWorkbook(payload: Awaited<ReturnType<typeof getProposalExcelPayloadByTenant>>) {
  const workbook = XLSX.utils.book_new();

  const summaryRows = [
    ["proposalId", payload?.proposalId ?? ""],
    ["proposalNumber", payload?.formal?.proposalNumber ?? payload?.proposalId ?? ""],
    ["status", payload?.status ?? ""],
    ["recipientCompany", payload?.formal?.recipientCompany ?? ""],
    ["issuedDate", payload?.formal?.issuedDate ?? ""],
    ["subject", payload?.formal?.subject ?? ""],
    ["origin", payload?.origin ?? ""],
    ["termsAndConditions", payload?.formal?.termsAndConditions ?? ""],
  ];

  const itemsRows = (payload?.items ?? []).map((item) => ({
    componentType: item.componentType,
    costUnit: item.costUnit,
    description: item.description,
    itemNumber: item.itemNumber,
    origin: item.origin,
    priceUnit: item.priceUnit,
    quantity: item.quantity,
    sku: item.sku,
    status: item.status,
    subtotalCost: item.subtotalCost,
    subtotalPrice: item.subtotalPrice,
  }));

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  const itemsSheet = XLSX.utils.json_to_sheet(itemsRows);

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen");
  XLSX.utils.book_append_sheet(workbook, itemsSheet, "Partidas");

  return workbook;
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  return Number.NaN;
}

export async function GET(_: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { proposalId } = await context.params;
  const rateLimit = enforceRateLimit(`xlsx:download:${tenant.id}:${proposalId}`, 30, 60_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas descargas, intenta nuevamente en breve" },
      {
        headers: {
          "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
        },
        status: 429,
      },
    );
  }

  const payload = await getProposalExcelPayloadByTenant(tenant.id, proposalId);

  if (!payload) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }

  const workbook = buildWorkbook(payload);
  const arrayBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;

  const filename = sanitizeFilename(payload.formal?.proposalNumber ?? payload.proposalId);

  return new NextResponse(new Uint8Array(arrayBuffer), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { proposalId } = await context.params;
  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`xlsx:upload:${tenant.id}:${proposalId}:${identity}`, 10, 60_000);

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
  const sheet = workbook.Sheets["Partidas"] ?? workbook.Sheets[workbook.SheetNames[0] ?? ""];

  if (!sheet) {
    return NextResponse.json({ error: "No se encontro hoja de partidas" }, { status: 400 });
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  if (rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      { error: `El archivo supera el maximo de ${MAX_IMPORT_ROWS} filas` },
      { status: 400 },
    );
  }

  const parsed = proposalImportPayloadSchema.safeParse({
    items: rows.map((row, index) => ({
      componentType: String(row["componentType"] ?? ""),
      costUnit: readNumber(row["costUnit"]),
      description: String(row["description"] ?? ""),
      itemNumber: readNumber(row["itemNumber"]) || index + 1,
      origin: String(row["origin"] ?? ""),
      priceUnit: readNumber(row["priceUnit"]),
      quantity: readNumber(row["quantity"]),
      sku: String(row["sku"] ?? ""),
      status: String(row["status"] ?? "active"),
    })),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Archivo invalido", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const imported = await importProposalItemsByTenant(tenant.id, proposalId, parsed.data.items);

  if (!imported) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }

  return NextResponse.json({ importedCount: imported.importedCount, proposalId: imported.proposalId });
}
