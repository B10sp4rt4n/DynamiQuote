// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ProposalPaymentPanel} from './proposal-payment-panel';
let root:Root,container:HTMLDivElement;
const fetchMock=vi.fn(),confirmMock=vi.fn();
beforeEach(async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',fetchMock);vi.spyOn(window,'confirm').mockImplementation(confirmMock);
 fetchMock.mockReset();confirmMock.mockReset();fetchMock.mockImplementation(async(_url:string,init?:RequestInit)=>({ok:true,json:async()=>init?.method==='POST'?{ok:true}:{supported:true,environment:'production',invoice_uuid:'synthetic-invoice',total:'116.00',paid:'58.00',balance:'58.00',receipt_stamp_enabled:true,payments:[{id:'payment',sequence:1,reference:'SYNTHETIC',amount:'58.00',balance_after:'58.00',receipt_status:'not_sent'}]}}));
 container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root.render(<ProposalPaymentPanel proposalId="synthetic"/>));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
function issue(){return [...container.querySelectorAll('button')].find(button=>button.textContent==='Emitir complemento fiscal real')!;}
it('shows real fiscal consequence and cancels emission without consent',async()=>{
 expect(container.textContent).toContain('comprobantes fiscales reales');confirmMock.mockReturnValue(false);
 await act(async()=>issue().click());expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
 expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('synthetic-invoice'));
});
it('submits explicit consent once on a double click',async()=>{
 confirmMock.mockReturnValue(true);await act(async()=>{issue().click();issue().click();});
 const writes=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1);
 expect(JSON.parse(writes[0][1].body)).toEqual({confirm_real_receipt:true});
});
