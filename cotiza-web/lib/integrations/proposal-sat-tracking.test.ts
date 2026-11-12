import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({authorize:vi.fn(),query:vi.fn(),schedule:vi.fn(),limit:vi.fn()}));
vi.mock('./proposal-payments',()=>({authorizeProposalFiscalDocument:m.authorize,paymentFailure:()=>new Response('{}',{status:502})}));
vi.mock('./digestor-fiscal',()=>({getSatTracking:m.query,setSatSchedule:m.schedule}));
vi.mock('@/lib/utils/rate-limit',()=>({enforceRateLimit:m.limit}));
import {satStatus,satSchedule} from './proposal-sat-tracking';
const uuid='11111111-2222-4333-8444-555555555555';const ctx={params:Promise.resolve({proposalId:'p',paymentId:'payment'})};
beforeEach(()=>{vi.resetAllMocks();m.authorize.mockResolvedValue({draftId:'server-resolved',environment:'production',tenantId:'tenant'});m.query.mockResolvedValue({document_uuid:uuid,history:[]});m.limit.mockReturnValue({allowed:true});});
it.each(['GET','POST'])('routes %s to the server-resolved document and exact payment',async method=>{
 expect((await satStatus(new Request('https://cotiza.test/status?expected_uuid='+uuid,{method}),ctx)).status).toBe(200);
 expect(m.query).toHaveBeenCalledWith('server-resolved',uuid,method==='POST','payment');
});
it('blocks sandbox, invalid UUID and rate limited requests before upstream',async()=>{
 m.authorize.mockResolvedValueOnce({environment:'sandbox'});
 expect((await satStatus(new Request('https://cotiza.test/status?expected_uuid='+uuid),ctx)).status).toBe(403);
 expect((await satStatus(new Request('https://cotiza.test/status?expected_uuid=arbitrary'),ctx)).status).toBe(422);
 m.limit.mockReturnValueOnce({allowed:false});
 expect((await satStatus(new Request('https://cotiza.test/status?expected_uuid='+uuid,{method:'POST'}),ctx)).status).toBe(429);
 expect(m.query).not.toHaveBeenCalled();
});
it('changes only the authorized document schedule and rejects forged body fields',async()=>{
 m.authorize.mockResolvedValue({draftId:'server-resolved',environment:'production',tenantId:'tenant',canManageSatSchedule:true});
 m.schedule.mockResolvedValue({document_uuid:uuid,history:[],schedule:{can_manage:true,enabled:true}});
 const request=(body:unknown)=>new Request('https://cotiza.test/status?expected_uuid='+uuid,{method:'POST',body:JSON.stringify(body)});
 const result=await satSchedule(request({enabled:true}),ctx);
 expect(result.status).toBe(200);expect(m.schedule).toHaveBeenCalledWith('server-resolved',uuid,true,'payment');
 expect((await satSchedule(request({enabled:true,tenant:'foreign'}),ctx)).status).toBe(422);
 expect((await satSchedule(request({enabled:'true'}),ctx)).status).toBe(422);
 expect(m.schedule).toHaveBeenCalledTimes(1);
});
it('hides schedule management from sellers and blocks their direct POST',async()=>{
 m.query.mockResolvedValue({document_uuid:uuid,history:[],schedule:{can_manage:true,enabled:true}});
 const value=await (await satStatus(new Request('https://cotiza.test/status?expected_uuid='+uuid),ctx)).json();
 expect(value.schedule.can_manage).toBe(false);
 expect((await satSchedule(new Request('https://cotiza.test/status?expected_uuid='+uuid,{method:'POST',body:'{"enabled":false}'}),ctx)).status).toBe(403);
 expect(m.schedule).not.toHaveBeenCalled();
});
