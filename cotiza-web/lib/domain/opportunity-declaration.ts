import { z } from "zod";
export const declarationSchema = z.object({ creationId: z.string().uuid(), clientId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/), title: z.string().trim().min(1).max(200) }).strict();
