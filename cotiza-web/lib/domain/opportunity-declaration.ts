import { z } from "zod";
export const declarationSchema = z.object({ creationId: z.string().uuid(), clientId: z.string().uuid(), title: z.string().trim().min(1).max(200) }).strict();
