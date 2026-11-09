import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ auth: vi.fn(), inbox: vi.fn(), sync: vi.fn(), disconnect: vi.fn(), begin: vi.fn(), consume: vi.fn(), connect: vi.fn(), exchange: vi.fn(), cookie: vi.fn() }));
vi.mock("@/lib/integrations/mercadolibre/access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/mercadolibre/access")>("@/lib/integrations/mercadolibre/access");
  return { ...actual, authorizeMercadoLibre: m.auth };
});
vi.mock("@/lib/auth/tenant-context", () => ({})); vi.mock("@/lib/db/prisma", () => ({}));
vi.mock("@/lib/integrations/mercadolibre/store", () => ({ readInbox: m.inbox, syncSales: m.sync, disconnectAccount: m.disconnect, beginAuthorization: m.begin, consumeAuthorization: m.consume, connectAccount: m.connect }));
vi.mock("@/lib/integrations/mercadolibre/client", () => ({ exchangeToken: m.exchange }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: m.cookie }) }));
import { GET, POST } from "./route";
import { POST as begin } from "./connect/route";
import { GET as callback } from "./callback/route";
import { MercadoLibreError } from "@/lib/integrations/mercadolibre/config";
const req = (value: unknown) => new Request("https://cotiza.test/api/integrations/mercadolibre", { method: "POST", body: JSON.stringify(value), headers: { origin: "https://cotiza.test" } });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("MERCADOLIBRE_CLIENT_ID", "123"); vi.stubEnv("MERCADOLIBRE_CLIENT_SECRET", "synthetic");
  vi.stubEnv("MERCADOLIBRE_TOKEN_KEY", "ab".repeat(32)); vi.stubEnv("MERCADOLIBRE_REDIRECT_URI", "https://cotiza.test/api/integrations/mercadolibre/callback");
  m.auth.mockResolvedValue({ tenantId: "server-tenant", actorId: "server-actor" });
  m.inbox.mockResolvedValue({ connection: null, sales: [], total: 0 }); m.consume.mockResolvedValue("verifier");
  m.exchange.mockResolvedValue({ access_token: "synthetic" }); m.cookie.mockReturnValue({ value: "browser-secret" });
});
afterEach(() => vi.unstubAllEnvs());
it("uses only the authenticated company and rejects caller-selected tenant or seller IDs", async () => {
  expect((await POST(req({ action: "sync", offset: 0, tenantId: "foreign" }))).status).toBe(422);
  expect((await POST(req({ action: "sync", offset: 0, sellerId: "foreign" }))).status).toBe(422);
  expect(m.sync).not.toHaveBeenCalled(); await POST(req({ action: "sync", offset: 50 }));
  expect(m.sync).toHaveBeenCalledWith("server-tenant", "server-actor", 50);
});
it("never reaches data when authorization fails and returns private uncached responses", async () => {
  m.auth.mockRejectedValue(new MercadoLibreError("Access denied", 403));
  const response = await GET(new Request("https://cotiza.test/api"));
  expect(response.status).toBe(403); expect(response.headers.get("cache-control")).toBe("no-store"); expect(m.inbox).not.toHaveBeenCalled();
});
it("creates a browser-bound one-use PKCE attempt with a secure HTTP-only cookie", async () => {
  const response = await begin(req({})), data = await response.json(), url = new URL(data.url);
  expect(url.origin).toBe("https://auth.mercadolibre.com.mx"); expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(m.begin.mock.calls[0].slice(0, 2)).toEqual(["server-tenant", "server-actor"]);
  expect(response.headers.get("set-cookie")).toMatch(/__Host-cotiza_ml=.*Secure.*HttpOnly/i);
  expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
});
it("rejects missing browser state, provider denial and replay before exchanging a code", async () => {
  const state = "a".repeat(43), url = `https://cotiza.test/api/integrations/mercadolibre/callback?code=synthetic&state=${state}`;
  m.cookie.mockReturnValue(undefined); expect((await callback(new Request(url))).headers.get("location")).toContain("connection=failed");
  expect(m.exchange).not.toHaveBeenCalled(); m.cookie.mockReturnValue({ value: "browser-secret" });
  m.consume.mockRejectedValue(new MercadoLibreError("replayed", 422));
  await callback(new Request(url)); expect(m.exchange).not.toHaveBeenCalled();
});
it("completes authorization with bound actor/state and removes the cookie without leaking the code", async () => {
  const state = "a".repeat(43), response = await callback(new Request(`https://cotiza.test/api/integrations/mercadolibre/callback?code=private-code&state=${state}`));
  expect(m.connect).toHaveBeenCalledWith("server-tenant", "server-actor", { access_token: "synthetic" }, state);
  expect(response.headers.get("location")).toBe("https://cotiza.test/configuracion/integraciones/mercadolibre?connection=connected");
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});
