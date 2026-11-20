// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProposalListCounts, ProposalSummary } from "@/lib/db/proposals";
import { assertProposalWorkflowGuard, shouldClearProposalApprovals } from "@/lib/domain/proposal-workflow-guard";
import { updateProposalWorkflowSchema, type ProposalStatus } from "@/lib/validations/proposals";
import { ProposalShell } from "./proposal-shell";

const m = vi.hoisted(() => ({ fetch: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: m.replace, refresh: m.refresh }),
  usePathname: () => "/propuestas",
  useSearchParams: () => new URLSearchParams("proposalId=p"),
}));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));

let container: HTMLDivElement;
let root: Root;
let saved: ProposalSummary;
let failSave: boolean;
let pendingLoad: Promise<void> | undefined;
const line = { itemNumber: 1, componentType: "product", costUnit: 80, priceUnit: 100, quantity: 2,
  description: "Servicio de prueba", sku: "TEST", origin: "manual", status: "active", subtotalCost: 160, subtotalPrice: 200 };

function summary(status: ProposalStatus): ProposalSummary {
  return { proposalId: "p", createdAt: "2026-11-19T18:00:00Z", origin: "v1", status,
    formal: { clientLogoId: "", clientLogoDataUrl: "", currency: "MXN", customIntro: null, objective: null,
      issuerCompany: "Emisor", issuerContactName: "Vendedor", issuerEmail: "emisor@example.com", issuerPhone: "",
      issuerLogoId: "", issuerLogoDataUrl: "", issuedDate: "2026-11-19", proposalDocId: "doc", proposalNumber: "PROP-TEST",
      quoteId: "q", recipientCompany: "Cliente", recipientContactName: "Contacto", recipientContactTitle: "",
      recipientEmail: "cliente@example.com", subject: "Asunto original", termsAndConditions: "", validUntil: null, status } };
}

async function render(status: ProposalStatus) {
  saved = summary(status);
  await act(async () => root.render(<ProposalShell canForceIssuance={false} counts={{} as ProposalListCounts} hasMore={false}
    initialBlockedMarginFilter={false} initialOutcomeFilter="all" initialStatusFilter="all"
    tenantName="Prueba" proposals={[saved]} />));
}
function subjectInput() { return container.querySelector<HTMLInputElement>("#proposal-subject")!; }
async function changeSubject(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(subjectInput(), value);
    subjectInput().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function save() {
  const button = [...container.querySelectorAll("button")].find(b => b.textContent === "Guardar cambios")!;
  await act(async () => button.click());
}
function writes() { return m.fetch.mock.calls.filter(([, init]) => init?.method === "PUT"); }

beforeEach(() => {
  vi.clearAllMocks(); failSave = false; pendingLoad = undefined;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", m.fetch);
  window.history.replaceState(null, "", "/propuestas?proposalId=p");
  m.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/commercial-context")) return { ok: true, json: async () => ({ context: null }) };
    if (url !== "/api/proposals/p") throw Error(`Unexpected request ${url}`);
    if (init?.method === "PUT") {
      if (failSave) return { ok: false, json: async () => ({ error: "No se pudo guardar el asunto" }) };
      const input = updateProposalWorkflowSchema.parse(JSON.parse(init.body as string));
      const nextStatus = input.status ?? saved.status;
      const hasContentUpdate = input.subject !== undefined && input.subject !== saved.formal!.subject;
      assertProposalWorkflowGuard({ currentStatus: saved.status, nextStatus, hasContentUpdate,
        allowApprovedTermsUpdate: false, marginCanAuthorizeFinal: true });
      if (saved.status !== "draft" && hasContentUpdate) {
        expect(shouldClearProposalApprovals({ approvalCount: 1, currentStatus: saved.status,
          nextStatus, hasContentUpdate })).toBe(true);
      }
      saved = { ...saved, status: nextStatus, formal: { ...saved.formal!, subject: input.subject ?? saved.formal!.subject, status: nextStatus } };
    } else if (pendingLoad) {
      await pendingLoad;
    }
    return { ok: true, json: async () => ({ proposal: { ...saved, items: [line], approvals: [],
      approvalGate: { canAuthorizeFinal: false, missingRoles: ["owner"] }, issuanceStatus: "normal" } }) };
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
});

it.each<ProposalStatus>(["draft", "approved", "in_review", "sent", "rejected", "expired"])(
  "edits and saves the subject from %s, reopening non-drafts without changing line items", async status => {
    await render(status);
    expect(subjectInput().disabled).toBe(false);
    expect(subjectInput().maxLength).toBe(300);
    expect(container.querySelector("#proposal-subject-help") !== null).toBe(status !== "draft");
    await changeSubject("  Asunto corregido  ");
    await save();
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(writes()[0][1].body)).toEqual(status === "draft"
      ? { subject: "  Asunto corregido  " } : { subject: "  Asunto corregido  ", status: "draft" });
    expect(saved.status).toBe("draft");
    expect(subjectInput().value).toBe("Asunto corregido");
    expect(container.textContent).toContain("Cambios guardados correctamente.");
    // Reload through the detail endpoint: the form must retain the saved subject.
    await act(async () => root.unmount()); root = createRoot(container);
    await act(async () => root.render(<ProposalShell canForceIssuance={false} counts={{} as ProposalListCounts} hasMore={false}
      initialBlockedMarginFilter={false} initialOutcomeFilter="all" initialStatusFilter="all"
      tenantName="Prueba" proposals={[saved]} />));
    expect(subjectInput().value).toBe("Asunto corregido");
    await save();
    expect(writes()).toHaveLength(1);
  },
);

it("keeps the existing status when the subject is unchanged", async () => {
  await render("approved"); await save();
  expect(writes()).toHaveLength(0); expect(saved.status).toBe("approved");
});

it("retains the edit and the existing status after a rejected save, then permits retry", async () => {
  await render("approved"); await changeSubject("Asunto corregido");
  failSave = true; await save();
  expect(saved.status).toBe("approved"); expect(saved.formal!.subject).toBe("Asunto original");
  expect(subjectInput().value).toBe("Asunto corregido");
  expect(container.textContent).toContain("No se pudo guardar el asunto");
  failSave = false; await save();
  expect(saved.status).toBe("draft"); expect(saved.formal!.subject).toBe("Asunto corregido");
});

it("disables the subject while the detail is still loading", async () => {
  let finish!: () => void;
  pendingLoad = new Promise(resolve => { finish = resolve; });
  await render("approved"); expect(subjectInput().disabled).toBe(true);
  await act(async () => finish()); expect(subjectInput().disabled).toBe(false);
});
