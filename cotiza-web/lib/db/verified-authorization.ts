import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, type ApprovalRequest, type ApprovalCredential } from "@prisma/client";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/db/prisma";
import { approvalConfig, nominatedApprover, type ApprovalActor } from "@/lib/auth/verified-authorization";
import { APPROVAL_POLICY, APPROVER_ROLES, ROOT_ROLES, VERIFIED_AUTHORIZATION, ApprovalError, assertCredentialPolicy,
  bootstrapFresh, canonical, digest, snapshotFor, tokenHash, tokenMatches, type ApprovalInput, type ApprovalSnapshot } from "@/lib/domain/verified-authorization";

type Tx = Prisma.TransactionClient;
const json = (v: unknown) => JSON.parse(canonical(v)) as Prisma.InputJsonValue;
const activeCredential = (a: ApprovalActor) => ({ tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId, rp_id: approvalConfig().rpId, revoked_at: null });
const caseId = (id: string) => `request:${id}`;
function root(actor: ApprovalActor) { if (!ROOT_ROLES.includes(actor.role) || !nominatedApprover(actor.userId, true)) throw new ApprovalError("Esta acción requiere un administrador del piloto nominado por ID Clerk"); }

/** Todas las transiciones se serializan en PostgreSQL por empresa, no en memoria del proceso. */
async function transaction<T>(actor: ApprovalActor, work: (tx: Tx, current: ApprovalActor) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"verified-approval:" + actor.tenantId}, 0))::text`;
    const config = approvalConfig();
    // Los cambios de rol, baja de empresa o desactivación del plan esperan al cierre de esta decisión.
    await tx.$queryRaw`SELECT user_id FROM app_users WHERE user_id = ${actor.userId} FOR SHARE`;
    await tx.$queryRaw`SELECT tenant_id FROM tenants WHERE tenant_id = ${actor.tenantId} FOR SHARE`;
    await tx.$queryRaw`SELECT tenant_id FROM tenant_capabilities WHERE tenant_id = ${actor.tenantId} AND capability_key = ${VERIFIED_AUTHORIZATION} FOR SHARE`;
    const member = await tx.app_users.findUnique({ where: { user_id: actor.userId } });
    const tenant = await tx.tenant.findUnique({ where: { tenant_id: actor.tenantId } });
    const cap = await tx.tenantCapability.findUnique({ where: { tenant_id_capability_key: { tenant_id: actor.tenantId, capability_key: VERIFIED_AUTHORIZATION } } });
    if (config.tenantId !== actor.tenantId || config.issuer !== actor.issuer || !tenant?.active || tenant.slug !== "sys" || !cap?.enabled
      || !member?.active || member.tenant_id !== actor.tenantId) throw new ApprovalError("La cuenta, empresa o capacidad ya no está disponible");
    return work(tx, { ...actor, role: member.role, tenantName: tenant.name });
  }, { maxWait: 10_000, timeout: 15_000 });
}

export async function approvalRate(actor: ApprovalActor, scope: string, limit = 20) {
  const window = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const row = await prisma.approvalRateBucket.upsert({ where: { tenant_id_user_id_scope_window: { tenant_id: actor.tenantId, user_id: actor.userId, scope, window } },
    create: { tenant_id: actor.tenantId, user_id: actor.userId, scope, window, count: 1 }, update: { count: { increment: 1 } } });
  if (row.count > limit) throw new ApprovalError("Demasiados intentos. Espera un minuto.", 429);
}

async function event(tx: Tx, actor: ApprovalActor, subject: string, type: string, data: unknown, decision = false) {
  const last = await tx.approvalEvent.findFirst({ where: { tenant_id: actor.tenantId, case_id: subject }, orderBy: { sequence: "desc" } });
  const id = randomUUID(), now = new Date().toISOString();
  const record = { recordia_version: "1.0", event_id: id, case_id: subject, event_type: type,
    occurred_at: now, occurred_at_utc: now, recorded_at_utc: now,
    actors: [{ actor_id: actor.userId, role: actor.role, identity_status: "verified" }],
    subject: { entity_id: subject, entity_type: "cotiza_authorization_pilot" }, action_or_state: type,
    epistemic_class: decision ? "decision" : "observed_fact", support_status: "supported",
    source_refs: [`cotiza:${actor.tenantId}:${subject}`], evidence_refs: [`evidence:${id}`],
    relations: last ? [{ predicate: "derived_from", target_id: last.id }] : [],
    policy_or_rule_refs: [APPROVAL_POLICY], data };
  const sequence = (last?.sequence ?? 0) + 1, previous_hash = last?.event_hash ?? "0".repeat(64);
  return tx.approvalEvent.create({ data: { id, tenant_id: actor.tenantId, case_id: subject, sequence, previous_hash,
    event_hash: digest({ sequence, previous_hash, record }), record: json(record) } });
}

async function approver(tx: Tx, actor: ApprovalActor, id: string, privileged: boolean) {
  await tx.$queryRaw`SELECT user_id FROM app_users WHERE user_id = ${id} FOR SHARE`;
  const user = await tx.app_users.findUnique({ where: { user_id: id } });
  if (!user?.active || user.tenant_id !== actor.tenantId || !nominatedApprover(id, privileged) || !(privileged ? ROOT_ROLES : APPROVER_ROLES).includes(user.role)) throw new ApprovalError("El aprobador no tiene facultades vigentes para esta empresa");
  return user;
}
function view(row: ApprovalRequest) {
  return { id: row.id, kind: row.kind, state: row.expires_at <= new Date() && ["pending", "approved"].includes(row.state) ? "expired" : row.state,
    initiatorUserId: row.initiator_id, approverUserId: row.approver_id, snapshot: row.snapshot,
    payloadHash: row.payload_hash, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString(), result: row.result };
}
async function requestRow(tx: Tx, actor: ApprovalActor, id: string) {
  const row = await tx.approvalRequest.findFirst({ where: { id, tenant_id: actor.tenantId, issuer: actor.issuer } });
  if (!row || (row.initiator_id !== actor.userId && row.approver_id !== actor.userId)) throw new ApprovalError("Solicitud no disponible", 404);
  if (digest(row.snapshot) !== row.payload_hash) throw new ApprovalError("El contenido ya no coincide con la solicitud", 409);
  const snapshot = row.snapshot as unknown as ApprovalSnapshot;
  if (snapshot.tenantId !== actor.tenantId || snapshot.input.kind !== row.kind || snapshot.input.approverUserId !== row.approver_id || snapshot.credentialPolicy !== (approvalConfig().singleDevice ? "singleDevice" : "registered")) throw new ApprovalError("Cambió el contexto o la política. Prepara una solicitud nueva.", 409);
  if (snapshot.tenantId !== actor.tenantId || snapshot.input.kind !== row.kind || snapshot.input.approverUserId !== row.approver_id || snapshot.policy !== APPROVAL_POLICY) throw new ApprovalError("El contexto de la operación no coincide con su contenido", 409);
  return row;
}
function pending(row: ApprovalRequest) {
  if (row.state !== "pending" || row.expires_at <= new Date()) throw new ApprovalError("La solicitud ya no está pendiente o venció", 409);
}
function authorizedLink(actor: ApprovalActor, row: ApprovalRequest, token: string) {
  if (actor.userId !== row.approver_id || !tokenMatches(token, row.token_hash)) throw new ApprovalError("La solicitud requiere su enlace de confirmación y la cuenta destinataria");
}
async function expire(tx: Tx, actor: ApprovalActor) {
  const rows = await tx.approvalRequest.findMany({ where: { tenant_id: actor.tenantId, issuer: actor.issuer, state: { in: ["pending", "approved"] }, expires_at: { lte: new Date() } } });
  for (const row of rows) {
    await tx.approvalRequest.update({ where: { id: row.id }, data: { state: "expired" } });
    await event(tx, actor, caseId(row.id), "request.expired", { payload_hash: row.payload_hash });
  }
}

export async function approvalState(actor: ApprovalActor) {
  return transaction(actor, async (tx, a) => {
    await expire(tx, a);
    const [credentials, requests, grants, users, managedCredentials] = await Promise.all([
      tx.approvalCredential.findMany({ where: { tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId }, orderBy: { created_at: "desc" } }),
      tx.approvalRequest.findMany({ where: { tenant_id: a.tenantId, issuer: a.issuer, OR: [{ initiator_id: a.userId }, { approver_id: a.userId }] }, orderBy: { created_at: "desc" }, take: 30 }),
      tx.approvalEnrollmentGrant.findMany({ where: { tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId, consumed_at: null, revoked_at: null, expires_at: { gt: new Date() } } }),
      tx.app_users.findMany({ where: { tenant_id: a.tenantId, active: true, user_id: { startsWith: "user_" } }, select: { user_id: true, first_name: true, last_name: true, role: true }, orderBy: { first_name: "asc" }, take: 200 }),
      ROOT_ROLES.includes(a.role) && nominatedApprover(a.userId, true) ? tx.approvalCredential.findMany({ where: { tenant_id: a.tenantId, issuer: a.issuer, revoked_at: null }, select: { id: true, user_id: true, label: true }, take: 200 }) : Promise.resolve([]),
    ]);
    const boot = bootstrapFresh(a.claims, new Date(), process.env.COTIZA_APPROVAL_BOOTSTRAP_UNTIL ?? "", (process.env.COTIZA_APPROVAL_BOOTSTRAP_USER_IDS ?? "").split(","), a.userId);
    return { tenant: { id: a.tenantId, name: a.tenantName }, actorId: a.userId, isManager: ROOT_ROLES.includes(a.role) && nominatedApprover(a.userId, true), singleDevice: approvalConfig().singleDevice,
      bootstrapConfigured: ROOT_ROLES.includes(a.role) && nominatedApprover(a.userId, true) && (process.env.COTIZA_APPROVAL_BOOTSTRAP_USER_IDS ?? "").split(",").includes(a.userId), bootstrapFresh: boot,
      credentials: credentials.map(c => ({ id: c.id, label: c.label, deviceType: c.device_type, backedUp: c.backed_up, revokedAt: c.revoked_at?.toISOString() ?? null })),
      requests: requests.map(view), grants: grants.map(g => ({ id: g.id, expiresAt: g.expires_at.toISOString() })),
      managedCredentials: managedCredentials.map(c => ({ id: c.id, label: c.label, userId: c.user_id })),
      users: users.map(u => ({ id: u.user_id, name: `${u.first_name} ${u.last_name}`.trim(), canApprove: APPROVER_ROLES.includes(u.role) && nominatedApprover(u.user_id), canManage: ROOT_ROLES.includes(u.role) && nominatedApprover(u.user_id, true) })) };
  });
}

export async function createApproval(actor: ApprovalActor, input: ApprovalInput) {
  return transaction(actor, async (tx, a) => {
    await approver(tx, a, input.approverUserId, input.kind !== "purchase");
    if (input.kind !== "purchase") root(a);
    if (input.kind === "enrollment") {
      const target = await tx.app_users.findFirst({ where: { tenant_id: a.tenantId, user_id: input.targetUserId, active: true } });
      if (!target) throw new ApprovalError("Usuario destinatario no disponible");
    }
    if (input.kind === "revocation" && !await tx.approvalCredential.findFirst({ where: { id: input.credentialId, tenant_id: a.tenantId, issuer: a.issuer, revoked_at: null } })) throw new ApprovalError("Credencial no disponible", 404);
    const token = randomBytes(32).toString("base64url"), snapshot = snapshotFor({ id: a.tenantId, name: a.tenantName }, input, approvalConfig().singleDevice);
    const row = await tx.approvalRequest.create({ data: { tenant_id: a.tenantId, issuer: a.issuer, initiator_id: a.userId, approver_id: input.approverUserId,
      kind: input.kind, state: "pending", snapshot: json(snapshot), payload_hash: digest(snapshot), token_hash: tokenHash(token), expires_at: new Date(Date.now() + 300_000) } });
    await event(tx, a, caseId(row.id), "request.created", { snapshot, payload_hash: row.payload_hash });
    return { request: view(row), confirmationUrl: `${approvalConfig().origin}/confirmar-autorizacion/${row.id}#${token}` };
  });
}

export async function getApproval(actor: ApprovalActor, id: string, token: string) {
  return transaction(actor, async (tx, a) => {
    await expire(tx, a);
    const row = await requestRow(tx, a, id);
    if (row.initiator_id !== a.userId) authorizedLink(a, row, token);
    return view(row);
  });
}

export async function approvalOptions(actor: ApprovalActor, id: string, token: string, decision: "approved" | "rejected") {
  return transaction(actor, async (tx, a) => {
    const row = await requestRow(tx, a, id); pending(row); authorizedLink(a, row, token);
    await approver(tx, a, a.userId, row.kind !== "purchase");
    const credentials = await tx.approvalCredential.findMany({ where: activeCredential(a) });
    const allowed = credentials.filter(c => !approvalConfig().singleDevice || c.device_type === "singleDevice");
    if (!allowed.length) throw new ApprovalError("Registra primero una credencial compatible con la política de aprobación");
    const binding = { nonce: randomBytes(32).toString("base64url"), action_id: id, payload_hash: row.payload_hash, decision, approver: a.userId, tenant_id: a.tenantId, issuer: a.issuer };
    const options = await generateAuthenticationOptions({ rpID: approvalConfig().rpId, userVerification: "required", timeout: 120_000,
      challenge: Buffer.from(digest(binding), "hex"),
      allowCredentials: allowed.map(c => ({ id: c.credential_id })) });
    await tx.approvalChallenge.updateMany({ where: { tenant_id: a.tenantId, user_id: a.userId, request_id: id, consumed_at: null }, data: { consumed_at: new Date() } });
    const challenge = await tx.approvalChallenge.create({ data: { tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId, purpose: "decision", request_id: id,
      decision, binding: json(binding), challenge: options.challenge, payload_hash: row.payload_hash, expires_at: new Date(Math.min(row.expires_at.getTime(), Date.now() + 120_000)) } });
    return { options, challengeId: challenge.id, payloadHash: row.payload_hash };
  });
}

export async function confirmApproval(actor: ApprovalActor, id: string, token: string, challengeId: string, response: AuthenticationResponseJSON) {
  return transaction(actor, async (tx, a) => {
    const row = await requestRow(tx, a, id); pending(row); authorizedLink(a, row, token);
    await approver(tx, a, a.userId, row.kind !== "purchase");
    const challenge = await tx.approvalChallenge.findFirst({ where: { id: challengeId, tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId, request_id: id, purpose: "decision", consumed_at: null } });
    if (!challenge || challenge.expires_at <= new Date() || challenge.payload_hash !== row.payload_hash) throw new ApprovalError("Reto vencido, reutilizado o ajeno a la operación", 409);
    if (!challenge.binding || Buffer.from(digest(challenge.binding), "hex").toString("base64url") !== challenge.challenge) throw new ApprovalError("El reto no conserva su vínculo con la operación", 409);
    const credential = await tx.approvalCredential.findFirst({ where: { ...activeCredential(a), credential_id: response.id } });
    if (!credential) throw new ApprovalError("Credencial no registrada o revocada");
    assertCredentialPolicy(credential.device_type, credential.backed_up, approvalConfig().singleDevice);
    const verified = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: approvalConfig().origin,
      expectedRPID: approvalConfig().rpId, requireUserVerification: true,
      credential: { id: credential.credential_id, publicKey: new Uint8Array(credential.public_key), counter: Number(credential.counter) } });
    if (!verified.verified) throw new ApprovalError("No fue posible verificar la firma");
    const info = verified.authenticationInfo;
    assertCredentialPolicy(info.credentialDeviceType, info.credentialBackedUp, approvalConfig().singleDevice);
    if (info.credentialDeviceType !== credential.device_type) throw new ApprovalError("Cambió la elegibilidad de respaldo de la credencial");
    await tx.approvalCredential.update({ where: { id: credential.id }, data: { counter: BigInt(info.newCounter), backed_up: info.credentialBackedUp } });
    await tx.approvalChallenge.update({ where: { id: challenge.id }, data: { consumed_at: new Date() } });
    const updated = await tx.approvalRequest.update({ where: { id }, data: { state: challenge.decision!, decided_at: new Date(), credential_id: credential.id } });
    await event(tx, a, caseId(id), `decision.${challenge.decision}`, { payload_hash: row.payload_hash, credential_record_id: credential.id,
      proof: { response, binding: challenge.binding, expectedChallenge: challenge.challenge, expectedOrigin: approvalConfig().origin, expectedRPID: approvalConfig().rpId,
        credential: { id: credential.credential_id, publicKey: Buffer.from(credential.public_key).toString("base64url"), counter: Number(credential.counter) } },
      verification: { integrity_status: "signature_verified", user_verified: info.userVerified, device_type: info.credentialDeviceType, backed_up: info.credentialBackedUp } }, true);
    return view(updated);
  });
}

export async function prepareBootstrap(actor: ApprovalActor) {
  return transaction(actor, async (tx, a) => {
    root(a);
    const until = Date.parse(process.env.COTIZA_APPROVAL_BOOTSTRAP_UNTIL ?? "");
    if (!(process.env.COTIZA_APPROVAL_BOOTSTRAP_USER_IDS ?? "").split(",").includes(a.userId) || (process.env.COTIZA_APPROVAL_BOOTSTRAP_TICKET ?? "").length < 32
      || until <= Date.now() || until > Date.now() + 86_400_000 || !Number.isFinite(until) || await tx.approvalCredential.count({ where: activeCredential(a) })) throw new ApprovalError("El registro inicial requiere habilitación administrativa temporal");
    const challenge = await tx.approvalChallenge.create({ data: { tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId, purpose: "bootstrap",
      challenge: randomBytes(32).toString("base64url"), binding: json({ reverification_id_before: a.claims.reverification_id ?? null }), expires_at: new Date(Date.now() + 120_000) } });
    return { challengeId: challenge.id };
  });
}
export async function bootstrapEnrollment(actor: ApprovalActor, challengeId: string) {
  return transaction(actor, async (tx, a) => {
    root(a);
    const intent = await tx.approvalChallenge.findFirst({ where: { id: challengeId, tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId, purpose: "bootstrap", consumed_at: null } });
    if (!intent || intent.expires_at <= new Date() || (intent.binding as { reverification_id_before?: unknown })?.reverification_id_before === a.claims.reverification_id) throw new ApprovalError("Reverifica tu identidad después de iniciar el alta de esta credencial");
    const ticket = process.env.COTIZA_APPROVAL_BOOTSTRAP_TICKET ?? "";
    if (ticket.length < 32 || !bootstrapFresh(a.claims, new Date(), process.env.COTIZA_APPROVAL_BOOTSTRAP_UNTIL ?? "", (process.env.COTIZA_APPROVAL_BOOTSTRAP_USER_IDS ?? "").split(","), a.userId)
      || await tx.approvalCredential.count({ where: activeCredential(a) })) throw new ApprovalError("El alta inicial requiere habilitación temporal del administrador y una reverificación reciente de Clerk");
    const key = tokenHash(`${a.issuer}:${a.userId}:${ticket}`);
    if (await tx.approvalEnrollmentGrant.findUnique({ where: { bootstrap_key: key } })) throw new ApprovalError("La habilitación inicial ya fue utilizada", 409);
    await tx.approvalChallenge.update({ where: { id: intent.id }, data: { consumed_at: new Date() } });
    const grant = await tx.approvalEnrollmentGrant.create({ data: { tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId, bootstrap_key: key, expires_at: new Date(Date.now() + 600_000) } });
    await event(tx, a, `enrollment:${grant.id}`, "enrollment.bootstrap_granted", { grant_id: grant.id, recovery: await tx.approvalCredential.count({ where: { tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId } }) > 0 }, true);
    return { grantId: grant.id };
  });
}
async function grantRow(tx: Tx, a: ApprovalActor, id: string) {
  const grant = await tx.approvalEnrollmentGrant.findFirst({ where: { id, tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId, consumed_at: null, revoked_at: null } });
  if (!grant || grant.expires_at <= new Date()) throw new ApprovalError("Habilitación de registro vencida o no autorizada");
  if (grant.source_request_id) {
    const source = await tx.approvalRequest.findFirst({ where: { id: grant.source_request_id, tenant_id: a.tenantId, issuer: a.issuer, state: "consumed", kind: "enrollment" } });
    if (!source?.credential_id) throw new ApprovalError("La autorización del alta ya no es válida");
    await approver(tx, a, source.approver_id, true);
    if (!await tx.approvalCredential.findFirst({ where: { id: source.credential_id, tenant_id: a.tenantId, issuer: a.issuer, user_id: source.approver_id, revoked_at: null } })) throw new ApprovalError("La credencial que autorizó el alta fue revocada");
  }
  return grant;
}
export async function registrationOptions(actor: ApprovalActor, grantId: string, label: string) {
  return transaction(actor, async (tx, a) => {
    await grantRow(tx, a, grantId);
    const credentials = await tx.approvalCredential.findMany({ where: { tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId } });
    const options = await generateRegistrationOptions({ rpName: "Cotiza · SynAppsSys", rpID: approvalConfig().rpId,
      userID: Buffer.from(tokenHash(`${a.issuer}:${a.userId}`), "hex"), userName: a.userId, attestationType: "none", timeout: 120_000,
      excludeCredentials: credentials.map(c => ({ id: c.credential_id })), authenticatorSelection: { userVerification: "required", residentKey: "preferred" } });
    await tx.approvalChallenge.updateMany({ where: { tenant_id: a.tenantId, user_id: a.userId, grant_id: grantId, consumed_at: null }, data: { consumed_at: new Date() } });
    const challenge = await tx.approvalChallenge.create({ data: { tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId, purpose: "registration", grant_id: grantId,
      label, challenge: options.challenge, expires_at: new Date(Date.now() + 120_000) } });
    return { options, challengeId: challenge.id };
  });
}
export async function verifyRegistration(actor: ApprovalActor, challengeId: string, response: RegistrationResponseJSON) {
  return transaction(actor, async (tx, a) => {
    const challenge = await tx.approvalChallenge.findFirst({ where: { id: challengeId, tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId, purpose: "registration", consumed_at: null } });
    if (!challenge?.grant_id || challenge.expires_at <= new Date()) throw new ApprovalError("Reto de registro vencido o reutilizado", 409);
    const grant = await grantRow(tx, a, challenge.grant_id);
    const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: approvalConfig().origin, expectedRPID: approvalConfig().rpId,
      requireUserPresence: true, requireUserVerification: true });
    if (!result.verified) throw new ApprovalError("Registro no verificado");
    const info = result.registrationInfo;
    assertCredentialPolicy(info.credentialDeviceType, info.credentialBackedUp, approvalConfig().singleDevice);
    const credential = await tx.approvalCredential.create({ data: { tenant_id: a.tenantId, issuer: a.issuer, user_id: a.userId, rp_id: approvalConfig().rpId,
      credential_id: info.credential.id, public_key: Buffer.from(info.credential.publicKey), counter: BigInt(info.credential.counter), label: challenge.label!,
      device_type: info.credentialDeviceType, backed_up: info.credentialBackedUp } });
    await tx.approvalChallenge.update({ where: { id: challengeId }, data: { consumed_at: new Date() } });
    await tx.approvalEnrollmentGrant.update({ where: { id: grant.id }, data: { consumed_at: new Date() } });
    await event(tx, a, `enrollment:${grant.id}`, "credential.registered", { credential_record_id: credential.id, grant_id: grant.id, device_type: credential.device_type,
      backed_up: credential.backed_up, user_verified: info.userVerified, attestation_trust: "not_verified", physical_device_identity: "unknown" });
    return { id: credential.id, label: credential.label, deviceType: credential.device_type };
  });
}

export async function cancelApproval(actor: ApprovalActor, id: string) {
  return transaction(actor, async (tx, a) => {
    const row = await requestRow(tx, a, id);
    if (row.initiator_id !== a.userId || !["pending", "approved"].includes(row.state)) throw new ApprovalError("No se puede cancelar esta solicitud", 409);
    const result = await tx.approvalRequest.update({ where: { id }, data: { state: "cancelled" } });
    await event(tx, a, caseId(id), "request.cancelled", { payload_hash: row.payload_hash }, true);
    return view(result);
  });
}

async function revoke(tx: Tx, a: ApprovalActor, credential: ApprovalCredential) {
  await tx.approvalCredential.update({ where: { id: credential.id }, data: { revoked_at: new Date() } });
  // Revocar una credencial invalida solicitudes aún ejecutables del usuario y sus altas pendientes.
  const rows = await tx.approvalRequest.findMany({ where: { tenant_id: a.tenantId, issuer: a.issuer, approver_id: credential.user_id, state: { in: ["pending", "approved"] } } });
  for (const row of rows) {
    await tx.approvalRequest.update({ where: { id: row.id }, data: { state: "invalidated" } });
    await event(tx, a, caseId(row.id), "request.invalidated", { reason: "credential_revoked", credential_record_id: credential.id });
  }
  await tx.approvalEnrollmentGrant.updateMany({ where: { tenant_id: a.tenantId, issuer: a.issuer, user_id: credential.user_id, consumed_at: null }, data: { revoked_at: new Date() } });
  await event(tx, a, `credential:${credential.id}`, "credential.revoked", { credential_record_id: credential.id }, true);
}

export async function consumeApproval(actor: ApprovalActor, id: string) {
  return transaction(actor, async (tx, a) => {
    const row = await requestRow(tx, a, id);
    if (row.initiator_id !== a.userId) throw new ApprovalError("Sólo el solicitante puede aplicar la autorización");
    if (row.state === "consumed") return { request: view(row), replay: true };
    if (row.state !== "approved" || row.expires_at <= new Date()) throw new ApprovalError("No hay una autorización vigente para aplicar", 409);
    await approver(tx, a, row.approver_id, row.kind !== "purchase");
    const decision = await tx.approvalEvent.findFirst({ where: { tenant_id: a.tenantId, case_id: caseId(id), record: { path: ["event_type"], equals: "decision.approved" } } });
    const data = (decision?.record as { data?: { credential_record_id?: string } })?.data;
    const signingCredential = await tx.approvalCredential.findFirst({ where: { id: data?.credential_record_id ?? "", tenant_id: a.tenantId, issuer: a.issuer, user_id: row.approver_id, revoked_at: null } });
    if (!signingCredential) throw new ApprovalError("La credencial aprobadora fue revocada");
    assertCredentialPolicy(signingCredential.device_type, signingCredential.backed_up, approvalConfig().singleDevice);
    const snapshot = row.snapshot as unknown as ApprovalSnapshot;
    let result: Record<string, unknown> = { simulated: row.kind === "purchase", action_id: id, payload_hash: row.payload_hash, kind: row.kind };
    if (snapshot.input.kind === "enrollment") {
      root(a);
      const target = await tx.app_users.findFirst({ where: { tenant_id: a.tenantId, user_id: snapshot.input.targetUserId, active: true } });
      if (!target) throw new ApprovalError("El usuario destinatario ya no está activo");
      const grant = await tx.approvalEnrollmentGrant.create({ data: { tenant_id: a.tenantId, issuer: a.issuer, user_id: target.user_id, source_request_id: id, expires_at: new Date(Date.now() + 600_000) } });
      result = { ...result, grant_id: grant.id };
      await event(tx, a, `enrollment:${grant.id}`, "enrollment.granted", { source_request_id: id, target_user_id: target.user_id }, true);
    } else if (snapshot.input.kind === "revocation") {
      root(a);
      const target = await tx.approvalCredential.findFirst({ where: { id: snapshot.input.credentialId, tenant_id: a.tenantId, issuer: a.issuer, revoked_at: null } });
      if (!target) throw new ApprovalError("Credencial destinataria no disponible", 409);
      // Cerrar antes de invalidar para que una autorrevocación conserve su propio recibo final.
      await tx.approvalRequest.update({ where: { id }, data: { state: "consumed" } });
      await revoke(tx, a, target);
      result = { ...result, revoked_credential_id: target.id };
    }
    const updated = await tx.approvalRequest.update({ where: { id }, data: { state: "consumed", consumed_at: new Date(), result: json(result) } });
    await event(tx, a, caseId(id), row.kind === "purchase" ? "purchase.simulated" : "authorization.applied", result);
    return { request: view(updated), replay: false };
  });
}

export async function exportApproval(actor: ApprovalActor, id: string) {
  return transaction(actor, async (tx, a) => {
    const row = await requestRow(tx, a, id);
    const events = await tx.approvalEvent.findMany({ where: { tenant_id: a.tenantId, case_id: caseId(id) }, orderBy: { sequence: "asc" } });
    let previous = "0".repeat(64), sequence = 0;
    for (const e of events) {
      if (e.sequence !== ++sequence || e.previous_hash !== previous || digest({ sequence: e.sequence, previous_hash: e.previous_hash, record: e.record }) !== e.event_hash) throw new ApprovalError("El expediente no pasó la verificación de integridad", 409);
      previous = e.event_hash;
    }
    return { recordia_version: "1.0", status: "prepared_for_custody", case_id: caseId(id), tenant_id: a.tenantId, exported_at_utc: new Date().toISOString(),
      snapshot: row.snapshot, payload_hash: row.payload_hash,
      sources: [{ source_id: `cotiza:${a.tenantId}:${caseId(id)}`, source_type: "api_record", title: "Expediente de autorización Cotiza",
        author_or_origin: "Cotiza · piloto SynAppsSys", original_timestamp: row.created_at.toISOString(), retrieved_at_utc: new Date().toISOString(),
        locator: `urn:cotiza:approval:${id}`, version: APPROVAL_POLICY, access_scope: "authorized_source" }],
      evidence: events.map(e => ({ evidence_id: `evidence:${e.id}`, source_id: `cotiza:${a.tenantId}:${caseId(id)}`,
        proposition: (e.record as { event_type: string }).event_type, relation: "supports", support_status: "supported",
        integrity_status: "hash_verified", verification_method: "SHA-256 de la secuencia de eventos; la firma de decisiones se incluye para verificación independiente",
        verified_at_utc: new Date().toISOString(), limitations: ["La identidad Clerk y las fechas son registros del servidor; no tienen sello externo."] })),
      integrity: { status: "hash_verified", algorithm: "sha256", head_hash: previous, events: events.length, external_timestamp: "not_verified", hotvault: "not_connected",
        limitations: ["El hash detecta cambios respecto de este manifiesto; no impide que un administrador reemplace todo el expediente.", "WebAuthn verifica el reto; no certifica que la pantalla mostró el contenido ni acredita un teléfono físico."] },
      events: events.map(e => ({ sequence: e.sequence, previous_hash: e.previous_hash, event_hash: e.event_hash, record: e.record })) };
  });
}
