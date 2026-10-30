import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), tenant: vi.fn(), user: vi.fn(), capability: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => <span>Account</span> }));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw Error("redirect"); }, usePathname: () => "/crm" }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/lib/auth/clerk", () => ({ hasClerkCredentials: () => true }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { app_users: { findFirst: m.user } } }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: m.capability }));
vi.mock("@/components/layout/expiry-alerts-bell", () => ({ ExpiryAlertsBell: () => null }));
vi.mock("@/components/ui/cotiza-brand", () => ({ CotizaBrand: () => <span>Cotiza</span> }));
import Layout from "./layout";
beforeEach(() => {
  vi.clearAllMocks(); m.auth.mockResolvedValue({ userId: "seller" });
  m.tenant.mockResolvedValue({ id: "sys", name: "Sys", userId: "seller", authMode: "clerk", isSuperAdmin: false, userRole: "user" });
  m.user.mockResolvedValue({ role: "user", tenant_id: "sys" }); m.capability.mockResolvedValue(true);
});
it("shows the active CRM entry for a linked seller in an enabled tenant", async () => {
  const html = renderToStaticMarkup(await Layout({ children: <p>Page content</p> }));
  expect(html).toContain('href="/crm"'); expect(html).toContain('aria-current="page"'); expect(m.capability).toHaveBeenCalledWith("sys", "crm_workspace_pilot");
});
it.each(["disabled", "inactive", "foreign"])("hides the CRM entry when access is %s", async reason => {
  if (reason === "disabled") m.capability.mockResolvedValue(false);
  else m.user.mockResolvedValue(reason === "inactive" ? null : { role: "user", tenant_id: "foreign" });
  const html = renderToStaticMarkup(await Layout({ children: <p>Page content</p> })); expect(html).not.toContain('href="/crm"');
});
it("redirects an absent Clerk session before reading the CRM access policy", async () => {
  m.auth.mockResolvedValue({ userId: null }); await expect(Layout({ children: null })).rejects.toThrow("redirect"); expect(m.user).not.toHaveBeenCalled();
});
