import { createServer, type Server } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
let server: Server | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
});

// Digestor app/api/routers/sat_catalogs_v1.py: Item has extra='forbid' and
// accepts exactly itemNumber, satProductCode and unitCode. Exercise real HTTP
// serialization, not a replacement for validateSatClassifications itself.
it("validates persisted receipts over HTTP without sending internal audit fields to Digestor", async () => {
  const requests: Array<{ path: string; body: unknown }> = [];
  server = createServer(async (req, res) => {
    let bytes = ""; for await (const chunk of req) bytes += chunk;
    const body = JSON.parse(bytes || "{}"); requests.push({ path: req.url!, body });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/auth/login") { res.end(JSON.stringify({ access_token: "synthetic-local-token", expires_in: 60 })); return; }
    if (req.url !== "/v1/sat-catalogs/validate") { res.statusCode = 404; res.end("{}"); return; }
    const allowed = ["itemNumber", "satProductCode", "unitCode"];
    if (body.items.some((item: Record<string, unknown>) => Object.keys(item).some(key => !allowed.includes(key)))) {
      res.statusCode = 422; res.end(JSON.stringify({ detail: "Extra inputs are not permitted" })); return;
    }
    res.end(JSON.stringify({ valid: true }));
  });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw Error("Loopback fixture unavailable");
  vi.stubEnv("DIGESTOR_FISCAL_BASE_URL", `http://127.0.0.1:${address.port}`);
  vi.stubEnv("DIGESTOR_FISCAL_USERNAME", "synthetic"); vi.stubEnv("DIGESTOR_FISCAL_PASSWORD", "synthetic");
  vi.resetModules();
  const { validateSatClassifications } = await import("./digestor-fiscal");
  const catalogVersion = "b".repeat(64);
  const storedReceipt = { itemNumber: 1, satProductCode: "81112500", unitCode: "E48", catalogVersion,
    classificationEventId: `fcl_${"c".repeat(64)}` };
  expect(await validateSatClassifications([storedReceipt], catalogVersion)).toMatchObject({ valid: true });
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual({ path: "/v1/sat-catalogs/validate", body: { catalogVersion,
    items: [{ itemNumber: 1, satProductCode: "81112500", unitCode: "E48" }] } });
});
