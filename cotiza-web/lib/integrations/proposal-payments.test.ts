import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({tenant:vi.fn(),visible:vi.fn(),invoice:vi.fn()}));
vi.mock('@/lib/auth/tenant-context',()=>({getCurrentTenantContext:m.tenant}));
vi.mock('@/lib/db/proposals',()=>({isProposalVisibleToViewer:m.visible}));
vi.mock('@/lib/db/proposal-invoices',()=>({getProposalInvoiceStatusByTenant:m.invoice}));
vi.mock('@/lib/integrations/digestor-fiscal',()=>({isDigestorFiscalEnabledForTenant:()=>true}));
import {authorizeProposalPayments} from './proposal-payments';
describe('production payment authorization',()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('DIGESTOR_FISCAL_PPD_ENABLED','true');vi.stubEnv('DIGESTOR_FISCAL_PPD_PRODUCTION_ENABLED','true');m.tenant.mockResolvedValue({id:'tenant',userId:'seller',userRole:'user',authMode:'clerk'});m.visible.mockResolvedValue(true);m.invoice.mockResolvedValue({status:'stamped',draftId:'resolved',uuid:'synthetic',xmlBase64:'synthetic'});});
 afterEach(()=>vi.unstubAllEnvs());
 it.each([null,'https://foreign.test'])('blocks missing or foreign origin %s',async origin=>{
  const request=new Request('https://cotiza.test/payments',{method:'POST',headers:origin?{origin}:{}});
  expect((await authorizeProposalPayments('p1',request)).error?.status).toBe(403);expect(m.invoice).not.toHaveBeenCalled();
 });
 it('blocks bootstrap identity',async()=>{
  m.tenant.mockResolvedValue({id:'tenant',userId:'bootstrap',authMode:'bootstrap'});
  expect((await authorizeProposalPayments('p1')).error?.status).toBe(401);expect(m.invoice).not.toHaveBeenCalled();
 });
 it('resolves source invoice on server for authorized session and origin',async()=>{
  expect(await authorizeProposalPayments('p1',new Request('https://cotiza.test/payments',{method:'POST',headers:{origin:'https://cotiza.test'}}))).toEqual({draftId:'resolved'});
  expect(m.invoice).toHaveBeenCalledWith('tenant','p1');
 });
});
