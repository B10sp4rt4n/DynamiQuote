import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PipelineTable } from "@/components/pipeline/pipeline-table";
import { PendingTasksPanel } from "@/components/inicio/pending-tasks-panel";
import type { OpportunityWithStage } from "@/lib/db/opportunities";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
const opportunity = { opportunityId: "own", opportunityNumber: "OPP-1", title: "Own sale", clientId: "client", clientCompany: "Company", stage: "open", amount: 0,
  createdAt: "2026-01-01T00:00:00Z", closedAt: null, lifetimeDays: null, expectedCloseDate: null, ownerUserId: "seller", intakePending: true, intakeQuoteId: "quote-1" } as OpportunityWithStage;
it("keeps the intake deep link without linking the seller to the account-wide history", () => {
  const props = { opportunities: [opportunity], closeFilter: "all" as const, stageFilter: "all" as const, search: "", onSearchChange() {}, onStageFilterChange() {}, onCloseFilterChange() {} };
  const seller = renderToStaticMarkup(<PipelineTable {...props} linkClients={false} />);
  expect(seller).toContain('href="/cotizaciones?quoteId=quote-1"'); expect(seller).toContain("Company"); expect(seller).not.toContain('href="/clientes/client"');
  expect(renderToStaticMarkup(<PipelineTable {...props} />)).toContain('href="/clientes/client"');
});
it("shows the seller's task company without the catalog link while preserving the existing default", () => {
  const tasks = [{ taskId: "task", clientId: "client", clientCompany: "Company", opportunityId: null, opportunityNumber: null, dueDate: "2026-11-01", description: "Own task" }];
  const seller = renderToStaticMarkup(<PendingTasksPanel tasks={tasks} linkClients={false} />);
  expect(seller).toContain("Own task"); expect(seller).toContain("Company"); expect(seller).not.toContain('href="/configuracion/clientes"');
  expect(renderToStaticMarkup(<PendingTasksPanel tasks={tasks} />)).toContain('href="/configuracion/clientes"');
});
