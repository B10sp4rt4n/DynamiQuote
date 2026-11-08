import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const ctx=vi.hoisted(()=>({tenant:vi.fn(),invoice:vi.fn(),visible:vi.fn(),enabled:vi.fn(),remote:vi.fn()}));
vi.mock('@/lib/auth/tenant-context',()=>({getCurrentTenantContext:ctx.tenant}));
vi.mock('@/lib/db/proposal-invoices',()=>({getProposalInvoiceStatusByTenant:ctx.invoice}));
vi.mock('@/lib/db/proposals',()=>({isProposalVisibleToViewer:ctx.visible}));
vi.mock('@/lib/integrations/digestor-fiscal',()=>({isDigestorFiscalEnabledForTenant:ctx.enabled,liveCancellation:ctx.remote}));
import {GET,POST} from './route';
const uuid='11111111-2222-4333-8444-555555555555';
const context={params:Promise.resolve({proposalId:'proposal-a'})};
function post(body:unknown,origin='https://cotiza.test') {return POST(new Request('https://cotiza.test/api/proposals/proposal-a/invoice/production-cancellation',{
  method:'POST',headers:{'Content-Type':'application/json','Origin':origin},body:JSON.stringify(body)}),context);}
beforeEach(()=>{vi.clearAllMocks();process.env['DIGESTOR_FISCAL_LIVE_CANCEL_UUID']=uuid;
  ctx.tenant.mockResolvedValue({id:'tenant-a',userId:'actor-a',authMode:'clerk',userRole:'owner',isSuperAdmin:false});
  ctx.invoice.mockResolvedValue({draftId:'draft-a',uuid,status:'stamped',xmlBase64:'original'});
  ctx.visible.mockResolvedValue(true);ctx.enabled.mockReturnValue(true);ctx.remote.mockResolvedValue({status:'requested',reason:'03',acknowledgement_xml:null});
});
afterEach(()=>{delete process.env['DIGESTOR_FISCAL_LIVE_CANCEL_UUID'];});
describe('production cancellation scoped proxy',()=>{
  it('derives target from authorized tenant/proposal and preserves state',async()=>{
    const r=await post({operation:'submit',confirm:true});expect(r.status).toBe(200);
    expect(ctx.remote).toHaveBeenCalledWith('draft-a','submit',uuid);
    expect(ctx.invoice).toHaveBeenCalledWith('tenant-a','proposal-a');
    expect(await r.json()).toMatchObject({enabled:true,status:'requested'});
  });
  it('requires session',async()=>{ctx.tenant.mockResolvedValue(null);expect((await post({operation:'submit',confirm:true})).status).toBe(401);expect(ctx.remote).not.toHaveBeenCalled();});
  it('rejects bootstrap access',async()=>{ctx.tenant.mockResolvedValue({id:'tenant-a',userId:'bootstrap:a',authMode:'bootstrap',userRole:'owner'});expect((await post({operation:'submit',confirm:true})).status).toBe(401);});
  it('rejects regular users',async()=>{ctx.tenant.mockResolvedValue({id:'tenant-a',userId:'u',authMode:'clerk',userRole:'user'});expect((await post({operation:'submit',confirm:true})).status).toBe(403);});
  it('rejects cross origin calls',async()=>{expect((await post({operation:'submit',confirm:true},'https://attacker.invalid')).status).toBe(403);expect(ctx.remote).not.toHaveBeenCalled();});
  it('rejects caller supplied draft/tenant or cancellation reason',async()=>{for(const extra of [{draftId:'other'},{tenantId:'other'},{reason:'02'}]){expect((await post({operation:'submit',confirm:true,...extra})).status).toBe(422);}expect(ctx.remote).not.toHaveBeenCalled();});
  it('requires reviewed document and explicit consent',async()=>{expect((await post({operation:'submit',confirm:false})).status).toBe(422);ctx.invoice.mockResolvedValue({draftId:'other',uuid:'other',status:'stamped',xmlBase64:'x'});expect(await (await post({operation:'submit',confirm:true})).json()).toEqual({enabled:false});expect(ctx.remote).not.toHaveBeenCalled();});
  it('does not query or submit without capability/visibility',async()=>{ctx.visible.mockResolvedValue(false);expect((await post({operation:'submit',confirm:true})).status).toBe(404);expect(ctx.remote).not.toHaveBeenCalled();});
  it('consultation does not invoke submit',async()=>{await post({operation:'reconcile'});expect(ctx.remote).toHaveBeenCalledWith('draft-a','reconcile',uuid);await GET(new Request('https://cotiza.test/a'),context);expect(ctx.remote).toHaveBeenCalledWith('draft-a','read',uuid);});
});
