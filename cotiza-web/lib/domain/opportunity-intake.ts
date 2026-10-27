import { z } from "zod";

export const opportunityIntakeSchema = z.object({
  title: z.string().trim().max(200),
  need: z.string().trim().max(2000),
  source: z.string().trim().max(200),
  nextStep: z.string().trim().max(1000),
  revision: z.number().int().nonnegative(),
}).strict();
export type OpportunityIntakeInput = z.infer<typeof opportunityIntakeSchema>;
export type OpportunityIntake = {
  opportunityId: string;
  opportunityNumber: string;
  clientCompany: string;
  title: string;
  need: string;
  source: string;
  nextStep: string;
  revision: number;
  missingFields: string[];
  managed: boolean;
};
export function intakeMissingFields(input: Pick<OpportunityIntakeInput, "title" | "need" | "source">): string[] {
  return [!input.title.trim() ? "Nombre de oportunidad" : null,
    !input.need.trim() ? "Necesidad" : null, !input.source.trim() ? "Origen" : null]
    .filter((field): field is string => field !== null);
}
