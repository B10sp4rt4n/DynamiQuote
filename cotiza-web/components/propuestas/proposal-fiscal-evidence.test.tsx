// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ProposalFiscalEvidence} from './proposal-fiscal-evidence';
import {ProposalCancellationPanel} from './proposal-cancellation-panel';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it('does not infer SAT status or a date from a confirmed internal cancellation',async()=>{
 await act(async()=>root.render(<ProposalFiscalEvidence evidence={{status:'cancelled',acknowledgement_xml:'synthetic'}}/>));
 expect(host.textContent).toContain('Cancelación confirmada · fuente: Digestor Fiscal');
 expect(host.textContent).toContain('Sin detalle SAT disponible');expect(host.textContent).toContain('Fecha no disponible');
 expect(host.querySelector('time')).toBeNull();
});
it('shows retained SAT evidence separately and uses its supplied date in Mexico City',async()=>{
 await act(async()=>root.render(<ProposalFiscalEvidence evidence={{status:'requested',acknowledgement_xml:'synthetic',checked_at:'2026-11-10T18:00:00Z',sat_response:{Estado:'Vigente'}}}/>));
 expect(host.textContent).toContain('Cancelación solicitada; pendiente de confirmación');
 expect(host.textContent).toContain('Vigente · recibida a través del servicio fiscal');
 expect(host.querySelector('time')?.dateTime).toBe('2026-11-10T18:00:00.000Z');
 expect(host.querySelector('time')?.textContent).toContain('12:00');
});
it('does not fabricate dates for malformed input or turn an unknown result into vigente',async()=>{
 await act(async()=>root.render(<ProposalFiscalEvidence evidence={{status:'unknown',acknowledgement_xml:null,checked_at:'not-a-date'}}/>));
 expect(host.textContent).toContain('Resultado incierto');expect(host.textContent).toContain('Fecha no disponible');expect(host.querySelector('time')).toBeNull();
});
it('preserves the last known state and date when a reconciliation request fails',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({status:'requested',checked_at:'2026-11-10T18:00:00Z',acknowledgement_xml:'synthetic'})})
  .mockRejectedValueOnce(new Error('Consulta sin confirmar')).mockRejectedValueOnce(new Error('Sin conexión'));
 vi.stubGlobal('fetch',fetcher);
 await act(async()=>root.render(<ProposalCancellationPanel proposalId="synthetic"/>));
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='Consultar estado fiscal sin repetir solicitud')!;
 await act(async()=>button.click());
 expect(host.textContent).toContain('Consulta sin confirmar');expect(host.textContent).toContain('Cancelación solicitada; pendiente de confirmación');
 expect(host.querySelector('time')?.dateTime).toBe('2026-11-10T18:00:00.000Z');
 expect(fetcher.mock.calls.filter(([,options])=>options?.method==='POST')).toHaveLength(1);
});
