// Real HTTP Digestor + SQL in both apps; only identity and the external PAC are synthetic.
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: async () => ({ id: "synthetic-a", userId: "synthetic-seller", userRole: "user", authMode: "clerk" }) }));
const enabled = Boolean(process.env.COTIZA_TEST_DATABASE_URL && process.env.FISCAL_RECOVERY_FIXTURE_URL);
let db: typeof import("@/lib/db/prisma").prisma;
let stamp: typeof import("@/app/api/proposals/[proposalId]/invoice/stamp/route").POST;
let reconcile: typeof import("@/app/api/proposals/[proposalId]/invoice/reconcile/route").POST;
let xml: typeof import("@/app/api/proposals/[proposalId]/invoice/xml/route").GET;
let pdf: typeof import("@/app/api/proposals/[proposalId]/invoice/pdf/route").GET;
let claim: typeof import("@/lib/db/proposal-invoices").claimProposalInvoiceStampByTenant;
type Fixture = { mode: string; sent: Record<string, number>; retrieved: Record<string, number>; metrics: number; issued: Record<string, string> };
const state = async (): Promise<Fixture> => (await fetch(process.env.FISCAL_RECOVERY_FIXTURE_URL+"/__fixture")).json();
const context = (name: string) => ({ params: Promise.resolve({ proposalId: "recovery-fixture-"+name }) });
const request = (name: string, recovery?: string) => new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ expectedDraftId: "synthetic-"+name, confirm: true, ...(recovery ? { invoiceUuid: recovery } : {}) }) });
const query = () => new Request("http://localhost/api/test", { method: "POST" });
const read = (name: string) => db.proposals.findUniqueOrThrow({ where: { proposal_id: "recovery-fixture-"+name } });
beforeAll(async () => {
  if (!enabled) return;
  for (const value of [process.env.COTIZA_TEST_DATABASE_URL!, process.env.FISCAL_RECOVERY_FIXTURE_URL!])
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) throw Error("Disposable loopback resources required");
  expect((await state()).mode).toBe("synthetic-loopback-no-pac");
  process.env.DATABASE_URL = process.env.COTIZA_TEST_DATABASE_URL;
  process.env.DIGESTOR_FISCAL_BASE_URL = process.env.FISCAL_RECOVERY_FIXTURE_URL;
  process.env.DIGESTOR_FISCAL_TENANT_ID = "synthetic-a";
  process.env.DIGESTOR_FISCAL_USERNAME = "synthetic";
  process.env.DIGESTOR_FISCAL_PASSWORD = "synthetic-loopback-only";
  ({ prisma: db } = await import("@/lib/db/prisma"));
  ({ POST: stamp } = await import("@/app/api/proposals/[proposalId]/invoice/stamp/route"));
  ({ POST: reconcile } = await import("@/app/api/proposals/[proposalId]/invoice/reconcile/route"));
  ({ GET: xml } = await import("@/app/api/proposals/[proposalId]/invoice/xml/route"));
  ({ GET: pdf } = await import("@/app/api/proposals/[proposalId]/invoice/pdf/route"));
  ({ claimProposalInvoiceStampByTenant: claim } = await import("@/lib/db/proposal-invoices"));
  await db.tenant.create({ data: { tenant_id: "synthetic-a", slug: "synthetic-a", name: "SYNTHETIC", created_at: new Date() } });
  for (const name of ["normal", "lost", "not-sent", "rejected"])
    await db.proposals.create({ data: { proposal_id: "recovery-fixture-"+name, tenant_id: "synthetic-a", status: "draft", created_by: "synthetic-seller",
      created_by_user_id: "synthetic-seller", invoice_draft_id: "synthetic-"+name, invoice_status: "draft", created_at: new Date() } });
}, 30_000);
afterAll(async () => { if (db) await db.$disconnect(); });
it.skipIf(!enabled)("timbrado, respuesta perdida, recuperación y XML/PDF con HTTP y SQL reales aislados", async () => {
  const first = await Promise.all([stamp(request("normal"), context("normal")), stamp(request("normal"), context("normal"))]);
  expect(first.map(row => row.status).sort()).toEqual([200, 409]);
  expect((await read("normal")).invoice_status).toBe("stamped");
  expect((await stamp(request("normal"), context("normal"))).status).toBe(409);
  expect((await stamp(request("lost"), context("lost"))).status).toBe(502);
  expect((await read("lost")).invoice_status).toBe("stamping");
  expect((await reconcile(query(), context("lost"))).status).toBe(409);
  // A valid UUID from another issued invoice must never be attached.
  expect((await reconcile(request("lost", "11111111-2222-4333-8444-555555555555"), context("lost"))).status).toBe(502);
  expect((await read("lost")).invoice_status).toBe("stamping");
  const uuid = "22222222-2222-4333-8444-555555555555";
  expect((await reconcile(request("lost", uuid), context("lost"))).status).toBe(200);
  expect((await reconcile(request("lost", uuid), context("lost"))).status).toBe(200);
  const saved = await read("lost"); expect(saved.invoice_uuid).toBe(uuid);
  const snapshot = await state();
  const download = await xml(new Request("http://localhost/xml"), context("lost"));
  expect(download.status).toBe(200); expect(await download.text()).toBe(snapshot.issued[uuid]);
  const printed = await pdf(new Request("http://localhost/pdf"), context("lost"));
  expect(printed.status).toBe(200); expect(Buffer.from(await printed.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  // A pre-send read racing ahead of the original HTTP request keeps the claim.
  expect(await claim("synthetic-a", "recovery-fixture-not-sent", "synthetic-not-sent")).toBe(true);
  expect((await reconcile(query(), context("not-sent"))).status).toBe(409);
  expect((await read("not-sent")).invoice_status).toBe("stamping");
  expect((await stamp(request("rejected"), context("rejected"))).status).toBe(422);
  expect((await read("rejected")).invoice_status).toBe("rejected");
  const final = await state();
  expect(final.sent).toEqual({ "synthetic-normal": 1, "synthetic-lost": 1, "synthetic-rejected": 1 });
  expect(final.metrics).toBe(2); expect(final.retrieved[uuid]).toBe(1);
}, 30_000);
