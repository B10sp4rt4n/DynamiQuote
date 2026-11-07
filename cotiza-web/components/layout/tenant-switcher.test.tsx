// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TenantSwitcher } from "./tenant-switcher";
let root: Root, container: HTMLDivElement;
const fetchMock = vi.fn(), navigate = vi.fn();
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset(); navigate.mockReset();
  vi.stubGlobal("window", new Proxy(window, { get(target, key, receiver) { return key === "location" ? { assign: navigate } : Reflect.get(target, key, receiver); } }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<TenantSwitcher currentSlug="a" currentName="Empresa A" options={[{id:"a",slug:"a",name:"Empresa A"},{id:"b",slug:"b",name:"Empresa B"}]} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function choose() { await act(async () => { const select=container.querySelector("select")!; select.value="b"; select.dispatchEvent(new Event("change",{bubbles:true})); }); }
async function submit() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})); }); }
it("keeps the current company explicit while preparing a change", async () => {
  expect(container.querySelector("button")?.disabled).toBe(true);
  await choose();
  expect(container.querySelector("summary")?.textContent).toContain("Empresa activa: Empresa A");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("switches through the existing API and drops document IDs by navigating to home", async () => {
  fetchMock.mockResolvedValue({ok:true,json:async()=>({ok:true})}); await choose(); await submit();
  expect(fetchMock).toHaveBeenCalledWith("/api/context/tenant",expect.objectContaining({method:"POST",body:JSON.stringify({slug:"b"})}));
  expect(navigate).toHaveBeenCalledWith("/inicio");
});
it("retains the active company and permits retry after a denied switch", async () => {
  fetchMock.mockResolvedValue({ok:false,json:async()=>({error:"Sin permisos para cambiar de empresa"})});
  await choose(); await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Sin permisos");
  expect(container.querySelector("summary")?.textContent).toContain("Empresa A");
  expect(container.querySelector("button")?.disabled).toBe(false); expect(navigate).not.toHaveBeenCalled();
});
it("does not send two switches while a request is pending", async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockImplementation(()=>new Promise(r=>{resolve=r;})); await choose(); await submit(); await submit();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async()=>resolve({ok:true,json:async()=>({ok:true})}));
  expect(navigate).toHaveBeenCalledTimes(1);
});
