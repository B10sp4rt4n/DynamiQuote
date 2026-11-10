// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CsfReviewPanel } from "./csf-review-panel";
import { ClientShell } from "@/components/configuracion/client-shell";
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
let root: Root, container: HTMLDivElement;
const fetchMock = vi.fn(), apply = vi.fn(), pending = vi.fn();
const current = { company: "ACTUAL", rfc: "BBB010101BBB", fiscalRegime: "601", zipCode: "01000", address: "DOMICILIO ACTUAL" };
const extracted = { company: "EXTRAIDO", rfc: "AAA010101AAA", fiscalRegime: "601", zipCode: "01234", address: "REFORMA 123" };
const review = { revision: "a".repeat(64), values: extracted, issues: {}, regimeText: "General de Ley Personas Morales", cifId: "123", suggestions: [{ field: "legal_name", suggested_value: "SUGERENCIA IA" }] };
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:csf-synthetic"); URL.revokeObjectURL = vi.fn();
  fetchMock.mockReset(); apply.mockReset(); pending.mockReset();
  fetchMock.mockImplementation(async (_url, init) => ({ ok: true, json: async () => init?.method === "POST"
    ? init.headers ? { values: extracted } : { token: "synthetic" }
    : { status: "done", review } }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function button(text: string) { return [...container.querySelectorAll("button")].find((b) => b.textContent === text)!; }
async function uploadAndRead() {
  await act(async () => root.render(<CsfReviewPanel current={current} onApply={apply} onPendingChange={pending} />));
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["%PDF-1.7"], "csf.pdf", { type: "application/pdf" })] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  await act(async () => vi.advanceTimersByTimeAsync(1500));
}
it("shows original, current and suggested values and requires confirmation before applying", async () => {
  await uploadAndRead();
  expect(container.textContent).toContain("Actual: ACTUAL"); expect(container.textContent).toContain("Extraído: EXTRAIDO");
  expect(container.textContent).toContain("RFC es distinto"); expect(container.querySelector<HTMLInputElement>('input[aria-label="CSF: Razón social"]')!.value).toBe("EXTRAIDO");
  expect(apply).not.toHaveBeenCalled(); expect(button("Confirmar y aplicar al formulario").disabled).toBe(true);
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async () => { button("Confirmar y aplicar al formulario").click(); button("Confirmar y aplicar al formulario").click(); });
  expect(apply).toHaveBeenCalledOnce(); expect(apply).toHaveBeenCalledWith(extracted);
  expect(fetchMock.mock.calls.filter(([, init]) => init?.headers?.["Content-Type"])).toHaveLength(1);
  expect(container.textContent).toContain("Pulsa Guardar"); expect(pending).toHaveBeenLastCalledWith(false);
});
it("never applies AI suggestions automatically and resets consent after a selected suggestion", async () => {
  await uploadAndRead(); await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async () => button("Usar sugerencia").click());
  expect(container.querySelector<HTMLInputElement>('input[aria-label="CSF: Razón social"]')!.value).toBe("SUGERENCIA IA");
  expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
  expect(apply).not.toHaveBeenCalled();
});
it("discards a review without modifying client data and releases its preview", async () => {
  await uploadAndRead(); await act(async () => button("Descartar esta revisión y continuar con captura manual").click());
  expect(apply).not.toHaveBeenCalled(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:csf-synthetic");
  expect(pending).toHaveBeenLastCalledWith(false); expect(container.querySelector('input[type="checkbox"]')).toBeNull();
});

it("highlights doubtful OCR fields and keeps human consent mandatory", async () => {
  const scanned = { ...review, extraction: { method: "ocr", reviewRequired: true },
    fieldWarnings: { rfc: "Lectura OCR dudosa. Compara este dato con el PDF y corrígelo si hace falta." } };
  fetchMock.mockImplementation(async (_url, init) => ({ ok: true, json: async () => init?.method === "POST"
    ? { token: "synthetic" } : { status: "done", review: scanned } }));
  await uploadAndRead();
  expect(container.textContent).toContain("Se leyó un escaneo");
  expect(container.textContent).toContain("Lectura OCR dudosa");
  expect(button("Confirmar y aplicar al formulario").disabled).toBe(true);
  expect(apply).not.toHaveBeenCalled();
});

it("integrates with Clients and saves only after review and a separate Guardar", async () => {
  const saves: Record<string, unknown>[] = [];
  fetchMock.mockImplementation(async (url, init) => {
    if (url === "/api/clients/csf") return { ok: true, json: async () => init?.method === "POST"
      ? init.headers ? { values: extracted } : { token: "synthetic" } : { status: "done", review } };
    if (url === "/api/clients" && init?.method === "POST") {
      saves.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ client: { clientId: "synthetic", active: true, ...extracted } }) };
    }
    return { ok: true, json: async () => ({ clients: [] }) };
  });
  await act(async () => root.render(<ClientShell csfEnabled clientLogos={[]} initialClients={[]} />));
  await act(async () => button("Nuevo cliente").click());
  const input = container.querySelector<HTMLInputElement>('input[type="file"][accept=".pdf,application/pdf"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["%PDF-1.7"], "csf.pdf")] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(button("Guardar").disabled).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(1500));
  expect(container.querySelector<HTMLInputElement>('input[placeholder="Nombre de la empresa"]')!.value).toBe("");
  expect(saves).toHaveLength(0);
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async () => button("Confirmar y aplicar al formulario").click());
  expect(container.querySelector<HTMLInputElement>('input[placeholder="Nombre de la empresa"]')!.value).toBe(extracted.company);
  expect(saves).toHaveLength(0); expect(button("Guardar").disabled).toBe(false);
  await act(async () => {
    const usage = container.querySelector<HTMLSelectElement>("#client-cfdi-use")!;
    usage.value = "G03"; usage.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => button("Guardar").click());
  expect(saves).toHaveLength(1); expect(saves[0]).toMatchObject({ ...extracted, cfdiUse: "G03" });
});

it("provides an explicit button connected to the PDF picker",async()=>{
 await act(async()=>root.render(<CsfReviewPanel current={current} onApply={apply} onPendingChange={pending}/>));
 const input=container.querySelector<HTMLInputElement>('input[type=file]')!;
 const picker=vi.spyOn(input,'click').mockImplementation(()=>{});
 await act(async()=>button('Cargar y leer CSF (PDF)').click());
 expect(picker).toHaveBeenCalledOnce();expect(fetchMock).not.toHaveBeenCalled();picker.mockRestore();
});
it("bounds a stuck status request and retries the same job without another upload",async()=>{
 fetchMock.mockImplementation(async(_url,init)=>{
  if(init?.method==='POST')return {ok:true,json:async()=>({token:'synthetic',status:'queued'})};
  return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted'))));
 });
 await uploadAndRead();await act(async()=>vi.advanceTimersByTimeAsync(15000));
 expect(container.textContent).toContain('La consulta tardó demasiado');
 fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({status:'done',review})});
 await act(async()=>button('Consultar de nuevo').click());await act(async()=>vi.advanceTimersByTimeAsync(0));
 expect(container.textContent).toContain('Extraído: EXTRAIDO');
 expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
});
it("stops a responsive but stuck queue after wall-clock 90 seconds",async()=>{
 fetchMock.mockImplementation(async(_url,init)=>({ok:true,json:async()=>init?.method==='POST'?{token:'synthetic',status:'queued'}:{status:'queued'}}));
 await uploadAndRead();expect(container.textContent).toContain('esperando turno');
 await act(async()=>vi.advanceTimersByTimeAsync(90000));
 expect(container.textContent).toContain('después de 90 segundos');
 await act(async()=>button('Descartar esta revisión y continuar con captura manual').click());
 expect(pending).toHaveBeenLastCalledWith(false);expect(apply).not.toHaveBeenCalled();
});
