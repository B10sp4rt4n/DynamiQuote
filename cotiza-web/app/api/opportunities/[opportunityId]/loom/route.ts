import { loomHandlers } from "@/lib/integrations/loom/routes";
export const runtime = "nodejs";
export const maxDuration = 60;
const handlers = loomHandlers("opportunity");
type Context = { params: Promise<{ opportunityId: string }> };
export async function GET(request: Request, context: Context) { return handlers.read(request, (await context.params).opportunityId); }
export async function POST(request: Request, context: Context) { return handlers.write(request, (await context.params).opportunityId); }
