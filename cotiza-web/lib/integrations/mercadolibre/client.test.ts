import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mercadoLibreConfig } from "./config";
import { challenge, nonce, seal, unseal } from "./crypto";
import { exchangeToken, normalizeOrder, searchSales } from "./client";

const order = { id: 2000000000000001, pack_id: 2000000000000002, seller: { id: 123 }, buyer: { id: 456, email: "private@example.invalid" },
  date_created: "2026-11-09T08:00:00-06:00", status: "paid", currency_id: "MXN", total_amount: 1160,
  order_items: [{ item: { id: "MLM123", title: "Producto", seller_sku: "P1" }, quantity: 2, unit_price: 580 }], payments: [{ access_token: "never-retain" }] };
beforeEach(() => {
  vi.stubEnv("MERCADOLIBRE_CLIENT_ID", "12345"); vi.stubEnv("MERCADOLIBRE_CLIENT_SECRET", "synthetic-only");
  vi.stubEnv("MERCADOLIBRE_REDIRECT_URI", "https://cotiza.test/api/integrations/mercadolibre/callback");
  vi.stubEnv("MERCADOLIBRE_TOKEN_KEY", "ab".repeat(32));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Mercado Libre boundaries", () => {
  it("rejects an incomplete, insecure or ambiguous callback configuration", () => {
    for (const url of ["http://cotiza.test/api/integrations/mercadolibre/callback", "https://cotiza.test/other", "https://cotiza.test/api/integrations/mercadolibre/callback?x=1"]) {
      vi.stubEnv("MERCADOLIBRE_REDIRECT_URI", url); expect(() => mercadoLibreConfig()).toThrow();
    }
  });
  it("encrypts credentials with fresh IVs and authenticates tenant/account and integrity", () => {
    const first = seal("synthetic-secret", "t1:s1"), second = seal("synthetic-secret", "t1:s1");
    expect(first).not.toBe(second); expect(first).not.toContain("synthetic-secret");
    expect(unseal(first, "t1:s1")).toBe("synthetic-secret"); expect(() => unseal(first, "t2:s1")).toThrow();
    expect(() => unseal(first.slice(0, -4) + "AAAA", "t1:s1")).toThrow();
    expect(challenge(nonce())).toMatch(/^[\w-]{43}$/);
  });
  it("retains a minimal sale snapshot without payment credentials or buyer contact details", () => {
    const sale = normalizeOrder(order, "123");
    expect(sale).toMatchObject({ orderId: "2000000000000001", packId: "2000000000000002", total: "1160", buyerId: "456" });
    expect(JSON.stringify(sale)).not.toMatch(/private|access_token|payments/);
  });
  it("rejects foreign accounts, unsafe numeric identifiers and incomplete amounts without inventing data", () => {
    expect(() => normalizeOrder(order, "999")).toThrow(/pertenece/);
    for (const change of [{ id: Number.MAX_SAFE_INTEGER + 1 }, { total_amount: -1 }, { total_amount: null }, { order_items: [] }, { currency_id: "" }]) {
      expect(() => normalizeOrder({ ...order, ...change }, "123")).toThrow(/incompleta/);
    }
  });
  it("uses a fixed API host, authorization header and server-selected seller pagination", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [order], paging: { total: 51, offset: 0, limit: 50 } }) });
    vi.stubGlobal("fetch", fetch);
    expect(await searchSales("synthetic-token", "123", 0)).toMatchObject({ total: 51, nextOffset: 1 });
    expect(fetch.mock.calls[0][0]).toBe("https://api.mercadolibre.com/orders/search?seller=123&sort=date_desc&limit=50&offset=0");
    expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store", redirect: "error", headers: { Authorization: "Bearer synthetic-token" } });
  });
  it("does not expose provider bodies and never retries a token exchange on an uncertain response", async () => {
    const fetch = vi.fn().mockRejectedValue(Error("access_token=secret-body")); vi.stubGlobal("fetch", fetch);
    await expect(exchangeToken({ grant_type: "refresh_token", refresh_token: "synthetic" })).rejects.toThrow("No se pudo confirmar");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
