// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ProposalSatStatus} from './proposal-sat-status';
let root:Root,host:HTMLDivElement;const fetcher=vi.fn();
const uuid='11111111-2222-4333-8444-555555555555';
const answer={id:'observation',checked_at:'2026-11-10T18:00:00Z',outcome:'answered',source:'SAT ConsultaCFDIService',response:{Estado:'Cancelado'},origin:'status_query'};
const state={document_uuid:uuid,history:[answer],latest_attempt:answer,last_answer:answer};
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',fetcher);fetcher.mockReset();fetcher.mockResolvedValue({ok:true,json:async()=>state});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function show(){await act(async()=>root.render(<ProposalSatStatus proposalId="synthetic" uuid={uuid}/>));}
function button(label:string){return [...host.querySelectorAll('button')].find(b=>b.textContent===label)!;}
it('reads preserved evidence without consulting SAT automatically',async()=>{
 await show();expect(host.textContent).toContain('Cancelado');expect(host.textContent).toContain('SAT ConsultaCFDIService');expect(host.textContent).toContain('12:00');
 expect(fetcher.mock.calls).toHaveLength(1);expect(fetcher.mock.calls[0][1].method).toBeUndefined();
});
it('only consults once on double click and preserves the last answer after failure',async()=>{
 await show();const failed={id:'failed',checked_at:'2026-11-10T18:01:00Z',outcome:'query_failed',source:'SAT ConsultaCFDIService',response:null,error:'Consulta sin confirmar',origin:'status_query'};
 fetcher.mockResolvedValueOnce({ok:true,json:async()=>({...state,latest_attempt:failed,history:[failed,answer]})});
 await act(async()=>{button('Consultar estado en SAT').click();button('Consultar estado en SAT').click();});
 expect(fetcher.mock.calls.filter(([,init])=>init.method==='POST')).toHaveLength(1);
 expect(host.textContent).toContain('Consulta fallida');expect(host.textContent).toContain('Cancelado');
 await act(async()=>button('Actualizar historial sin consultar SAT').click());
 expect(fetcher.mock.calls.at(-1)?.[1].method).toBe('GET');
});
it('does not accept evidence returned for another UUID',async()=>{
 fetcher.mockResolvedValueOnce({ok:true,json:async()=>({...state,document_uuid:'different'})});await show();
 expect(host.textContent).toContain('La evidencia no corresponde');expect(host.textContent).not.toContain('Última respuesta conservada');
});
it('labels no localizado independently of cancellation',async()=>{
 const missing={...answer,response:{Estado:'No localizado'}};
 fetcher.mockResolvedValueOnce({ok:true,json:async()=>({...state,last_answer:missing,history:[missing],latest_attempt:missing})});await show();
 expect(host.textContent).toContain('no acredita una cancelación');
});
