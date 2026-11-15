// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {GmailContextPanel} from "./gmail-context-panel";
import {GmailConnection} from "./gmail-connection";
vi.mock("next/link",()=>({default:({href,children}:{href:string;children:React.ReactNode})=><a href={href}>{children}</a>}));
let root:Root,container:HTMLDivElement;const fetchMock=vi.fn();
const message={messageId:"abc1",threadId:"thread",internetMessageId:"<one@test>",subject:"Same subject",from:"sender@test",to:"reader@test",cc:"",date:"11 Nov 2026",receivedAt:"2026-11-11T12:00:00Z",bodyText:"Message one",bodyFormat:"plain",attachments:[],observedAt:"2026-11-15T12:00:00Z"};
const inbox={ready:true,connection:{email:"reader@test",status:"connected"},links:[]};
const button=(text:string)=>[...container.querySelectorAll("button")].find(b=>b.textContent===text)!;
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();
  container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it("keeps same-subject messages separate and requires review before saving",async()=>{
  let saved=false;
  fetchMock.mockImplementation(async(_url:string,init?:RequestInit)=>{
    const body=init?.body?JSON.parse(String(init.body)):null;
    const result=!body?{...inbox,links:saved?[{linkId:"link",snapshotHash:"a".repeat(64),message}]:[]}
      :body.action==="search"?{messages:[{messageId:"abc1",subject:"Same subject",from:"sender@test",date:"Nov 11"},
        {messageId:"abc2",subject:"Same subject",from:"sender@test",date:"Nov 12"}],nextPageToken:null}
      :body.action==="preview"?{message:{...message,messageId:body.messageId,bodyText:body.messageId==="abc1"?"Message one":"Message two"},previewToken:"signed"}
      :{unchanged:false};
    if(body?.action==="link")saved=true;
    return {ok:true,json:async()=>result};
  });
  await act(async()=>root.render(<GmailContextPanel tenantId="one" opportunityId="opp" initialQuery="PROP-TEST"/>));
  await act(async()=>container.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(container.querySelectorAll('ul[aria-label="Resultados de Gmail"] li')).toHaveLength(2);
  await act(async()=>[...container.querySelectorAll("button")].filter(b=>b.textContent==="Leer este correo")[1].click());
  expect(container.textContent).toContain("Message two");expect(saved).toBe(false);
  await act(async()=>button("Vincular correo y adjuntos").click());expect(saved).toBe(true);
  const calls=fetchMock.mock.calls.filter(([,init])=>init?.body).map(([,init])=>JSON.parse(String(init.body)));
  expect(calls.at(-1)).toEqual({action:"link",messageId:"abc2",previewToken:"signed"});
  expect(fetchMock.mock.calls.every(([,init])=>init.headers["X-Tenant-Context"]==="one")).toBe(true);
});
it("shows missing Google configuration without suggesting a connected mailbox",async()=>{
  await act(async()=>root.render(<GmailConnection tenantId="one" ready={false} initial={null}/>));
  expect(button("Conectar Gmail").disabled).toBe(true);expect(container.textContent).toContain("Sin cuenta conectada");
  expect(fetchMock).not.toHaveBeenCalled();
});
