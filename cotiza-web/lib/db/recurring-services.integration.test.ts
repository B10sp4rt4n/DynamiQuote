/** Actual HTTP handlers and repository on disposable PostgreSQL WASM; no operational DB. */
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({transaction:vi.fn(),auth:vi.fn(),context:vi.fn(),capability:vi.fn()}));
vi.mock('@/lib/db/prisma',()=>({prisma:{$transaction:m.transaction}}));
vi.mock('@clerk/nextjs/server',()=>({auth:m.auth}));
vi.mock('@/lib/auth/tenant-context',()=>({getCurrentTenantContext:m.context}));
vi.mock('@/lib/db/tenant-capabilities',()=>({isTenantCapabilityEnabled:m.capability}));
import {actOnRecurring,getRecurring,listRecurring} from './recurring-services';
import {GET,POST} from '@/app/api/recurring-services/route';
import {RECURRING_TENANT_ID as tenantId,type RecurringTerms,type RecurringView} from '@/lib/domain/recurring-services';
// PGlite does not simulate multiple PostgreSQL backends. Concurrency locks need staging verification.
type Database={exec:(sql:string)=>Promise<unknown>;query:(sql:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[];affectedRows?:number}>;transaction:<T>(cb:(tx:Database)=>Promise<T>)=>Promise<T>;close:()=>Promise<void>};
const suite=process.env.PGLITE_MODULE?describe:describe.skip;
const terms=():RecurringTerms=>({title:'Servicio sintético',clientId:'synthetic-client',contractKind:'fixed_term',startsOn:'2030-01-31',endsOn:'2031-01-31',autoRenew:false,noticeDays:30,cadence:'monthly',basis:'advance',anchorDay:31,timezone:'America/Mexico_City',dueDays:10,currency:'MXN',effectiveFrom:'2030-01-31',acceptanceEvidence:'Contrato sintético',lines:[{lineId:'line-1',description:'Prueba',sku:null,quantity:'2',unitPrice:'125.2500'}]});
suite('Recurring pilot PostgreSQL and HTTP',()=>{
 let db:Database;let failAudit=false;
 const actor={tenantId,actorId:'synthetic-operator'};
 const query=(database:Database)=>(strings:TemplateStringsArray,...values:unknown[])=>database.query(strings.reduce((sql,text,index)=>sql+(index?`$${index}`:'')+text,''),values.map(v=>v instanceof Date?v.toISOString():v));
 beforeAll(async()=>{
  const {PGlite}=await import(/* @vite-ignore */ process.env.PGLITE_MODULE!);db=new PGlite() as Database;
  await db.exec(`CREATE TABLE tenants(tenant_id text PRIMARY KEY,slug text,active boolean DEFAULT true);
   CREATE TABLE app_users(user_id text PRIMARY KEY,tenant_id text,role text,active boolean DEFAULT true);
   CREATE TABLE clients(client_id text PRIMARY KEY,tenant_id text,company text,active boolean DEFAULT true);
   CREATE TABLE tenant_capabilities(tenant_id text,capability_key text,enabled boolean,updated_by text,PRIMARY KEY(tenant_id,capability_key));
   CREATE TABLE tenant_capability_events(event_id text,tenant_id text,capability_key text,previous_enabled boolean,enabled boolean,changed_by text);
   INSERT INTO tenants VALUES('${tenantId}','sys',true),('other','other',true);
   INSERT INTO app_users VALUES('synthetic-operator','${tenantId}','admin',true);
   INSERT INTO clients VALUES('synthetic-client','${tenantId}','Cliente sintético',true),('foreign','other','Otro cliente',true);`);
  const migration=await readFile(new URL('../../prisma/manual/20261116_recurring_services_r1.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  expect((await db.query('SELECT * FROM tenant_capability_events')).rows).toHaveLength(1);
  expect((await db.query('SELECT enabled FROM tenant_capabilities')).rows[0].enabled).toBe(false);
 });
 beforeEach(async()=>{
  vi.stubEnv('COTIZA_RECURRING_ENABLED','true');vi.stubEnv('COTIZA_RECURRING_OPERATOR_IDS',actor.actorId);vi.stubEnv('COTIZA_RECURRING_APP_ORIGIN','https://pilot.example.test');vi.stubEnv('VERCEL_ENV','test');
  m.auth.mockResolvedValue({userId:actor.actorId});m.context.mockResolvedValue({id:tenantId,slug:'sys',authMode:'clerk',userId:actor.actorId});m.capability.mockResolvedValue(true);failAudit=false;
  await db.exec(`RESET ROLE;UPDATE tenant_capabilities SET enabled=true;UPDATE app_users SET active=true,role='admin',tenant_id='${tenantId}';UPDATE clients SET active=true;`);
  m.transaction.mockImplementation(callback=>db.transaction(tx=>callback({
   $queryRaw:async(strings:TemplateStringsArray,...values:unknown[])=>(await query(tx)(strings,...values)).rows,
   $executeRaw:async(strings:TemplateStringsArray,...values:unknown[])=>{if(failAudit&&strings.join('').includes('INSERT INTO recurring_events'))throw Error('Synthetic audit failure');return (await query(tx)(strings,...values)).affectedRows??0;},
  })));
 });
 afterEach(()=>vi.unstubAllEnvs());afterAll(async()=>db?.close());
 const create=(t=terms(),requestId=randomUUID())=>actOnRecurring(actor,{action:'create',requestId,terms:t});
 const state=(v:RecurringView,action:'activate'|'pause'|'end')=>actOnRecurring(actor,{action,id:v.id,expectedRevision:v.revision,evidence:'Evidencia sintética'});
 const generate=(v:RecurringView,from='2030-01-31',count=3)=>actOnRecurring(actor,{action:'generate',id:v.id,expectedRevision:v.revision,from,count});
 const request=(body:unknown,headers:Record<string,string>={})=>new Request('https://pilot.example.test/api/recurring-services',{method:'POST',headers:{origin:'https://pilot.example.test','x-tenant-context':tenantId,'content-type':'application/json',...headers},body:JSON.stringify(body)});
 it('creates once on retry and rejects changed payload for the same key',async()=>{const key=randomUUID(),a=await create(terms(),key);expect((await create(terms(),key)).id).toBe(a.id);await expect(create({...terms(),title:'Contenido distinto'},key)).rejects.toMatchObject({status:409});expect(a.number).toMatch(/^SR-\d{10}$/);});
 it('keeps incomplete drafts and refuses activation or a foreign client',async()=>{const a=await create({...terms(),clientId:null,lines:[]});await expect(state(a,'activate')).rejects.toMatchObject({status:422});await expect(create({...terms(),clientId:'foreign'})).rejects.toMatchObject({status:422});});
 it('plans canonical periods exactly once and preserves revision on retry',async()=>{const a=await state(await create(),'activate'),b=await generate(a);expect(b.periods.map(p=>p.end)).toEqual(['2030-02-28','2030-03-31','2030-04-30']);expect((await generate(a)).periods).toEqual(b.periods);expect(b.revision).toBe(a.revision);expect((await listRecurring(actor)).agreements.find(v=>v.id===a.id)?.periods).toEqual(b.periods);});
 it('enforces optimistic revisions and explicit pause/resume floor',async()=>{const a=await state(await create(),'activate');await expect(state({...a,revision:1},'pause')).rejects.toMatchObject({status:409});const p=await state(a,'pause');await expect(generate(p)).rejects.toMatchObject({status:409});const resumed=await actOnRecurring(actor,{action:'resume',id:p.id,expectedRevision:p.revision,resumeOn:'2030-03-31',evidence:'Reanudación acordada'});await expect(generate(resumed)).rejects.toMatchObject({status:409});expect((await generate(resumed,'2030-03-31',1)).periods).toHaveLength(1);});
 it('appends future terms without rewriting existing periods',async()=>{let a=await state(await create(),'activate');a=await generate(a,'2030-01-31',1);const changed={...a.terms,effectiveFrom:'2030-03-31',dueDays:20,lines:[{...a.terms.lines[0],unitPrice:'200'}]};a=await actOnRecurring(actor,{action:'revise',id:a.id,expectedRevision:a.revision,terms:changed});const b=await generate(a,'2030-02-28',2);expect(b.periods.map(p=>p.termsRevision)).toEqual([1,1,2]);expect(b.periods[2].dueOn).toBe('2030-04-20');expect(b.periods[0].dueOn).toBe('2030-02-10');});
 it('rejects schedule changes and revisions into already planned coverage',async()=>{let a=await state(await create(),'activate');a=await generate(a);await expect(actOnRecurring(actor,{action:'revise',id:a.id,expectedRevision:a.revision,terms:{...a.terms,anchorDay:15,effectiveFrom:'2030-05-31'}})).rejects.toMatchObject({status:409});await expect(actOnRecurring(actor,{action:'revise',id:a.id,expectedRevision:a.revision,terms:{...a.terms,effectiveFrom:'2030-02-28'}})).rejects.toMatchObject({status:409});});
 it('rejects a terms revision beyond the contract end',async()=>{const a=await state(await create(),'activate');await expect(actOnRecurring(actor,{action:'revise',id:a.id,expectedRevision:a.revision,terms:{...a.terms,effectiveFrom:a.terms.endsOn}})).rejects.toMatchObject({status:422});});
 it('rolls back revisions and versions if the event cannot be appended',async()=>{const a=await create();failAudit=true;await expect(actOnRecurring(actor,{action:'revise',id:a.id,expectedRevision:a.revision,terms:{...a.terms,title:'No debe guardarse'}})).rejects.toThrow();failAudit=false;expect((await getRecurring(actor,a.id)).terms.title).toBe(a.terms.title);expect((await db.query('SELECT * FROM recurring_agreement_versions WHERE agreement_id=$1',[a.id])).rows).toHaveLength(1);});
 it('closes the agreement and prevents further changes',async()=>{const a=await state(await create(),'end');await expect(state(a,'activate')).rejects.toMatchObject({status:409});await expect(generate(a)).rejects.toMatchObject({status:409});expect((await getRecurring(actor,a.id)).status).toBe('ended');});
 it.each(['disabled','revoked','inactive','role','foreign-tenant','not-allowlisted'])('revalidates access: %s',async reason=>{if(reason==='disabled')vi.stubEnv('COTIZA_RECURRING_ENABLED','false');if(reason==='revoked')await db.exec('UPDATE tenant_capabilities SET enabled=false');if(reason==='inactive')await db.exec('UPDATE app_users SET active=false');if(reason==='role')await db.exec("UPDATE app_users SET role='seller'");if(reason==='not-allowlisted')vi.stubEnv('COTIZA_RECURRING_OPERATOR_IDS','someone-else');await expect(listRecurring({...actor,tenantId:reason==='foreign-tenant'?'other':tenantId})).rejects.toMatchObject({status:404});});
 it('rejects mutations at the HTTP authentication, tenant and origin boundaries',async()=>{const body={action:'create',requestId:randomUUID(),terms:terms()};expect((await POST(request(body,{origin:'https://evil.example.test'}))).status).toBe(403);expect((await POST(request(body,{'x-tenant-context':'other'}))).status).toBe(409);m.context.mockResolvedValue({id:tenantId,slug:'sys',authMode:'bootstrap',userId:actor.actorId});expect((await POST(request(body))).status).toBe(404);m.auth.mockResolvedValue({userId:null});expect((await POST(request(body))).status).toBe(401);});
 it('passes real HTTP validation, persistence and request recovery',async()=>{const key=randomUUID();const response=await POST(request({action:'create',requestId:key,terms:terms()}));expect(response.status).toBe(200);const {agreement}=await response.json();const recovered=await GET(new Request(`https://pilot.example.test/api/recurring-services?requestId=${key}`,{headers:{'x-tenant-context':tenantId}}));expect((await recovered.json()).agreement.id).toBe(agreement.id);expect((await POST(request({action:'create',requestId:key,terms:{...terms(),unexpected:1}}))).status).toBe(422);});
 it('enforces SQL overlap, append-only history and client tenant foreign key',async()=>{const a=await generate(await state(await create(),'activate'),'2030-01-31',1);await expect(db.query('UPDATE recurring_agreement_versions SET snapshot=snapshot WHERE agreement_id=$1',[a.id])).rejects.toThrow('append-only');await expect(db.exec('TRUNCATE recurring_events')).rejects.toThrow('append-only');await expect(db.query('UPDATE recurring_agreements SET client_id=$1 WHERE agreement_id=$2',['foreign',a.id])).rejects.toThrow();await expect(db.query(`INSERT INTO recurring_periods(tenant_id,agreement_id,coverage_start,coverage_end,prepare_on,due_on,terms_revision,created_by) VALUES($1,$2,'2030-02-01','2030-03-01','2030-02-01','2030-02-01',1,'test')`,[tenantId,a.id])).rejects.toThrow('overlap');});
 it('hides all recurring rows without the explicit tenant SQL scope for a non-superuser',async()=>{await create();await db.exec('CREATE ROLE recurring_test_reader;GRANT SELECT ON recurring_agreements TO recurring_test_reader;SET ROLE recurring_test_reader;');try{expect((await db.query('SELECT * FROM recurring_agreements')).rows).toHaveLength(0);await db.query("SELECT set_config('app.recurring_tenant_id',$1,false)",[tenantId]);expect((await db.query('SELECT * FROM recurring_agreements')).rows.length).toBeGreaterThan(0);await db.query("SELECT set_config('app.recurring_tenant_id','other',false)");expect((await db.query('SELECT * FROM recurring_agreements')).rows).toHaveLength(0);}finally{await db.exec("RESET ROLE;SELECT set_config('app.recurring_tenant_id','',false)");}});
});
