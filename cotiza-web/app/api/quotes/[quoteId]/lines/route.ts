import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  getEditableQuoteLinesByTenant,
  updateQuoteLinesByTenant,
} from "@/lib/db/quote-editor";
import { updateQuoteLinesSchema } from "@/lib/validations/quote-editor";
import {
  quoteLinesGetResponseSchema,
  quoteLinesPutResponseSchema,
} from "@/lib/validations/quote-editor-response";

type RouteContext = {
  params: Promise<{ quoteId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { quoteId } = await context.params;

  const lines = await getEditableQuoteLinesByTenant(tenant.id, quoteId);

  if (!lines) {
    return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
  }

  const payload = quoteLinesGetResponseSchema.parse({ lines });

  return NextResponse.json(payload);
}

export async function PUT(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { quoteId } = await context.params;

  const parsed = updateQuoteLinesSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalido", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const updated = await updateQuoteLinesByTenant(tenant.id, quoteId, parsed.data.lines);

    if (!updated) {
      return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
    }

    const payload = quoteLinesPutResponseSchema.parse(updated);

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
