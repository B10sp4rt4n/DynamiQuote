// @vitest-environment jsdom
import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { ProcurementDraftPanel } from "./procurement-draft-panel";
vi.mock("next/link",()=>({default:({children,...props}:React.ComponentProps<"a">)=><a {...props}>{children}</a>}));
const fetchMock=vi.fn();
let root:Root,container:HTMLDivElement;
const candidate={tenantId:"a",proposalId:"p",enabled:true,canPrepare:true,reason:null,winRevision:3,fingerprint:"a".repeat(64),drafts:[]};
function button(name:string){return [...container.querySelectorAll("button")].find(b=>b.textContent===name)!;}
beforeEach(()=>{
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();
  container=document.createElement("div");document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it("pins preparation to the viewed closure and recovers a lost response before another write",async()=>{
  let saved=false;
  fetchMock.mockImplementation(async(_path:string,init:RequestInit)=>{
    if(init.method==="POST"){saved=true;throw Error("Respuesta perdida");}
    return {ok:true,json:async()=>({...candidate,canPrepare:!saved,reason:saved?"Requisición ya preparada":null})};
  });
  await act(async()=>root.render(<ProcurementDraftPanel tenantId="a" proposalId="p"/>));
  await act(async()=>button("Preparar requisición en borrador").click());
  const [path,init]=fetchMock.mock.calls.find(([,init])=>init.method==="POST")!;
  expect(path).toBe("/api/proposals/p/procurement");expect(init.headers["X-Tenant-Context"]).toBe("a");
  expect(JSON.parse(init.body)).toEqual({action:"prepare",expectedWinRevision:3,expectedFingerprint:candidate.fingerprint});
  expect(button("Preparar requisición en borrador").disabled).toBe(true);
  await act(async()=>button("Preparar requisición en borrador").click());
  expect(fetchMock.mock.calls.filter(([,init])=>init.method==="POST")).toHaveLength(1);
  await act(async()=>button("Recuperar estado de la requisición").click());
  expect(container.textContent).toContain("Requisición ya preparada");expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(button("Preparar requisición en borrador")).toBeUndefined();
});
it("hides a response for another company and offers no preparation for a disabled policy",async()=>{
  fetchMock.mockResolvedValue({ok:true,json:async()=>({...candidate,tenantId:"b"})});
  await act(async()=>root.render(<ProcurementDraftPanel tenantId="a" proposalId="p"/>));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("empresa o propuesta activa cambió");
  expect(button("Preparar requisición en borrador")).toBeUndefined();
  fetchMock.mockResolvedValue({ok:true,json:async()=>({...candidate,enabled:false,canPrepare:false,reason:"Desactivado para esta empresa"})});
  await act(async()=>button("Recuperar estado de la requisición").click());
  expect(container.textContent).toContain("Desactivado para esta empresa");expect(button("Preparar requisición en borrador")).toBeUndefined();
});
it("aborts an outstanding read when leaving the company screen",async()=>{
  fetchMock.mockImplementation(()=>new Promise(()=>{}));
  await act(async()=>root.render(<ProcurementDraftPanel tenantId="a" proposalId="p"/>));
  const signal=fetchMock.mock.calls[0][1].signal as AbortSignal;
  await act(async()=>root.render(<p>Otra empresa</p>));expect(signal.aborted).toBe(true);
});
