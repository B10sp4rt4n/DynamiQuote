import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({tenant:vi.fn(),visible:vi.fn(),invoice:vi.fn()}));
vi.mock('@/lib/auth/tenant-context',()=>({getCurrentTenantContext:m.tenant}));
vi.mock('@/lib/db/proposals',()=>({isProposalVisibleToViewer:m.visible}));
vi.mock('@/lib/db/proposal-invoices',()=>({getProposalInvoiceStatusByTenant:m.invoice}));
vi.mock('@/lib/integrations/digestor-fiscal',()=>({isDigestorFiscalEnabledForTenant:()=>true}));
import {authorizeProposalPayments,authorizeProposalFiscalDocument,paymentFailure} from './proposal-payments';
import {DigestorHttpError} from './digestor-error';

describe('fiscal error response',()=>{
 it('preserves a received conflict and its instruction to avoid reissuing',async()=>{
  const message='El complemento ya fue procesado; consulta el estado antes de reintentar';
  const response=paymentFailure(new DigestorHttpError(message,409));
  expect(response.status).toBe(409);expect(await response.json()).toEqual({error:message});
 });
 it.each([new Error('synthetic timeout'),new DigestorHttpError('unavailable',503),new DigestorHttpError('unauthorized upstream',401),{status:409},null])('keeps communication or unclassified failures as gateway errors: %s',async error=>{
  const response=paymentFailure(error);expect(response.status).toBe(502);
  if(!(error instanceof Error))expect(await response.json()).toEqual({error:'No se pudo confirmar la operación; consulta el estado antes de reintentar'});
 });
});
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
  expect(await authorizeProposalPayments('p1',new Request('https://cotiza.test/payments',{method:'POST',headers:{origin:'https://cotiza.test'}}))).toEqual({draftId:'resolved',environment:'production'});
  expect(m.invoice).toHaveBeenCalledWith('tenant','p1');
 });
 it('identifies the lab only from the authenticated tenant and server configuration',async()=>{
  vi.stubEnv('DIGESTOR_FISCAL_SANDBOX_TENANT_ID','tenant');
  const request=new Request('https://cotiza.test/payments',{method:'POST',headers:{origin:'https://cotiza.test'}});
  expect(await authorizeProposalPayments('p1',request)).toEqual({draftId:'resolved',environment:'sandbox'});
  m.tenant.mockResolvedValue({id:'other-tenant',userId:'seller',userRole:'user',authMode:'clerk'});
  expect(await authorizeProposalPayments('p1',request)).toEqual({draftId:'resolved',environment:'production'});
 });
});

describe('production fiscal administration',()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED','true');vi.stubEnv('DIGESTOR_FISCAL_CANCELLATION_ENABLED','true');m.tenant.mockResolvedValue({id:'tenant',userId:'admin',userRole:'admin',authMode:'clerk'});m.visible.mockResolvedValue(true);m.invoice.mockResolvedValue({status:'stamped',draftId:'resolved',uuid:'synthetic',xmlBase64:'synthetic'});});
 afterEach(()=>vi.unstubAllEnvs());
 it('permits same-origin reads without Origin header',async()=>{
  expect(await authorizeProposalFiscalDocument('p','cancellation',new Request('https://cotiza.test/cancellation'))).toEqual({draftId:'resolved',environment:'production'});
 });
 it('blocks nonadministrative identity even with visibility',async()=>{
  m.tenant.mockResolvedValue({id:'tenant',userId:'seller',userRole:'user',authMode:'clerk'});
  expect((await authorizeProposalFiscalDocument('p','cancellation')).error?.status).toBe(403);expect(m.invoice).not.toHaveBeenCalled();
 });
 it('blocks a foreign origin before resolving invoice',async()=>{
  expect((await authorizeProposalFiscalDocument('p','cancellation',new Request('https://cotiza.test/cancellation',{method:'POST',headers:{origin:'https://foreign.test'}}))).error?.status).toBe(403);expect(m.invoice).not.toHaveBeenCalled();
 });
});
