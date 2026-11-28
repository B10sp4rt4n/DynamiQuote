import "server-only";
import { randomUUID, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { RECURRING_CAPABILITY, RECURRING_TENANT_ID, RECURRING_TENANT_SLUG,
  RecurringError, assertSubscriptionPilot, assertActivatable, isBoundary, missingTerms, planPeriods,
  recurringActionSchema, reviewRecurringRenewal, todayInZone, type RecurringAction, type RecurringStatus,
  type RecurringTerms, type RecurringView, type RecurringWorkspace } from "@/lib/domain/recurring-services";

export type RecurringActor = { tenantId: string; actorId: string };
type Tx = Prisma.TransactionClient;
type Row = { agreement_id: string; agreement_number: string; revision: number; terms_revision: number;
  status: RecurringStatus; terms: RecurringTerms; generation_floor: Date | null; created_at: Date; updated_at: Date };
export function recurringConfigured(actorId?: string) {
  return process.env.COTIZA_RECURRING_ENABLED === "true" && !!actorId
    && (process.env.COTIZA_RECURRING_OPERATOR_IDS ?? "").split(",").map(x=>x.trim()).filter(Boolean).includes(actorId);
}
/** Permission rows stay locked for the transaction: concurrent revocation cannot be bypassed. */
async function scoped<T>(actor: RecurringActor, operation: (tx: Tx) => Promise<T>): Promise<T> {
  if (actor.tenantId !== RECURRING_TENANT_ID || !recurringConfigured(actor.actorId)) throw new RecurringError("Piloto no disponible",404);
  return prisma.$transaction(async tx => {
    const authorized=await tx.$queryRaw<{tenant_id:string}[]>`
      SELECT t.tenant_id FROM tenants t JOIN tenant_capabilities c ON c.tenant_id=t.tenant_id
      JOIN app_users u ON u.user_id=${actor.actorId}
      WHERE t.tenant_id=${actor.tenantId} AND t.slug=${RECURRING_TENANT_SLUG} AND t.active=true AND u.active=true
        AND c.capability_key=${RECURRING_CAPABILITY} AND c.enabled=true
        AND (lower(u.role) IN ('superadmin','super_admin','platform_admin','root')
          OR (lower(u.role) IN ('owner','admin') AND u.tenant_id=t.tenant_id))
      FOR SHARE OF t,c,u`;
    if(!authorized.length) throw new RecurringError("Piloto no disponible",404);
    await tx.$queryRaw`SELECT set_config('app.recurring_tenant_id',${actor.tenantId},true)`;
    return operation(tx);
  },{maxWait:5000,timeout:15000});
}
async function event(tx: Tx, actor: RecurringActor, id: string, type: string, payload: unknown) {
  await tx.$executeRaw`INSERT INTO recurring_events(event_id,tenant_id,agreement_id,event_type,actor_id,payload)
    VALUES(${randomUUID()}::uuid,${actor.tenantId},${id}::uuid,${type},${actor.actorId},${JSON.stringify(payload)}::jsonb)`;
}
async function checkClient(tx: Tx, tenantId: string, clientId: string | null) {
  if(!clientId) return;
  const clients=await tx.$queryRaw<{client_id:string}[]>`SELECT client_id FROM clients
    WHERE tenant_id=${tenantId} AND client_id=${clientId} AND active=true FOR SHARE`;
  if(!clients.length) throw new RecurringError("Selecciona un cliente activo de esta empresa",422);
}
function dateString(value: Date | string) { return typeof value==="string"?value.slice(0,10):value.toISOString().slice(0,10); }
type PeriodRow={agreement_id:string;coverage_start:Date;coverage_end:Date;prepare_on:Date;due_on:Date;terms_revision:number;state:string};
async function view(tx: Tx, tenantId: string, row: Row, supplied?:PeriodRow[]): Promise<RecurringView> {
  const periods=supplied??await tx.$queryRaw<PeriodRow[]>`
    SELECT coverage_start,coverage_end,prepare_on,due_on,terms_revision,state FROM recurring_periods
    WHERE tenant_id=${tenantId} AND agreement_id=${row.agreement_id}::uuid ORDER BY coverage_start DESC LIMIT 120`;
  return {id:row.agreement_id,number:row.agreement_number,revision:row.revision,status:row.status,
    renewalReview:reviewRecurringRenewal(row.terms,row.status),
    terms:row.terms,missing:missingTerms(row.terms),createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString(),
    periods:periods.reverse().map(p=>({start:dateString(p.coverage_start),end:dateString(p.coverage_end),prepareOn:dateString(p.prepare_on),dueOn:dateString(p.due_on),termsRevision:p.terms_revision,state:p.state}))};
}
export async function listRecurring(actor: RecurringActor, search="", before?: string): Promise<RecurringWorkspace> {
  return scoped(actor,async tx=>{
    // Cursor is the strictly monotone per-tenant folio number; no offset drift after new inserts.
    const rows=await tx.$queryRaw<Row[]>`SELECT * FROM recurring_agreements WHERE tenant_id=${actor.tenantId}
      AND (${before??null}::text IS NULL OR agreement_number<${before??null}::text)
      ORDER BY agreement_number DESC LIMIT 51`;
    const clients=await tx.$queryRaw<{id:string;name:string}[]>`SELECT client_id AS id,company AS name FROM clients
      WHERE tenant_id=${actor.tenantId} AND active=true AND position(lower(${search.slice(0,150)}) in lower(company))>0
      ORDER BY company,client_id LIMIT 51`;
    const page=rows.slice(0,50);
    const periods=await tx.$queryRaw<PeriodRow[]>`SELECT p.* FROM
      jsonb_array_elements_text(${JSON.stringify(page.map(row=>row.agreement_id))}::jsonb) AS ids(id)
      CROSS JOIN LATERAL (SELECT agreement_id,coverage_start,coverage_end,prepare_on,due_on,terms_revision,state
        FROM recurring_periods WHERE tenant_id=${actor.tenantId} AND agreement_id=ids.id::uuid
        ORDER BY coverage_start DESC LIMIT 120) p`;
    return {agreements:await Promise.all(page.map(row=>view(tx,actor.tenantId,row,periods.filter(p=>p.agreement_id===row.agreement_id)))),
      clients:clients.slice(0,50),hasMore:rows.length>50,clientsTruncated:clients.length>50};
  });
}
export async function getRecurring(actor: RecurringActor,id:string): Promise<RecurringView> {
  return scoped(actor,async tx=>{
    const rows=await tx.$queryRaw<Row[]>`SELECT * FROM recurring_agreements WHERE tenant_id=${actor.tenantId} AND agreement_id=${id}::uuid`;
    if(!rows[0]) throw new RecurringError("Acuerdo no encontrado",404);
    return view(tx,actor.tenantId,rows[0]);
  });
}
export async function findRecurringRequest(actor:RecurringActor,requestId:string):Promise<RecurringView|null> {
  return scoped(actor,async tx=>{
    const rows=await tx.$queryRaw<Row[]>`SELECT * FROM recurring_agreements WHERE tenant_id=${actor.tenantId} AND request_id=${requestId}::uuid`;
    return rows[0]?view(tx,actor.tenantId,rows[0]):null;
  });
}
async function version(tx: Tx,actor: RecurringActor,id:string,revision:number,terms:RecurringTerms) {
  await tx.$executeRaw`INSERT INTO recurring_agreement_versions(tenant_id,agreement_id,terms_revision,effective_from,snapshot,created_by)
    VALUES(${actor.tenantId},${id}::uuid,${revision},${terms.effectiveFrom}::date,${JSON.stringify(terms)}::jsonb,${actor.actorId})`;
}
function sameSchedule(a:RecurringTerms,b:RecurringTerms) {
  return (['clientId','contractKind','startsOn','endsOn','autoRenew','noticeDays','cadence','basis','anchorDay','timezone','currency'] as const)
    .every(key=>a[key]===b[key]);
}
export async function actOnRecurring(actor: RecurringActor, input: RecurringAction): Promise<RecurringView> {
  // The DB entrypoint also validates callers; routes alone are not a validation boundary.
  const action=recurringActionSchema.parse(input);
  return scoped(actor,async tx=>{
    if(action.action==='create') {
      assertSubscriptionPilot(action.terms);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`recurring-create:${actor.tenantId}:${action.requestId}`},0))::text`;
      const hash=createHash('sha256').update(JSON.stringify(action.terms)).digest('hex');
      const prior=await tx.$queryRaw<(Row&{request_hash:string})[]>`SELECT * FROM recurring_agreements WHERE tenant_id=${actor.tenantId} AND request_id=${action.requestId}::uuid`;
      if(prior[0]) {if(prior[0].request_hash!==hash) throw new RecurringError("La clave de alta ya corresponde a otro contenido");return view(tx,actor.tenantId,prior[0]);}
      await checkClient(tx,actor.tenantId,action.terms.clientId);
      const sequence=await tx.$queryRaw<{next_number:bigint}[]>`INSERT INTO recurring_counters(tenant_id,next_number)
        VALUES(${actor.tenantId},1) ON CONFLICT(tenant_id) DO UPDATE SET next_number=recurring_counters.next_number+1 RETURNING next_number`;
      const number=`SR-${String(sequence[0].next_number).padStart(10,'0')}`,id=randomUUID();
      const rows=await tx.$queryRaw<Row[]>`INSERT INTO recurring_agreements(tenant_id,agreement_id,request_id,request_hash,agreement_number,client_id,status,terms,created_by)
        VALUES(${actor.tenantId},${id}::uuid,${action.requestId}::uuid,${hash},${number},${action.terms.clientId},'draft',${JSON.stringify(action.terms)}::jsonb,${actor.actorId}) RETURNING *`;
      await version(tx,actor,id,1,action.terms);await event(tx,actor,id,'agreement.created',{revision:1});
      return view(tx,actor.tenantId,rows[0]);
    }
    const found=await tx.$queryRaw<Row[]>`SELECT * FROM recurring_agreements WHERE tenant_id=${actor.tenantId} AND agreement_id=${action.id}::uuid FOR UPDATE`;
    const row=found[0];if(!row) throw new RecurringError("Acuerdo no encontrado",404);
    if(row.revision!==action.expectedRevision) throw new RecurringError("El acuerdo cambió. Recarga antes de continuar");
    if(row.status==='ended') throw new RecurringError("El acuerdo terminó; su historial permanece cerrado");
    const oldRevision=row.revision;
    if(action.action==='revise') {
      assertSubscriptionPilot(action.terms);
      await checkClient(tx,actor.tenantId,action.terms.clientId);
      if(row.status!=='draft') {
        if(!sameSchedule(row.terms,action.terms)) throw new RecurringError("Un acuerdo activo conserva cliente, moneda y calendario; requiere revisión contractual separada");
        const t=action.terms;
        // Validate completeness using initial effective date, then require a distinct future boundary.
        assertActivatable({...t,effectiveFrom:t.startsOn});
        if(!t.effectiveFrom || !isBoundary(t,t.effectiveFrom) || t.effectiveFrom<=row.terms.effectiveFrom! || t.effectiveFrom<=todayInZone(t.timezone) || (t.endsOn!==null && t.effectiveFrom>=t.endsOn)) throw new RecurringError("Selecciona una fecha efectiva futura en un límite de periodo",422);
        const latest=await tx.$queryRaw<{end:Date|null}[]>`SELECT max(coverage_end) AS end FROM recurring_periods WHERE tenant_id=${actor.tenantId} AND agreement_id=${row.agreement_id}::uuid`;
        if(latest[0]?.end && t.effectiveFrom<dateString(latest[0].end)) throw new RecurringError("La revisión no puede alterar periodos ya registrados");
      }
      row.terms=action.terms;row.terms_revision++;
      await version(tx,actor,row.agreement_id,row.terms_revision,row.terms);
    } else if(action.action==='generate') {
      if(row.status!=='active') throw new RecurringError("Activa el acuerdo para registrar periodos");
      assertSubscriptionPilot(row.terms);
      if(row.generation_floor && action.from<dateString(row.generation_floor)) throw new RecurringError("Los periodos anteriores a la reanudación requieren revisión manual");
      const periods=planPeriods(row.terms,action.from,action.count);
      let added=0;
      for(const period of periods) {
        const versions=await tx.$queryRaw<{terms_revision:number;snapshot:RecurringTerms}[]>`SELECT terms_revision,snapshot FROM recurring_agreement_versions
          WHERE tenant_id=${actor.tenantId} AND agreement_id=${row.agreement_id}::uuid AND effective_from<=${period.start}::date
          ORDER BY terms_revision DESC LIMIT 1`;
        if(!versions[0]) throw new RecurringError("No hay condiciones vigentes para ese periodo");
        const source=versions[0];
        const planned=planPeriods(source.snapshot,period.start,1)[0];
        const inserted=await tx.$executeRaw`INSERT INTO recurring_periods(tenant_id,agreement_id,coverage_start,coverage_end,prepare_on,due_on,terms_revision,created_by)
          VALUES(${actor.tenantId},${row.agreement_id}::uuid,${planned.start}::date,${planned.end}::date,${planned.prepareOn}::date,${planned.dueOn}::date,${source.terms_revision},${actor.actorId}) ON CONFLICT DO NOTHING`;
        added+=inserted;
      }
      if(added) await event(tx,actor,row.agreement_id,'periods.planned',{from:action.from,count:periods.length,added});
      // Idempotent generation does not change commercial revision or imply a fiscal preparation.
      return view(tx,actor.tenantId,row);
    } else {
      if(action.action==='activate') {if(row.status!=='draft') throw new RecurringError("Sólo se activa un borrador");assertSubscriptionPilot(row.terms);assertActivatable(row.terms);await checkClient(tx,actor.tenantId,row.terms.clientId);row.status='active';}
      if(action.action==='pause') {if(row.status!=='active') throw new RecurringError("Sólo se pausa un acuerdo activo");row.status='paused';}
      if(action.action==='resume') {
        assertSubscriptionPilot(row.terms);
        if(row.status!=='paused' || action.resumeOn<todayInZone(row.terms.timezone) || !isBoundary(row.terms,action.resumeOn) || (row.terms.endsOn && action.resumeOn>=row.terms.endsOn)) throw new RecurringError("Reanuda un acuerdo pausado desde un límite actual o futuro de periodo");
        if(row.generation_floor && action.resumeOn<dateString(row.generation_floor)) throw new RecurringError("La reanudación no puede retroceder");
        row.status='active';row.generation_floor=new Date(`${action.resumeOn}T00:00:00Z`);
      }
      if(action.action==='end') row.status='ended';
    }
    row.revision++;
    const saved=await tx.$queryRaw<Row[]>`UPDATE recurring_agreements SET revision=${row.revision},terms_revision=${row.terms_revision},
      status=${row.status},terms=${JSON.stringify(row.terms)}::jsonb,client_id=${row.terms.clientId},generation_floor=${row.generation_floor},updated_at=now()
      WHERE tenant_id=${actor.tenantId} AND agreement_id=${row.agreement_id}::uuid AND revision=${oldRevision} RETURNING *`;
    if(!saved[0]) throw new RecurringError("El acuerdo cambió. Recarga");
    await event(tx,actor,row.agreement_id,`agreement.${action.action}`,{revision:row.revision,termsRevision:row.terms_revision,...('evidence' in action?{evidence:action.evidence}:{})});
    return view(tx,actor.tenantId,saved[0]);
  });
}
