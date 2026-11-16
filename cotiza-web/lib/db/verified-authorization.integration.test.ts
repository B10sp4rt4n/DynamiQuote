import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { Pool } from "pg";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { ApprovalActor } from "@/lib/auth/verified-authorization";
vi.mock("server-only", () => ({}));
const bin = process.env.COTIZA_APPROVAL_TEST_PG_BIN;
const suite = bin ? describe : describe.skip;
const origin = "https://cotiza.example.test", rp = "cotiza.example.test", issuer = "https://clerk.example.test";
const hash = (v: string | Buffer) => createHash("sha256").update(v).digest();
function authenticator(multi = false) {
  const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), id = randomBytes(32), jwk = key.publicKey.export({ format: "jwk" });
  const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x!, "base64url"))], [-3, new Uint8Array(Buffer.from(jwk.y!, "base64url"))]]));
  let counter = 0;
  function client(type: string, challenge: string, o = origin) { return Buffer.from(JSON.stringify({ type, challenge, origin: o, crossOrigin: false })); }
  return {
    id: id.toString("base64url"),
    register(challenge: string): RegistrationResponseJSON {
      const len = Buffer.alloc(2); len.writeUInt16BE(id.length);
      const authData = Buffer.concat([hash(rp), Buffer.from([0x45 | (multi ? 8 : 0)]), Buffer.alloc(4), Buffer.alloc(16), len, id, Buffer.from(cose)]);
      const att = isoCBOR.encode(new Map<string, string | Map<never, never> | Uint8Array>([["fmt", "none"], ["attStmt", new Map<never, never>()], ["authData", new Uint8Array(authData)]]));
      return { id: id.toString("base64url"), rawId: id.toString("base64url"), type: "public-key", response: { clientDataJSON: client("webauthn.create", challenge).toString("base64url"), attestationObject: Buffer.from(att).toString("base64url") }, clientExtensionResults: {} };
    },
    assert(challenge: string, options: { origin?: string; uv?: boolean; wrongKey?: boolean } = {}): AuthenticationResponseJSON {
      const count = Buffer.alloc(4); count.writeUInt32BE(++counter);
      const authData = Buffer.concat([hash(rp), Buffer.from([(options.uv === false ? 1 : 5) | (multi ? 8 : 0)]), count]);
      const data = client("webauthn.get", challenge, options.origin);
      const signature = sign("sha256", Buffer.concat([authData, hash(data)]), options.wrongKey ? generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey : key.privateKey);
      return { id: id.toString("base64url"), rawId: id.toString("base64url"), type: "public-key", response: { clientDataJSON: data.toString("base64url"), authenticatorData: authData.toString("base64url"), signature: signature.toString("base64url") }, clientExtensionResults: {} };
    },
  };
}

suite.sequential("SynAppsSys pilot: actual PostgreSQL and signed WebAuthn ceremonies", () => {
  let pg: ChildProcess, dir: string, pool: Pool, db: typeof import("./prisma").prisma, api: typeof import("./verified-authorization");
  const owner: ApprovalActor = { userId: "user_owner", tenantId: "syn-test", tenantName: "SynAppsSys", issuer, role: "owner", claims: { fva: [0, -1], reverification_id: "rv-test" } };
  const seller: ApprovalActor = { ...owner, userId: "user_seller", role: "user" };
  const intruder: ApprovalActor = { ...owner, userId: "user_other", tenantId: "other", role: "superadmin" };
  const key = authenticator();
  let ownerCredentialId: string;
  const purchase = { kind: "purchase" as const, approverUserId: owner.userId, purchase: { folio: "SYNTHETIC-001", vendor: "Proveedor sintético", description: "Sin operación financiera", amount: "1250.00", currency: "MXN" as const } };
  const secret = (url: string) => new URL(url).hash.slice(1);
  beforeAll(async () => {
    // No acepta una URL remota ni toca bases existentes: crea su propio cluster temporal.
    dir = mkdtempSync(join(tmpdir(), "cotiza-approval-test-"));
    execFileSync(join(bin!, "initdb"), ["-D", dir, "-A", "trust", "-U", "approval_test"], { stdio: "pipe" });
    pg = spawn(join(bin!, "postgres"), ["-D", dir, "-p", "55439", "-h", "127.0.0.1", "-c", "unix_socket_directories="], { stdio: "pipe" });
    let logs = ""; pg.stderr?.on("data", b => { logs += String(b); });
    const admin = new Pool({ connectionString: "postgresql://approval_test@127.0.0.1:55439/postgres", connectionTimeoutMillis: 500 });
    let ready = false;
_bbox: for (let i = 0; i < 80; i++) { try { await admin.query("SELECT 1"); ready = true; break _bbox; } catch { await new Promise(r => setTimeout(r, 100)); } }
    if (!ready) throw Error(`Synthetic PostgreSQL could not start: ${logs}`);
    await admin.query("CREATE DATABASE cotiza_approval_synthetic"); await admin.end();
    const url = "postgresql://approval_test@127.0.0.1:55439/cotiza_approval_synthetic";
    vi.stubEnv("DATABASE_URL", url); vi.stubEnv("COTIZA_APPROVAL_ENABLED", "true"); vi.stubEnv("COTIZA_APPROVAL_TENANT_ID", owner.tenantId);
    vi.stubEnv("COTIZA_APPROVAL_ISSUER", issuer); vi.stubEnv("COTIZA_APPROVAL_ORIGIN", origin); vi.stubEnv("COTIZA_APPROVAL_SINGLE_DEVICE", "true");
    vi.stubEnv("COTIZA_APPROVAL_APPROVER_USER_IDS", owner.userId); vi.stubEnv("COTIZA_APPROVAL_MANAGER_USER_IDS", owner.userId);
    vi.stubEnv("COTIZA_APPROVAL_BOOTSTRAP_USER_IDS", owner.userId); vi.stubEnv("COTIZA_APPROVAL_BOOTSTRAP_TICKET", "synthetic-test-ticket-0000000000000000000000");
    vi.stubEnv("COTIZA_APPROVAL_BOOTSTRAP_UNTIL", new Date(Date.now() + 900_000).toISOString());
    pool = new Pool({ connectionString: url });
    const cli = join(dirname(createRequire(import.meta.url).resolve("prisma/package.json")), "build/index.js");
    const sql = execFileSync(process.execPath, [cli, "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], { encoding: "utf8" });
    await pool.query(sql);
    // Retira únicamente las seis tablas nuevas del cluster temporal y prueba el DDL que se entregará.
    await pool.query("DROP TABLE approval_credentials, approval_requests, approval_enrollment_grants, approval_challenges, approval_events, approval_rate_buckets");
    await pool.query(readFileSync(new URL("../../prisma/manual/20261116_verified_authorization.sql", import.meta.url), "utf8"));
    const globals = globalThis as unknown as { pool: Pool; prisma?: typeof db }; globals.pool = pool; delete globals.prisma;
    ({ prisma: db } = await import("./prisma")); api = await import("./verified-authorization");
    await db.tenant.createMany({ data: [{ tenant_id: owner.tenantId, slug: "sys", name: "SynAppsSys", created_at: new Date() }, { tenant_id: "other", slug: "other", name: "Other", created_at: new Date() }] });
    for (const a of [owner, seller, intruder]) await db.app_users.create({ data: { user_id: a.userId, tenant_id: a.tenantId, role: a.role, active: true, alias: a.userId, first_name: a.userId, last_name: "Synthetic", password_hash: "unused", created_at: new Date() } });
    await db.tenantCapability.create({ data: { tenant_id: owner.tenantId, capability_key: "verified_authorization_pilot", enabled: true, updated_by: owner.userId } });
  }, 60_000);
  afterAll(async () => { await db?.$disconnect(); await pool?.end(); if (pg) { pg.kill("SIGTERM"); await new Promise<void>(r => pg.once("exit", () => r())); } if (dir) rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

  it("bootstraps exactly once and registers an actual ES256 credential", async () => {
    const intent = await api.prepareBootstrap(owner);
    await expect(api.bootstrapEnrollment(owner, intent.challengeId)).rejects.toMatchObject({ status: 403 });
    owner.claims.reverification_id = "rv-after-bootstrap-intent";
    const grant = await api.bootstrapEnrollment(owner, intent.challengeId);
    await expect(api.bootstrapEnrollment(owner, intent.challengeId)).rejects.toMatchObject({ status: 403 });
    const duplicate = await api.prepareBootstrap(owner); owner.claims.reverification_id = "rv-second-intent";
    await expect(api.bootstrapEnrollment(owner, duplicate.challengeId)).rejects.toMatchObject({ status: 409 });
    const opts = await api.registrationOptions(owner, grant.grantId, "Autenticador sintético");
    const registered = await api.verifyRegistration(owner, opts.challengeId, key.register(opts.options.challenge));
    ownerCredentialId = registered.id; expect(registered.deviceType).toBe("singleDevice");
    await expect(api.verifyRegistration(owner, opts.challengeId, key.register(opts.options.challenge))).rejects.toMatchObject({ status: 409 });
  });
  it("rejects a cookie-equivalent intruder and a forged tenant context", async () => {
    await expect(api.approvalState(intruder)).rejects.toMatchObject({ status: 403 });
    await expect(api.approvalState({ ...owner, userId: intruder.userId })).rejects.toMatchObject({ status: 403 });
  });
  it("does not grant pilot authority from a legacy role increase without explicit Clerk-ID nomination", async () => {
    await db.app_users.update({ where: { user_id: seller.userId }, data: { role: "owner" } });
    await expect(api.createApproval(seller, { ...purchase, approverUserId: seller.userId })).rejects.toMatchObject({ status: 403 });
    await expect(api.createApproval(seller, { kind: "enrollment", approverUserId: owner.userId, targetUserId: seller.userId })).rejects.toMatchObject({ status: 403 });
    await db.app_users.update({ where: { user_id: seller.userId }, data: { role: "user" } });
  });
  it("requires the exact account, link, and a registered key", async () => {
    const r = await api.createApproval(seller, purchase), token = secret(r.confirmationUrl);
    await expect(api.approvalOptions(seller, r.request.id, token, "approved")).rejects.toMatchObject({ status: 403 });
    await expect(api.approvalOptions(owner, r.request.id, "wrong", "approved")).rejects.toMatchObject({ status: 403 });
    const options = await api.approvalOptions(owner, r.request.id, token, "approved");
    const wrong = key.assert(options.options.challenge); wrong.id = "unknown";
    await expect(api.confirmApproval(owner, r.request.id, token, options.challengeId, wrong)).rejects.toMatchObject({ status: 403 });
  });
  it.each([{ origin: "https://evil.example" }, { uv: false }, { wrongKey: true }])("rejects invalid cryptographic or origin proof %j", async bad => {
    const r = await api.createApproval(seller, purchase), token = secret(r.confirmationUrl);
    const opts = await api.approvalOptions(owner, r.request.id, token, "approved");
    await expect(api.confirmApproval(owner, r.request.id, token, opts.challengeId, key.assert(opts.options.challenge, bad))).rejects.toThrow();
    expect((await api.getApproval(seller, r.request.id, "")).state).toBe("pending");
  });
  it("binds signed proof to the exact operation and prevents a second decision or execution under concurrency", async () => {
    const r = await api.createApproval(seller, purchase), token = secret(r.confirmationUrl), opts = await api.approvalOptions(owner, r.request.id, token, "approved");
    const response = key.assert(opts.options.challenge);
    const decisions = await Promise.allSettled([1, 2].map(() => api.confirmApproval(owner, r.request.id, token, opts.challengeId, response)));
    expect(decisions.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const results = await Promise.all([1, 2].map(() => api.consumeApproval(seller, r.request.id)));
    expect(results.filter(r => !r.replay)).toHaveLength(1); expect(results[0].request.state).toBe("consumed");
    const bundle = await api.exportApproval(seller, r.request.id);
    expect(bundle.integrity.status).toBe("hash_verified"); expect(bundle.status).toBe("prepared_for_custody");
    expect(bundle.events.filter(e => (e.record as { event_type: string }).event_type === "purchase.simulated")).toHaveLength(1);
    const proof = bundle.events.find(e => (e.record as { event_type: string }).event_type === "decision.approved")!.record as { data: { proof: { binding: { payload_hash: string } } } };
    expect(proof.data.proof.binding.payload_hash).toBe(bundle.payload_hash);
    const { verifyApprovalEvidence } = await import("../../scripts/verify-approval-evidence.mjs");
    expect(await verifyApprovalEvidence(bundle)).toMatchObject({ signatures: "signature_verified", executions: 1 });
    const tampered = structuredClone(bundle); (tampered.snapshot as Record<string, unknown>).tenantName = "Otra empresa";
    await expect(verifyApprovalEvidence(tampered)).rejects.toThrow("Snapshot hash mismatch");
  });
  it("denies replay against a different request", async () => {
    const a = await api.createApproval(seller, purchase), b = await api.createApproval(seller, purchase);
    const opts = await api.approvalOptions(owner, a.request.id, secret(a.confirmationUrl), "approved");
    await expect(api.confirmApproval(owner, b.request.id, secret(b.confirmationUrl), opts.challengeId, key.assert(opts.options.challenge))).rejects.toMatchObject({ status: 409 });
  });
  it("detects content tampering and policy changes", async () => {
    const r = await api.createApproval(seller, purchase);
    await db.approvalRequest.update({ where: { id: r.request.id }, data: { snapshot: { tampered: true } } });
    await expect(api.approvalOptions(owner, r.request.id, secret(r.confirmationUrl), "approved")).rejects.toMatchObject({ status: 409 });
    const fresh = await api.createApproval(seller, purchase); vi.stubEnv("COTIZA_APPROVAL_SINGLE_DEVICE", "false");
    await expect(api.approvalOptions(owner, fresh.request.id, secret(fresh.confirmationUrl), "approved")).rejects.toMatchObject({ status: 409 });
    vi.stubEnv("COTIZA_APPROVAL_SINGLE_DEVICE", "true");
  });
  it("rejects expiry, cancellation, rejection and removed privileges", async () => {
    const expired = await api.createApproval(seller, purchase);
    await db.approvalRequest.update({ where: { id: expired.request.id }, data: { expires_at: new Date(0) } });
    await expect(api.approvalOptions(owner, expired.request.id, secret(expired.confirmationUrl), "approved")).rejects.toMatchObject({ status: 409 });
    const cancelled = await api.createApproval(seller, purchase); await api.cancelApproval(seller, cancelled.request.id);
    await expect(api.approvalOptions(owner, cancelled.request.id, secret(cancelled.confirmationUrl), "approved")).rejects.toMatchObject({ status: 409 });
    const rejected = await api.createApproval(seller, purchase), t = secret(rejected.confirmationUrl), opts = await api.approvalOptions(owner, rejected.request.id, t, "rejected");
    await api.confirmApproval(owner, rejected.request.id, t, opts.challengeId, key.assert(opts.options.challenge));
    await expect(api.consumeApproval(seller, rejected.request.id)).rejects.toMatchObject({ status: 409 });
    const role = await api.createApproval(seller, purchase); await db.app_users.update({ where: { user_id: owner.userId }, data: { role: "user" } });
    await expect(api.approvalOptions(owner, role.request.id, secret(role.confirmationUrl), "approved")).rejects.toMatchObject({ status: 403 });
    await db.app_users.update({ where: { user_id: owner.userId }, data: { role: "owner" } });
  });
  it("requires a signed enrollment and blocks a synchronized credential under strict policy", async () => {
    const request = await api.createApproval(owner, { kind: "enrollment", approverUserId: owner.userId, targetUserId: seller.userId });
    const token = secret(request.confirmationUrl), opts = await api.approvalOptions(owner, request.request.id, token, "approved");
    await api.confirmApproval(owner, request.request.id, token, opts.challengeId, key.assert(opts.options.challenge));
    const consumed = await api.consumeApproval(owner, request.request.id), grantId = (consumed.request.result as { grant_id: string }).grant_id;
    await expect(api.registrationOptions(owner, grantId, "Not mine")).rejects.toMatchObject({ status: 403 });
    const registration = await api.registrationOptions(seller, grantId, "Multi-device synthetic");
    await expect(api.verifyRegistration(seller, registration.challengeId, authenticator(true).register(registration.options.challenge))).rejects.toThrow("sincronizables");
  });
  it("revokes a credential and invalidates outstanding authorizations and pending grants", async () => {
    const outstanding = await api.createApproval(seller, purchase);
    const request = await api.createApproval(owner, { kind: "revocation", approverUserId: owner.userId, credentialId: ownerCredentialId });
    const token = secret(request.confirmationUrl), opts = await api.approvalOptions(owner, request.request.id, token, "approved");
    await api.confirmApproval(owner, request.request.id, token, opts.challengeId, key.assert(opts.options.challenge));
    await api.consumeApproval(owner, request.request.id);
    expect((await api.getApproval(seller, outstanding.request.id, "")).state).toBe("invalidated");
    expect((await api.approvalState(owner)).credentials[0].revokedAt).not.toBeNull();
    const recoveryIntent = await api.prepareBootstrap(owner); owner.claims.reverification_id = "rv-new-recovery-intent";
    await expect(api.bootstrapEnrollment(owner, recoveryIntent.challengeId)).rejects.toMatchObject({ status: 409 });
  });
  it("protects event history from update and deletion", async () => {
    await expect(pool.query("UPDATE approval_events SET event_hash=repeat('0',64)")).rejects.toThrow("append-only");
    await expect(pool.query("DELETE FROM approval_events")).rejects.toThrow("append-only");
  });
  it("configures the exact tenant and performs explicit out-of-band recovery without fabricating user proof", async () => {
    await db.app_users.update({ where: { user_id: owner.userId }, data: { role: "superadmin" } });
    const { configureApprovalPilot } = await import("../../scripts/configure-approval-pilot.mjs");
    expect(await configureApprovalPilot(pool, owner.userId)).toMatchObject({ mode: "dry_run", schemaReady: true });
    await db.tenantCapability.update({ where: { tenant_id_capability_key: { tenant_id: owner.tenantId, capability_key: "verified_authorization_pilot" } }, data: { enabled: false } });
    expect(await configureApprovalPilot(pool, owner.userId, true)).toMatchObject({ mode: "applied", capabilityEnabled: true });
    expect((await pool.query("SELECT count(*)::int AS n FROM tenant_capability_events WHERE capability_key='verified_authorization_pilot'")).rows[0].n).toBe(1);
    const { recoverApprovalDevices } = await import("../../scripts/recover-approval-devices.mjs");
    const input = { actorId: owner.userId, userId: owner.userId, caseRef: "REC-SYNTHETIC-001", reason: "Recuperación sintética controlada" };
    expect(await recoverApprovalDevices(pool, input)).toMatchObject({ mode: "dry_run" });
    await recoverApprovalDevices(pool, { ...input, apply: true });
    const record = (await pool.query("SELECT record FROM approval_events WHERE case_id='recovery:REC-SYNTHETIC-001'")).rows[0].record;
    expect(record.actors[0].identity_status).toBe("declared"); expect(record.data.signature_status).toBe("not_verified");
    await expect(configureApprovalPilot(pool, intruder.userId, true)).rejects.toThrow("superadmin");
  });
  it("enforces shared database rate limits and refuses a disabled entitlement", async () => {
    await api.approvalRate(seller, "synthetic-test", 1); await expect(api.approvalRate(seller, "synthetic-test", 1)).rejects.toMatchObject({ status: 429 });
    await db.tenantCapability.update({ where: { tenant_id_capability_key: { tenant_id: owner.tenantId, capability_key: "verified_authorization_pilot" } }, data: { enabled: false } });
    await expect(api.approvalState(owner)).rejects.toMatchObject({ status: 403 });
  });
});
