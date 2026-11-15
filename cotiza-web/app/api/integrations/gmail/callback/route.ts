import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizeGmail, gmailFailure } from "@/lib/integrations/gmail/access";
import { gmailConfig } from "@/lib/integrations/gmail/config";
import { exchangeToken } from "@/lib/integrations/gmail/client";
import { consumeAuthorization, finishAuthorization } from "@/lib/integrations/gmail/store";
export const runtime="nodejs";
export async function GET(request:Request) {
  let config;
  try {config=gmailConfig();} catch(error) {return gmailFailure(error);}
  let connected=false;
  try {
    const actor=await authorizeGmail(),url=new URL(request.url);
    const state=url.searchParams.get("state"),code=url.searchParams.get("code");
    const browser=(await cookies()).get("__Host-cotiza_gmail")?.value;
    if(url.origin!==config.origin || url.searchParams.has("error") || !state || !/^[\w-]{43}$/.test(state)
      || !browser || !/^[\w-]{43}$/.test(browser) || !code || code.length>4000) throw Error("Invalid callback");
    await consumeAuthorization(actor,state,browser);
    const token=await exchangeToken({grant_type:"authorization_code",code,redirect_uri:config.redirectUri});
    await finishAuthorization(actor,state,token);
    connected=true;
  } catch { /* Codes/tokens/upstream bodies never appear in redirects or logs. */ }
  const response=NextResponse.redirect(new URL(`/configuracion/integraciones/gmail?connection=${connected ? "connected":"failed"}`,config.origin),303);
  response.headers.set("Cache-Control","no-store");response.headers.set("Referrer-Policy","no-referrer");
  response.cookies.set("__Host-cotiza_gmail","",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});
  return response;
}
