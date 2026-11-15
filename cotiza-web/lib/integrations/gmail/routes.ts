import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeGmailTarget, gmailFailure } from "./access";
import { gmailConfig, gmailReady } from "./config";
import { GmailError, messageView } from "./domain";
import { signPreview, verifyPreview } from "./crypto";
import { listLinks, readConnection, searchMailbox, previewMessage, saveMessage, savedAttachment } from "./store";

const messageId = z.string().regex(/^[a-f0-9]{1,64}$/i);
const actions = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search"), query: z.string().trim().min(3).max(500), pageToken: z.string().max(2000).optional() }).strict(),
  z.object({ action: z.literal("preview"), messageId }).strict(),
  z.object({ action: z.literal("link"), messageId, previewToken: z.string().max(3000) }).strict(),
]);
const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export async function gmailGet(request: Request, opportunityId: string) {
  try {
    const target = await authorizeGmailTarget(request,opportunityId);
    if (!gmailReady()) return NextResponse.json({ ready: false, connection: null, links: [] }, { headers: privateHeaders });
    const [connection, links] = await Promise.all([readConnection(target),listLinks(target)]);
    return NextResponse.json({ ready: true, connection, links }, { headers: privateHeaders });
  } catch (error) { return gmailFailure(error); }
}
export async function gmailPost(request: Request, opportunityId: string) {
  try {
    const target = await authorizeGmailTarget(request,opportunityId);
    const body = await request.text(); if (body.length>8000) throw new GmailError("Solicitud demasiado grande",413);
    let input;
    try { input=actions.parse(JSON.parse(body)); } catch { throw new GmailError("Revisa los datos de la consulta",422); }
    if (input.action==="search") return NextResponse.json(await searchMailbox(target,input.query,input.pageToken), { headers: privateHeaders });
    if (input.action==="preview") {
      const { snapshot,email } = await previewMessage(target,input.messageId);
      return NextResponse.json({ message: messageView(snapshot), previewToken: signPreview(target,email,snapshot) }, { headers: privateHeaders });
    }
    const hash = verifyPreview(input.previewToken,target,gmailConfig().email,input.messageId);
    return NextResponse.json(await saveMessage(target,input.messageId,hash), { headers: privateHeaders, status: 201 });
  } catch (error) { return gmailFailure(error); }
}
export async function gmailAttachment(request: Request, opportunityId: string) {
  try {
    const target=await authorizeGmailTarget(request,opportunityId), url=new URL(request.url);
    const input=z.object({ linkId:z.string().uuid(),partId:z.string().regex(/^[0-9.]{0,100}$/) }).parse({
      linkId:url.searchParams.get("linkId"),partId:url.searchParams.get("partId"),
    });
    const attachment=await savedAttachment(target,input.linkId,input.partId);
    const safeName=attachment.filename.replace(/[\r\n"\\/\x00-\x1f]/g,"_").slice(0,180) || "documento";
    return new Response(new Uint8Array(Buffer.from(attachment.data,"base64")), { headers: { ...privateHeaders,
      "Content-Type":"application/octet-stream", "Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(safeName).replace(/'/g,"%27")}`,
      "X-Content-Type-Options":"nosniff", "Content-Security-Policy":"sandbox" } });
  } catch (error) { return gmailFailure(error); }
}
