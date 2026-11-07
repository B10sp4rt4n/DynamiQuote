// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("next/link",()=>({default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}));
import {WonInbox,WonNoticeLink} from "./won-notifications";
let root:Root,container:HTMLDivElement;
const fetchMock=vi.fn();
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.stubGlobal("fetch",fetchMock);vi.clearAllMocks();container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it("shows one card with both reasons and marks only that notice read",async()=>{
 fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({notifications:[{id:"notice",subject:"Oportunidad ganada",body:"Detalle",href:"/propuestas/p",reasons:["opportunity_owner","tenant_designated"],createdAt:"2026-11-07T18:00:00Z",readAt:null}],unreadCount:1})});
 await act(async()=>root.render(<WonInbox/>));expect(container.querySelectorAll("article")).toHaveLength(1);expect(container.textContent).toContain("Responsable de la oportunidad + Designado por administración");
 fetchMock.mockResolvedValueOnce({ok:true});const button=[...container.querySelectorAll("button")].find(b=>b.textContent==="Marcar como leído")!;
 await act(async()=>button.click());expect(fetchMock.mock.calls[1]).toEqual(["/api/notifications/won",expect.objectContaining({method:"PATCH",body:JSON.stringify({notificationId:"notice"})})]);expect(container.textContent).toContain("Leído");expect(container.querySelector("button")).toBeNull();
});
it("does not show a read confirmation after a failed update",async()=>{
 fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({notifications:[{id:"n",subject:"Ganada",body:"Detalle",href:"/propuestas/p",reasons:[],createdAt:"2026-11-07T18:00:00Z",readAt:null}],unreadCount:1})});await act(async()=>root.render(<WonInbox/>));fetchMock.mockResolvedValueOnce({ok:false});await act(async()=>container.querySelector("button")!.click());expect(container.textContent).toContain("No se pudo marcar como leído");expect(container.textContent).toContain("Sin leer");
});
it("shows unread count without starting the email worker for ordinary users",async()=>{
 fetchMock.mockResolvedValue({ok:true,json:async()=>({unreadCount:2})});await act(async()=>root.render(<WonNoticeLink/>));expect(container.querySelector('a[aria-label="Avisos comerciales"]')?.getAttribute("href")).toBe("/notificaciones");expect(container.textContent).toContain("2");expect(fetchMock).toHaveBeenCalledTimes(1);
});
