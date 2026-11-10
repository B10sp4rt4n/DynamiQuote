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
it.each(['stamp_response','status_read'])('protects a lost %s and recovers by reading without another stamp',async failure=>{
 confirmMock.mockReturnValue(true);
 if(failure==='status_read')fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({ok:true})});
 fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
 await act(async()=>issue().click());
 expect(container.textContent).toContain('No repitas el timbrado');expect(issue()).toBeUndefined();
 expect(container.textContent).toContain('Saldo: $58.00');
 const reload=[...container.querySelectorAll('button')].find(button=>button.textContent==='Consultar saldo y estado')!;
 fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({supported:true,environment:'production',invoice_uuid:'synthetic-invoice',total:'116.00',paid:'58.00',balance:'58.00',receipt_stamp_enabled:true,
  payments:[{id:'payment',sequence:1,reference:'SYNTHETIC',amount:'58.00',balance_after:'58.00',receipt_status:'stamped',receipt_uuid:'11111111-2222-4333-8444-555555555555'}]})});
 await act(async()=>reload.click());
 expect(container.textContent).toContain('Complemento timbrado');expect(container.textContent).toContain('11111111-2222-4333-8444-555555555555');
 expect(container.querySelector('a[href$="receipt?download=1"]')).not.toBeNull();expect(issue()).toBeUndefined();
 expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
});

it.each(['cancelled', 'parent-confirmed'] as const)('preserves historical amounts and blocks writes for %s', async source => {
 const summary = {supported:true,environment:'production',invoice_uuid:'synthetic-invoice',
  total:'116.00',paid:'58.00',balance:'58.00',receipt_stamp_enabled:true,invoice_fiscal_ready:false,
  invoice_cancellation_status:source==='cancelled'?'cancelled':'requested',payments:[
   {id:'first',sequence:1,reference:'RECEIVED',amount:'29.00',balance_after:'87.00',receipt_status:'stamped',receipt_uuid:'synthetic-rep'},
   {id:'second',sequence:2,reference:'RECEIVED-2',amount:'29.00',balance_after:'58.00',receipt_status:'not_sent'}]};
 fetchMock.mockResolvedValue({ok:true,json:async()=>summary});
 await act(async()=>root.render(<ProposalPaymentPanel key="cancelled" proposalId="synthetic" invoiceCancellationStatus={source==='parent-confirmed'?'cancelled':undefined}/>));
 expect(container.textContent).toContain('Historial de pagos · factura cancelada');
 expect(container.textContent).toContain('Total original: $116.00');
 expect(container.textContent).toContain('Pagos registrados: $58.00');
 expect(container.textContent).toContain('Saldo histórico del comprobante: $58.00');
 expect(container.textContent).toContain('synthetic-rep');
 expect(container.querySelector('a[href$="receipt?download=1"]')).not.toBeNull();
 expect(container.textContent).not.toContain('Hay una sustitución o cancelación pendiente');
 expect(container.textContent).not.toContain('Registrar pago recibido');
 expect(issue()).toBeUndefined();
 expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
});
it.each(['requested','unknown','processing'])('keeps pending review wording for %s',async status=>{
 fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({supported:true,environment:'production',total:'116.00',paid:'0.00',balance:'116.00',invoice_fiscal_ready:false,invoice_cancellation_status:status,payments:[]})});
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Consultar saldo y estado')!.click());
 expect(container.textContent).toContain('Hay una sustitución o cancelación pendiente');
 expect(container.textContent).not.toContain('Cancelación confirmada.');
 expect(container.textContent).not.toContain('Registrar pago recibido');
});

it.each(['not_sent','unknown','processing','rejected','revision-pending'])('distinguishes a settled balance from a pending %s REP',async status=>{
 const payment={id:'payment',sequence:1,reference:'RECEIVED',amount:'116.00',balance_after:'0.00',
  receipt_status:status==='revision-pending'?'stamped':status,receipt_uuid:status==='revision-pending'?'synthetic-rep':null,
  fiscal_ready:false};
 fetchMock.mockResolvedValue({ok:true,json:async()=>({supported:true,environment:'production',total:'116.00',paid:'116.00',balance:'0.00',invoice_fiscal_ready:true,payments:[payment]})});
 await act(async()=>root.render(<ProposalPaymentPanel key={status} proposalId="synthetic"/>));
 const statusBox=container.querySelector('[aria-label="Seguimiento de pagos y complementos"]')!;
 expect(statusBox.textContent).toContain('Pago total registrado');
 expect(statusBox.textContent).toContain('1 pago con complemento pendiente');
 expect(statusBox.textContent).toContain('No registres otra vez el mismo pago');
 expect(statusBox.textContent).not.toContain('sin pendientes');
 expect(container.textContent).not.toContain('Registrar pago recibido');
 expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
});

it.each(['requested','unknown','processing','cancelled'])('blocks the following REP immediately after a %s cancellation read despite stale fiscal_ready',async status=>{
 const summary={supported:true,environment:'production',total:'116.00',paid:'116.00',balance:'0.00',receipt_stamp_enabled:true,invoice_fiscal_ready:true,payments:[
  {id:'first',sequence:1,reference:'ONE',amount:'58.00',balance_after:'58.00',receipt_status:'stamped',receipt_uuid:'synthetic-rep',fiscal_ready:true,cancellation_status:'not_requested'},
  {id:'second',sequence:2,reference:'TWO',amount:'58.00',balance_after:'0.00',receipt_status:'not_sent',fiscal_ready:false}]};
 fetchMock.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('/cancellation')?{status,document_uuid:'synthetic-rep',environment:'production'}:summary}));
 await act(async()=>root.render(<ProposalPaymentPanel key={status} proposalId="synthetic" cancellationEnabled/>));
 expect(issue()).toBeUndefined();
 expect(container.querySelector('[aria-label="Seguimiento de pagos y complementos"]')?.textContent).toContain('2 pagos con complemento pendiente');
 expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
});

it('counts a completed substitution by its effective readiness, preserving historical original cancellation',async()=>{
 const summary={supported:true,environment:'production',total:'116.00',paid:'116.00',balance:'0.00',receipt_stamp_enabled:true,invoice_fiscal_ready:true,payments:[
  {id:'first',sequence:1,reference:'ONE',amount:'58.00',balance_after:'58.00',receipt_status:'stamped',receipt_uuid:'original',fiscal_ready:true,has_active_revision:true,cancellation_status:'cancelled'},
  {id:'second',sequence:2,reference:'TWO',amount:'58.00',balance_after:'0.00',receipt_status:'not_sent',fiscal_ready:false}]};
 fetchMock.mockResolvedValue({ok:true,json:async()=>summary});
 await act(async()=>root.render(<ProposalPaymentPanel key="substituted" proposalId="synthetic"/>));
 expect(issue()).toBeDefined();
 expect(container.querySelector('[aria-label="Seguimiento de pagos y complementos"]')?.textContent).toContain('1 pago con complemento pendiente');
});

it('describes partial payments whose current REP are complete without claiming SAT status',async()=>{
 fetchMock.mockResolvedValue({ok:true,json:async()=>({supported:true,environment:'production',total:'116.00',paid:'58.00',balance:'58.00',payments:[
  {id:'first',sequence:1,reference:'ONE',amount:'58.00',balance_after:'58.00',receipt_status:'stamped',receipt_uuid:'synthetic-rep',fiscal_ready:true}]})});
 await act(async()=>root.render(<ProposalPaymentPanel key="partial" proposalId="synthetic"/>));
 const box=container.querySelector('[aria-label="Seguimiento de pagos y complementos"]')!;
 expect(box.textContent).toContain('Pagos parciales registrados');expect(box.textContent).toContain('sin pendientes en Cotiza');
 expect(box.textContent).toContain('estado ante el SAT se consulta por separado');expect(box.textContent).not.toContain('Pago total registrado');
});
