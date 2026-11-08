// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ProposalCancellationPanel} from './proposal-cancellation-panel';
import {ProposalCorrectionPanel} from './proposal-correction-panel';
let root:Root,container:HTMLDivElement;
const fetchMock=vi.fn();
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
function click(label:string){return [...container.querySelectorAll('button')].find(b=>b.textContent===label)!;}
it('requires review and sends one real cancellation request on a double click',async()=>{
 let status='not_requested';fetchMock.mockImplementation(async(_url:string,init?:RequestInit)=>{if(init?.method==='POST')status='requested';return {ok:true,json:async()=>({environment:'production',status})};});
 await act(async()=>root.render(<ProposalCancellationPanel proposalId="synthetic"/>));
 expect(click('Solicitar cancelación real').disabled).toBe(true);
 await act(async()=>container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
 await act(async()=>{click('Solicitar cancelación real').click();click('Solicitar cancelación real').click();});
 const posts=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST');expect(posts).toHaveLength(1);
 expect(JSON.parse(posts[0][1].body)).toMatchObject({reason:'03',confirm_real_operation:true});
 expect(container.textContent).toContain('pendiente de confirmación');
});
it('labels real replacement issuance and requires confirmation before a single request',async()=>{
 const data={environment:'production',active_uuid:'synthetic-original',pending:true,kind:'invoice',defaults:{},history:[{id:'revision',source_uuid:'synthetic-original',status:'prepared',reason:'Synthetic correction',changes:{customer_name:'Synthetic'},source_cancellation_status:'not_requested'}]};
 fetchMock.mockImplementation(async(_url:string,init?:RequestInit)=>({ok:true,json:async()=>init?.method==='POST'?{...data,history:[{...data.history[0],status:'unknown'}]}:data}));
 await act(async()=>root.render(<ProposalCorrectionPanel proposalId="synthetic"/>));
 expect(click('Emitir sustituta real').disabled).toBe(true);
 await act(async()=>container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
 await act(async()=>{click('Emitir sustituta real').click();click('Emitir sustituta real').click();});
 const posts=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST');expect(posts).toHaveLength(1);
 expect(JSON.parse(posts[0][1].body)).toEqual({confirm_real_operation:true});
 expect(container.textContent).toContain('Resultado incierto');
});
it('hides preparation when cancellation has already been recorded',async()=>{
 fetchMock.mockResolvedValue({ok:true,json:async()=>({environment:'production',active_uuid:'synthetic-original',pending:false,kind:'invoice',defaults:{},history:[],can_correct:false})});
 await act(async()=>root.render(<ProposalCorrectionPanel proposalId="synthetic"/>));
 expect(container.textContent).toContain('cancelación registrada');expect(click('Preparar sustitución para revisión')).toBeUndefined();
});
