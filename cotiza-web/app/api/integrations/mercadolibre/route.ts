import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMercadoLibre, mercadoLibreFailure } from "@/lib/integrations/mercadolibre/access";
import { mercadoLibreReady } from "@/lib/integrations/mercadolibre/config";
import { disconnectAccount, readInbox, syncSales } from "@/lib/integrations/mercadolibre/store";

export const runtime = "nodejs";
const offsetSchema = z.coerce.number().int().min(0).max(10000);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync"), offset: z.number().int().min(0).max(10000) }).strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
]);

export async function GET(request: Request) {
  try {
    const actor = await authorizeMercadoLibre();
    const parsed = offsetSchema.safeParse(new URL(request.url).searchParams.get("offset") ?? 0);
    if (!parsed.success) return NextResponse.json({ error: "Página inválida" }, { status: 422 });
    return NextResponse.json({ ...await readInbox(actor.tenantId, parsed.data), ready: mercadoLibreReady() },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return mercadoLibreFailure(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await authorizeMercadoLibre(request);
    const input = actionSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: "Acción inválida" }, { status: 422 });
    if (input.data.action === "disconnect") {
      await disconnectAccount(actor.tenantId);
      return NextResponse.json({ disconnected: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(await syncSales(actor.tenantId, actor.actorId, input.data.offset),
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return mercadoLibreFailure(error); }
}
