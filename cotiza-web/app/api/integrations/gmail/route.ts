import { NextResponse } from "next/server";
import { authorizeGmail, gmailFailure } from "@/lib/integrations/gmail/access";
import { gmailReady } from "@/lib/integrations/gmail/config";
import { GmailError } from "@/lib/integrations/gmail/domain";
import { readConnection, disconnectAccount } from "@/lib/integrations/gmail/store";
export const runtime="nodejs";
export async function GET(request:Request) {
  try {
    const actor=await authorizeGmail(request),ready=gmailReady();
    return NextResponse.json({ ready,connection:ready ? await readConnection(actor) : null }, {headers:{"Cache-Control":"no-store"}});
  } catch(error) { return gmailFailure(error); }
}
export async function POST(request:Request) {
  try {
    const actor=await authorizeGmail(request),body=await request.text();
    if(body.length>1000) throw new GmailError("Solicitud demasiado grande",413);
    let input;
    try {input=JSON.parse(body);} catch {throw new GmailError("Solicitud inválida",422);}
    if(input.action!=="disconnect" || Object.keys(input).length!==1) throw new GmailError("Solicitud inválida",422);
    await disconnectAccount(actor);
    return NextResponse.json({disconnected:true},{headers:{"Cache-Control":"no-store"}});
  } catch(error) { return gmailFailure(error); }
}
