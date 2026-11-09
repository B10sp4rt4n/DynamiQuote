// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NewOpportunity } from "./new-opportunity";
vi.mock("next/link",()=>({ default:({children,...props}:React.ComponentProps<"a">)=><a {...props}>{children}</a> }));
let root:Root, container:HTMLDivElement;
const fetchMock=vi.fn();
beforeEach(async()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root.render(<NewOpportunity clients={[{clientId:"11a244aa-5d21-4133-a073-7bac9e62c552",company:"Synthetic"}]} />));});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
async function fill(){await act(async()=>{const select=container.querySelector('select')!;select.value='11a244aa-5d21-4133-a073-7bac9e62c552';select.dispatchEvent(new Event('change',{bubbles:true}));const input=container.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Renewal');input.dispatchEvent(new Event('input',{bubbles:true}));});}
async function submit(){await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
it("shows numbered section navigation and requires a client and name",()=>{expect(container.querySelector('[aria-current="page"]')?.textContent).toContain('1. Oportunidad');expect(container.textContent).toContain('2. Cotización');expect(container.textContent).toContain('3. Propuesta');expect(container.querySelector('button')?.disabled).toBe(true);});
it("recovers an uncertain submission with the same attempt and links to the created opportunity",async()=>{await fill();fetchMock.mockRejectedValueOnce(new Error('Respuesta incierta'));await submit();expect(container.querySelector('[role="alert"]')?.textContent).toContain('Respuesta incierta');expect(container.querySelector('section[aria-label="Secciones del negocio"] [role="status"]')?.textContent).toContain('Requiere atención');fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({opportunity:{opportunityId:'synthetic-opp',opportunityNumber:'OPP-0001',title:'Renewal'}})});await submit();const first=JSON.parse(fetchMock.mock.calls[0][1].body),second=JSON.parse(fetchMock.mock.calls[1][1].body);expect(first.creationId).toBe(second.creationId);expect(container.querySelector('a[href="/cotizaciones?opportunityId=synthetic-opp"]')).not.toBeNull();expect(container.querySelector('form')).toBeNull();});
