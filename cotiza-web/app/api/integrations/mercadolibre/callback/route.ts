import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizeMercadoLibre, mercadoLibreFailure } from "@/lib/integrations/mercadolibre/access";
import { mercadoLibreConfig } from "@/lib/integrations/mercadolibre/config";
import { connectAccount, consumeAuthorization } from "@/lib/integrations/mercadolibre/store";
import { exchangeToken } from "@/lib/integrations/mercadolibre/client";

export const runtime = "nodejs";
export async function GET(request: Request) {
  let origin: string;
  try { origin = mercadoLibreConfig().origin; } catch (error) { return mercadoLibreFailure(error); }
  let connected = false;
  try {
    const actor = await authorizeMercadoLibre();
    const url = new URL(request.url), code = url.searchParams.get("code"), state = url.searchParams.get("state");
    const browser = (await cookies()).get("__Host-cotiza_ml")?.value;
    if (!code || code.length > 2000 || !state || !/^[\w-]{43}$/.test(state) || !browser || url.searchParams.has("error")) throw Error("Invalid callback");
    const verifier = await consumeAuthorization(actor.tenantId, actor.actorId, state, browser);
    const token = await exchangeToken({ grant_type: "authorization_code", code, code_verifier: verifier,
      redirect_uri: mercadoLibreConfig().redirectUri });
    await connectAccount(actor.tenantId, actor.actorId, token, state);
    connected = true;
  } catch { /* Never put codes, tokens, or upstream errors in redirects/logs. */ }
  const response = NextResponse.redirect(new URL(`/configuracion/integraciones/mercadolibre?connection=${connected ? "connected" : "failed"}`, origin), 303);
  response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set("__Host-cotiza_ml", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
