import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";

export const runtime = "nodejs";

const TEMPLATE_HEADERS = ["sku", "description", "quantity", "costUnit", "priceUnit"];

function buildTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();

  // Hoja "Partidas": solo headers, lista para que el usuario escriba directo.
  // Sin fila de ejemplo aquí para que el FIX de validación de filas no la
  // confunda con datos reales si alguien olvida borrarla.
  const partidasSheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
  XLSX.utils.book_append_sheet(workbook, partidasSheet, "Partidas");

  const instructionsSheet = XLSX.utils.aoa_to_sheet([
    ['Esta hoja es solo de referencia — tus datos van en la hoja "Partidas".'],
    ["No copies esta fila de ejemplo a la hoja Partidas."],
    [],
    TEMPLATE_HEADERS,
    ["SKU-001", "Ejemplo: Servicio de mantenimiento mensual", 1, 100, 150],
  ]);
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instrucciones");

  return workbook;
}

export async function GET() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const workbook = buildTemplateWorkbook();
  const arrayBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;

  return new NextResponse(new Uint8Array(arrayBuffer), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="plantilla-importacion-partidas.xlsx"',
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}
