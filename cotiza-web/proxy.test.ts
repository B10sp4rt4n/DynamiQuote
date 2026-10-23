import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";

const m = vi.hoisted(() => ({ middleware: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: () => m.middleware,
  createRouteMatcher: () => () => true,
}));
vi.mock("@/lib/auth/clerk", () => ({ hasClerkCredentials: () => true }));
import proxy, { config } from "./proxy";

describe("application maintenance boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.middleware.mockReturnValue(NextResponse.next());
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["GET", "/clientes/example"], ["HEAD", "/propuestas/example/pdf"],
    ["GET", "/api/settings/test-email"], ["POST", "/api/webhooks/clerk"],
    ["POST", "/api/quotes"], ["PUT", "/api/proposals/example"],
    ["PATCH", "/api/settings/users/example"], ["DELETE", "/api/quotes/example"],
    ["POST", "/clientes/example"], ["OPTIONS", "/api/quotes"],
  ])("pauses %s %s before auth or handlers", async (method, pathname) => {
    vi.stubEnv("CRM_MAINTENANCE_MODE", "paused");
    const response = await proxy(new NextRequest(`https://example.com${pathname}`, { method }), {} as NextFetchEvent);
    expect(response?.status).toBe(503);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(response?.headers.get("retry-after")).toBe("300");
    expect(m.middleware).not.toHaveBeenCalled();
  });

  it("fails closed for an invalid nonempty mode", async () => {
    vi.stubEnv("CRM_MAINTENANCE_MODE", "puased");
    expect((await proxy(new NextRequest("https://example.com/api/quotes"), {} as NextFetchEvent))?.status).toBe(503);
    expect(m.middleware).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "off"])("restores existing auth in mode %s", async (mode) => {
    vi.stubEnv("CRM_MAINTENANCE_MODE", mode);
    await proxy(new NextRequest("https://example.com/cotizaciones"), {} as NextFetchEvent);
    expect(m.middleware).toHaveBeenCalledOnce();
  });

  it.each(["/api/exports/report.xlsx", "/api/webhooks/clerk", "/clientes/report.csv", "/clientes/id"])("matcher includes %s", (path) => {
    expect(config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path))).toBe(true);
  });
});
