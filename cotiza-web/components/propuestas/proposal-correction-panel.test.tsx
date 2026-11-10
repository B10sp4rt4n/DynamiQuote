// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ProposalCorrectionPanel} from './proposal-correction-panel';
let root:Root,container:HTMLDivElement;
const fetchMock=vi.fn();
const original='11111111-2222-4333-8444-555555555555',replacement='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
function state(status='prepared',cancellation='not_requested',active=original){return {
 environment:'sandbox',kind:'receipt',active_uuid:active,active_xml_base64:'synthetic',pending:active===original,
 defaults:{payment_form:'03',operation_reference:'ORIGINAL'},history:[{id:'revision',source_uuid:original,
  result_uuid:status==='stamped'?replacement:null,status,source_cancellation_status:cancellation,
  reason:'Corrección sintética revisada',changes:{payment_form:'02',operation_reference:'CORREGIDA'}}],
};}
const reply=(value:ReturnType<typeof state>)=>({ok:true,json:async()=>value});
const button=(text:string)=>[...container.querySelectorAll('button')].find(el=>el.textContent===text);
async function click(text:string){await act(async()=>button(text)!.click());}
async function consent(){await act(async()=>container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());}
beforeEach(async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();
 fetchMock.mockResolvedValue(reply(state()));container=document.createElement('div');document.body.append(container);
 root=createRoot(container);await act(async()=>root.render(<ProposalCorrectionPanel proposalId="synthetic" paymentId="payment"/>));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('protects a lost replacement response until a server read confirms the same revision',async()=>{
 await consent();fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
 await click('Timbrar sustituta en pruebas');
 expect(button('Timbrar sustituta en pruebas')).toBeUndefined();
 expect(button('Descartar corrección sin emitir')).toBeUndefined();
 expect(container.textContent).toContain('No repitas');expect(container.textContent).toContain('Comprobante seleccionado en Cotiza: '+original);
 const diagnostic=[...container.querySelectorAll('a')].find(el=>el.textContent==='Descargar diagnóstico de conciliación');
 expect(diagnostic?.getAttribute('href')).toBe('/api/proposals/synthetic/invoice/payments/payment/receipt/correction?format=diagnostic');
 fetchMock.mockResolvedValueOnce(reply(state('stamped')));await click('Consultar historial y estado');
 expect(button('Solicitar cancelación del anterior en pruebas')).toBeDefined();
 expect(container.textContent).toContain('UUID sustituto: '+replacement);
 expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
});
it('keeps a lost cancellation protected and activates the replacement only on confirmation',async()=>{
 fetchMock.mockResolvedValueOnce(reply(state('stamped')));await click('Consultar historial y estado');await consent();
 fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));await click('Solicitar cancelación del anterior en pruebas');
 expect(button('Solicitar cancelación del anterior en pruebas')).toBeUndefined();
 expect(button('Consultar confirmación de cancelación')).toBeDefined();
 expect(container.textContent).toContain('Comprobante seleccionado en Cotiza: '+original);
 fetchMock.mockResolvedValueOnce(reply(state('stamped','cancelled',replacement)));await click('Consultar confirmación de cancelación');
 expect(container.textContent).toContain('Comprobante seleccionado en Cotiza: '+replacement);
 expect(fetchMock.mock.calls.filter(([url])=>url.endsWith('/cancel-original'))).toHaveLength(1);
 expect(fetchMock.mock.calls.filter(([url])=>url.endsWith('/stamp'))).toHaveLength(0);
});
