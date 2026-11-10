// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ProposalInvoicePanel} from './proposal-invoice-panel';
let root:Root,host:HTMLDivElement;
const fetcher=vi.fn();
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',fetcher);fetcher.mockReset();
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it.each([true,false])('uses confirmed cancellation from the standard=%s panel over stale payment data',async standard=>{
 fetcher.mockImplementation(async(url:string)=>({ok:true,json:async()=>{
  if(url.endsWith('/payments'))return {supported:true,environment:'production',total:'1.16',paid:'0.00',balance:'1.16',invoice_fiscal_ready:false,invoice_cancellation_status:'requested',payments:[]};
  if(url.endsWith('/cancellation') || url.endsWith('/production-cancellation'))return {enabled:true,status:'cancelled',environment:'production',document_uuid:'synthetic-original',acknowledgement_xml:'synthetic-ack'};
  return {invoice:{status:'stamped',uuid:'synthetic-original',draftId:'draft'},ppdEnabled:true,cancellationEnabled:standard,correctionsEnabled:false};
 }}));
 await act(async()=>root.render(<ProposalInvoicePanel proposalId="synthetic" recipientCompany={null} canPrepareInvoice={false}/>));
 expect(host.textContent).toContain('Factura cancelada');
 expect(host.firstElementChild?.className).toContain('bg-zinc-50');
 expect(host.textContent).toContain('Saldo histórico del comprobante: $1.16');
 expect(host.textContent).not.toContain('Hay una sustitución o cancelación pendiente');
 expect(host.querySelector('a[href$="/invoice/xml"]')).not.toBeNull();
 expect(host.textContent).not.toContain('Registrar pago recibido');
 expect(fetcher.mock.calls.every(([,init])=>!init?.method || init.method==='GET')).toBe(true);
});
