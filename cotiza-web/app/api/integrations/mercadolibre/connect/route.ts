import { NextResponse } from "next/server";
import { authorizeMercadoLibre, mercadoLibreFailure } from "@/lib/integrations/mercadolibre/access";
import { mercadoLibreConfig } from "@/lib/integrations/mercadolibre/config";
import { nonce, challenge } from "@/lib/integrations/mercadolibre/crypto";
import { beginAuthorization } from "@/lib/integrations/mercadolibre/store";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const actor = await authorizeMercadoLibre(request), config = mercadoLibreConfig();
    const state = nonce(), browser = nonce(), verifier = nonce();
    await beginAuthorization(actor.tenantId, actor.actorId, state, browser, verifier);
    const url = new URL("https://auth.mercadolibre.com.mx/authorization");
    url.search = new URLSearchParams({ response_type: "code", client_id: config.clientId,
      redirect_uri: config.redirectUri, state, code_challenge: challenge(verifier), code_challenge_method: "S256" }).toString();
    const response = NextResponse.json({ url: url.toString() }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set("__Host-cotiza_ml", browser, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
    return response;
  } catch (error) { return mercadoLibreFailure(error); }
}
