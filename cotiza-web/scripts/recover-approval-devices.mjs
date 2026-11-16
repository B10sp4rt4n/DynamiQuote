import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { digest } from "./verify-approval-evidence.mjs";

/** Recuperación fuera de banda. La cuenta de BD del operador es la autoridad; no simula una firma del usuario. */
export async function recoverApprovalDevices(pool, { actorId, userId, caseRef, reason, apply = false }) {
  if (![actorId, userId].every(id => /^user_[A-Za-z0-9]+$/.test(id ?? "")) || !caseRef || (reason ?? "").trim().length < 10) throw Error("Se requieren actor, usuario exacto, folio de recuperación y motivo");
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    const tenant = (await tx.query("SELECT tenant_id,name FROM tenants WHERE slug='sys' AND active=true FOR SHARE")).rows[0];
    if (tenant?.name !== "SynAppsSys") throw Error("Tenant no disponible");
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`verified-approval:${tenant.tenant_id}`]);
    const operator = (await tx.query("SELECT role FROM app_users WHERE user_id=$1 AND tenant_id=$2 AND active=true FOR SHARE", [actorId, tenant.tenant_id])).rows[0];
    if (!operator || !["superadmin","super_admin","platform_admin","root"].includes(operator.role)) throw Error("Operador no autorizado");
    const target = (await tx.query("SELECT user_id FROM app_users WHERE user_id=$1 AND tenant_id=$2 AND active=true FOR SHARE", [userId, tenant.tenant_id])).rows[0];
    if (!target) throw Error("Usuario destinatario no disponible");
    const credentials = (await tx.query("SELECT id FROM approval_credentials WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL", [tenant.tenant_id, userId])).rows;
    const requests = (await tx.query("SELECT id,payload_hash FROM approval_requests WHERE tenant_id=$1 AND approver_id=$2 AND state IN ('pending','approved')", [tenant.tenant_id, userId])).rows;
    async function append(subject, type, data) {
      const previous = (await tx.query("SELECT id,sequence,event_hash FROM approval_events WHERE tenant_id=$1 AND case_id=$2 ORDER BY sequence DESC LIMIT 1", [tenant.tenant_id, subject])).rows[0];
      const id = randomUUID(), now = new Date().toISOString(), sequence = (previous?.sequence ?? 0) + 1, previous_hash = previous?.event_hash ?? "0".repeat(64);
      const record = { recordia_version: "1.0", event_id: id, case_id: subject, event_type: type, occurred_at: now, occurred_at_utc: now, recorded_at_utc: now,
        actors: [{ actor_id: actorId, role: "database_recovery_operator", identity_status: "declared" }], subject: { entity_id: subject, entity_type: "cotiza_authorization_pilot" },
        action_or_state: type, epistemic_class: "decision", support_status: "supported", source_refs: [caseRef], evidence_refs: [],
        relations: previous ? [{ predicate: "derived_from", target_id: previous.id }] : [], policy_or_rule_refs: ["synappssys-pilot-v1"], data: { ...data, reason, case_ref: caseRef, authorization_method: "out_of_band_database_operator", signature_status: "not_verified" } };
      await tx.query("INSERT INTO approval_events (id,tenant_id,case_id,sequence,previous_hash,event_hash,record) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, tenant.tenant_id, subject, sequence, previous_hash, digest({ sequence, previous_hash, record }), record]);
    }
    if (apply) {
      await tx.query("UPDATE approval_credentials SET revoked_at=NOW() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL", [tenant.tenant_id, userId]);
      await tx.query("UPDATE approval_enrollment_grants SET revoked_at=NOW() WHERE tenant_id=$1 AND user_id=$2 AND consumed_at IS NULL AND revoked_at IS NULL", [tenant.tenant_id, userId]);
      for (const request of requests) {
        await tx.query("UPDATE approval_requests SET state='invalidated' WHERE id=$1 AND tenant_id=$2", [request.id, tenant.tenant_id]);
        await append(`request:${request.id}`, "request.invalidated", { payload_hash: request.payload_hash, recovery_user_id: userId });
      }
      for (const credential of credentials) await append(`credential:${credential.id}`, "credential.revoked_by_recovery", { credential_record_id: credential.id });
      await append(`recovery:${caseRef}`, "recovery.completed", { target_user_id: userId, revoked_credentials: credentials.length });
    }
    await tx.query(apply ? "COMMIT" : "ROLLBACK");
    return { mode: apply ? "applied" : "dry_run", credentialsToRevoke: credentials.length, requestsToInvalidate: requests.length,
      next: "Emitir una habilitación de bootstrap nueva, temporal y revisada. No se registró ni aprobó un dispositivo nuevo." };
  } catch (e) { await tx.query("ROLLBACK"); throw e; } finally { tx.release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { console.log(JSON.stringify(await recoverApprovalDevices(pool, { actorId: process.env.COTIZA_APPROVAL_SETUP_ACTOR, userId: process.env.COTIZA_APPROVAL_RECOVERY_USER,
    caseRef: process.env.COTIZA_APPROVAL_RECOVERY_CASE, reason: process.env.COTIZA_APPROVAL_RECOVERY_REASON, apply: process.argv.includes("--apply") }), null, 2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; } finally { await pool.end(); }
}
