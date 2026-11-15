import { NextResponse } from "next/server";
import { authorizeGmail, gmailFailure } from "@/lib/integrations/gmail/access";
import { gmailConfig } from "@/lib/integrations/gmail/config";
import { GMAIL_SCOPE } from "@/lib/integrations/gmail/domain";
import { nonce } from "@/lib/integrations/gmail/crypto";
import { beginAuthorization } from "@/lib/integrations/gmail/store";
export const runtime="nodejs";
export async function POST(request:Request) {
  try {
    const actor=await authorizeGmail(request),config=gmailConfig(),state=nonce(),browser=nonce();
    await beginAuthorization(actor,state,browser);
    const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:"code",
      scope:GMAIL_SCOPE,access_type:"offline",prompt:"consent select_account",state,login_hint:config.email,
      include_granted_scopes:"false"}).toString();
    const response=NextResponse.json({url:url.toString()},{headers:{"Cache-Control":"no-store"}});
    response.cookies.set("__Host-cotiza_gmail",browser,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:600});
    return response;
  } catch(error) {return gmailFailure(error);}
}
