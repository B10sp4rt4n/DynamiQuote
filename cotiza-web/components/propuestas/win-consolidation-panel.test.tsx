// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WinConsolidationPanel } from "./win-consolidation-panel";
import type { WinView } from "@/lib/domain/won-consolidation";
import type { CustomerEmailPreview } from "@/lib/domain/customer-email";
const m = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
let root: Root, container: HTMLDivElement;
const view = (): WinView => ({ tenantId: "tenant-a", proposalId: "proposal-1", policy: { revision: 3, rules: [], customerEvidenceRequired: true },
  case: null, state: "not_accepted", requirements: [], canRecordAcceptance: true, canConsolidate: false, canCancel: false,
  document: { proposalNumber: "PROP-1", quoteId: "q1", quoteName: "Renovación", quoteVersion: 2, customer: "Cliente", amount: 100, currency: "USD" } });
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
const preview = (): CustomerEmailPreview => ({ acceptedOn: "2026-11-27", suggestedEvidence: "Adelante con la revisión 2.\n\n--- Contexto de la respuesta ---\n> PROP-1 por 100 USD",
  email: { sha256: "a".repeat(64), senderName: "Ana Cliente", senderEmail: "cliente@example.test", fromHeader: "Ana Cliente <cliente@example.test>",
    sentAt: "2026-11-28T02:45:00.000Z", dateHeader: "Fri, 27 Nov 2026 20:45:00 -0600", subject: "Re: PROP-1", messageId: "<reply@example.test>", inReplyTo: "<proposal@example.test>",
    replyText: "Adelante con la revisión 2.", quotedContext: "> PROP-1 por 100 USD", textTruncated: false, warnings: [] } });
async function attachEmail() {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File(["From: cliente@example.test\r\nSubject: Re: PROP-1\r\n\r\nAdelante"], "confirmacion.eml", { type: "message/rfc822" })] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", m.fetch);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  m.fetch.mockResolvedValue(response(view()));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<WinConsolidationPanel proposalId="proposal-1" tenantId="tenant-a" />)); }
function field(label: string) { return [...container.querySelectorAll("label")].find(el => el.textContent?.startsWith(label))!.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input,textarea,select")!; }
async function fill(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
}
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
it("identifies the exact revision and records pasted WhatsApp context with the named customer", async () => {
  await render(); expect(container.textContent).toContain("Renovación · Revisión 2");
  const button = () => container.querySelector<HTMLButtonElement>("form button:not([type])")!;
  expect(button().disabled).toBe(true);
  await fill(field("Medio"), "whatsapp"); await fill(field("¿Quién"), "Ana Cliente");
  await fill(field("Pega"), "Acepto PROP-1, revisión 2, por 100 USD.\nAdelante con la renovación.");
  expect(button().disabled).toBe(false);
  m.fetch.mockResolvedValueOnce(response({ ...view(), state: "consolidated", canRecordAcceptance: false }));
  await submit();
  const input = JSON.parse(m.fetch.mock.calls[1][1].body);
  expect(input).toMatchObject({ action: "accept", expectedRevision: 0, expectedPolicyRevision: 3, confirmation: { channel: "whatsapp", confirmedBy: "Ana Cliente" } });
  expect(input.evidence).toContain("revisión 2"); expect(m.fetch.mock.calls[1][1].headers["X-Tenant-Context"]).toBe("tenant-a");
});
it("lets a verbal acceptance be recorded as pending and keeps pasted evidence after an uncertain response and reload", async () => {
  await render(); await fill(field("Medio"), "verbal"); await fill(field("¿Quién"), "Ana Cliente");
  expect(container.textContent).toContain("Se guardará con respaldo escrito pendiente");
  expect(container.querySelector('input[type="file"]')).toBeNull();
  await fill(field("Medio"), "email"); await fill(field("Pega"), "Correo original: aceptamos PROP-1");
  m.fetch.mockRejectedValueOnce(new Error("Respuesta perdida")); await submit();
  expect(container.querySelector("textarea")!.value).toContain("aceptamos PROP-1");
  const reload = [...container.querySelectorAll("button")].find(el => el.textContent === "Recargar autorizaciones")!;
  await act(async () => reload.click());
  expect(container.querySelector("textarea")!.value).toContain("aceptamos PROP-1");
});
it("permits attachment-only evidence and sends the original file through multipart", async () => {
  await render(); await fill(field("¿Quién"), "Ana Cliente");
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File(["%PDF-1.7\nSynthetic"], "orden.pdf", { type: "application/pdf" })] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  m.fetch.mockResolvedValueOnce(response({ ...view(), state: "consolidated", canRecordAcceptance: false }));
  await submit();
  const body = m.fetch.mock.calls[1][1].body as FormData;
  expect((body.get("file") as File).name).toBe("orden.pdf"); expect(JSON.parse(body.get("data") as string).evidence).toBe("");
  expect(m.fetch.mock.calls[1][1].headers["Content-Type"]).toBeUndefined();
});
it("fills sender, contact, sending date and reply context from an attached email and binds the final request to its hash", async () => {
  await render(); m.fetch.mockResolvedValueOnce(response({ tenantId: "tenant-a", proposalId: "proposal-1", ...preview() }));
  await attachEmail();
  expect(field("¿Quién").value).toBe("Ana Cliente"); expect(field("Correo o teléfono").value).toBe("cliente@example.test");
  expect(field("Fecha").value).toBe("2026-11-27"); expect(field("Pega").value).toContain("PROP-1 por 100 USD");
  expect(container.textContent).toContain("Datos leídos del correo adjunto"); expect(m.refresh).not.toHaveBeenCalled();
  m.fetch.mockResolvedValueOnce(response({ ...view(), state: "consolidated", canRecordAcceptance: false })); await submit();
  const body = m.fetch.mock.calls[2][1].body as FormData;
  expect(JSON.parse(body.get("data") as string)).toMatchObject({ acceptedOn: "2026-11-27", confirmation: { confirmedBy: "Ana Cliente", contact: "cliente@example.test", emailSourceHash: "a".repeat(64) } });
});
it("clears only automatically supplied values when the email is removed and preserves manual corrections", async () => {
  await render(); const originalDate = field("Fecha").value;
  m.fetch.mockResolvedValueOnce(response({ tenantId: "tenant-a", proposalId: "proposal-1", ...preview() })); await attachEmail();
  await fill(field("¿Quién"), "Ana Cliente, revisado"); await fill(field("Pega"), "Contexto revisado manualmente");
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Quitar archivo")!.click());
  expect(field("¿Quién").value).toBe("Ana Cliente, revisado"); expect(field("Pega").value).toBe("Contexto revisado manualmente");
  expect(field("Correo o teléfono").value).toBe(""); expect(field("Fecha").value).toBe(originalDate);
  expect(container.textContent).not.toContain("Datos leídos del correo adjunto");
});
it("ignores a late email preview after the medium changes", async () => {
  await render(); await fill(field("¿Quién"), "Nombre capturado");
  let resolve!: (value: unknown) => void;
  m.fetch.mockReturnValueOnce(new Promise(value => { resolve = value; })); await attachEmail();
  await fill(field("Medio"), "whatsapp");
  await act(async () => resolve(response({ tenantId: "tenant-a", proposalId: "proposal-1", ...preview() })));
  expect(field("¿Quién").value).toBe("Nombre capturado"); expect(field("Medio").value).toBe("whatsapp");
  expect(container.textContent).not.toContain("Datos leídos del correo adjunto");
});
