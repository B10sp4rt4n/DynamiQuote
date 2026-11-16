import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

export function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  throw Error("Unsupported canonical value");
}
export const digest = value => createHash("sha256").update(canonical(value)).digest("hex");
function check(condition, message) { if (!condition) throw Error(message); }

/** Verificación local sin consultar Cotiza, Clerk ni servicios de custodia. */
export async function verifyApprovalEvidence(bundle) {
  check(bundle.recordia_version === "1.0" && bundle.status === "prepared_for_custody", "Unsupported evidence format");
  check(Array.isArray(bundle.events) && bundle.events.length > 0, "Empty event history");
  check(digest(bundle.snapshot) === bundle.payload_hash, "Snapshot hash mismatch");
  let previous = "0".repeat(64), sequence = 0, proofs = 0, executions = 0, approvals = 0;
  const first = bundle.events[0].record;
  check(first.event_type === "request.created" && digest(first.data.snapshot) === bundle.payload_hash, "Missing original request");
  for (const event of bundle.events) {
    check(event.sequence === ++sequence && event.previous_hash === previous, "Broken event sequence");
    check(event.record.case_id === bundle.case_id, "Mixed case history");
    check(event.event_hash === digest({ sequence: event.sequence, previous_hash: event.previous_hash, record: event.record }), "Event hash mismatch");
    previous = event.event_hash;
    const type = event.record.event_type, proof = event.record.data?.proof;
    if (type === "decision.approved" || type === "decision.rejected") {
      check(proof, "Missing signed decision proof");
      const expected = Buffer.from(digest(proof.binding), "hex").toString("base64url");
      check(proof.expectedChallenge === expected && proof.binding.payload_hash === bundle.payload_hash, "Decision is not bound to this content");
      check(`request:${proof.binding.action_id}` === bundle.case_id && proof.binding.tenant_id === bundle.tenant_id, "Decision context mismatch");
      check(proof.binding.approver === bundle.snapshot.input.approverUserId && proof.binding.approver === event.record.actors[0].actor_id, "Approver mismatch");
      check(proof.binding.decision === type.slice("decision.".length), "Decision mismatch");
      const verified = await verifyAuthenticationResponse({ response: proof.response, expectedChallenge: expected, expectedOrigin: proof.expectedOrigin,
        expectedRPID: proof.expectedRPID, requireUserVerification: true,
        credential: { id: proof.credential.id, publicKey: new Uint8Array(Buffer.from(proof.credential.publicKey, "base64url")), counter: proof.credential.counter } });
      check(verified.verified, "Invalid signature");
      if (bundle.snapshot.credentialPolicy === "singleDevice") check(verified.authenticationInfo.credentialDeviceType === "singleDevice", "Credential policy mismatch");
      proofs++; if (type === "decision.approved") approvals++;
    }
    if (type === "purchase.simulated" || type === "authorization.applied") {
      check(approvals === 1 && event.record.data.payload_hash === bundle.payload_hash, "Execution without matching approval"); executions++;
    }
  }
  check(proofs <= 1 && executions <= 1, "Duplicate decision or execution");
  check(previous === bundle.integrity.head_hash && sequence === bundle.integrity.events, "Manifest head mismatch");
  return { integrity: "hash_verified", signatures: proofs ? "signature_verified" : "not_applicable", events: sequence, executions,
    custody: "prepared_for_custody", external_timestamp: "not_verified", identity_enrollment: "server_recorded_not_independently_attested" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw Error("Usage: node scripts/verify-approval-evidence.mjs /path/Recordia_Cotiza.json");
    const result = await verifyApprovalEvidence(JSON.parse(await readFile(process.argv[2], "utf8")));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) { process.stderr.write(String(error.message) + "\n"); process.exitCode = 1; }
}
