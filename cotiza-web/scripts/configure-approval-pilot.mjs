import { Pool } from "pg";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

/** Sin --apply sólo consulta. No modifica identidades, roles ni membresías. */
export async function configureApprovalPilot(pool, actorId, apply = false) {
  if (!/^user_[A-Za-z0-9]+$/.test(actorId ?? "")) throw Error("Indica COTIZA_APPROVAL_SETUP_ACTOR con un userId Clerk ya vinculado");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tenant = (await client.query("SELECT tenant_id, name, slug, active FROM tenants WHERE slug = $1 FOR SHARE", ["sys"])).rows[0];
    if (!tenant?.active || tenant.name !== "SynAppsSys") throw Error("No se encontró el tenant activo exacto de SynAppsSys");
    const actor = (await client.query("SELECT role FROM app_users WHERE user_id = $1 AND tenant_id = $2 AND active = true FOR SHARE", [actorId, tenant.tenant_id])).rows[0];
    if (!actor || !["superadmin", "super_admin", "platform_admin", "root"].includes(actor.role)) throw Error("Se requiere un superadmin activo y vinculado por ID a SynAppsSys");
    const tables = (await client.query("SELECT count(*)::int AS total FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)", [["approval_credentials", "approval_requests", "approval_enrollment_grants", "approval_challenges", "approval_events", "approval_rate_buckets"]])).rows[0].total;
    if (apply) {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`verified-approval:${tenant.tenant_id}`]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${tenant.tenant_id}:verified_authorization_pilot`]);
    }
    const previous = (await client.query("SELECT enabled FROM tenant_capabilities WHERE tenant_id = $1 AND capability_key = $2", [tenant.tenant_id, "verified_authorization_pilot"])).rows[0];
    if (apply) {
      if (tables !== 6) throw Error("Aplica primero el esquema revisado del piloto");
      if (!previous?.enabled) {
        await client.query("INSERT INTO tenant_capabilities (tenant_id, capability_key, enabled, updated_at, updated_by) VALUES ($1,$2,true,NOW(),$3) ON CONFLICT (tenant_id,capability_key) DO UPDATE SET enabled=true,updated_at=NOW(),updated_by=EXCLUDED.updated_by", [tenant.tenant_id, "verified_authorization_pilot", actorId]);
        await client.query("INSERT INTO tenant_capability_events (event_id,tenant_id,capability_key,previous_enabled,enabled,changed_by) VALUES ($1,$2,$3,$4,true,$5)", [randomUUID(), tenant.tenant_id, "verified_authorization_pilot", previous?.enabled ?? null, actorId]);
      }
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return { mode: apply ? "applied" : "dry_run", tenant: { id: tenant.tenant_id, name: tenant.name, slug: tenant.slug }, schemaReady: tables === 6,
      capabilityEnabled: apply || previous?.enabled === true, next: "Configurar origen HTTPS estable, issuer y habilitación temporal de la primera credencial. No se registró ningún dispositivo." };
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { console.log(JSON.stringify(await configureApprovalPilot(pool, process.env.COTIZA_APPROVAL_SETUP_ACTOR, process.argv.includes("--apply")), null, 2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
  finally { await pool.end(); }
}
