import { loomHandlers } from "@/lib/integrations/loom/routes";
export const runtime = "nodejs";
export const maxDuration = 60;
const handlers = loomHandlers("client");
type Context = { params: Promise<{ clientId: string }> };
export async function GET(request: Request, context: Context) { return handlers.read(request, (await context.params).clientId); }
export async function POST(request: Request, context: Context) { return handlers.write(request, (await context.params).clientId); }
