import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/integrations/recordia/access",()=>({recordiaPilotVisible:async()=>false}));
import { renderToStaticMarkup } from "react-dom/server";
const m=vi.hoisted(()=>({context:vi.fn(),tenants:vi.fn(),capability:vi.fn(),policy:vi.fn()}));
vi.mock("next/link",()=>({default:({children,...props}:React.ComponentProps<"a">)=><a {...props}>{children}</a>}));
vi.mock("@clerk/nextjs",()=>({UserButton:()=>null}));
vi.mock("@clerk/nextjs/server",()=>({auth:vi.fn()}));
vi.mock("@/lib/auth/clerk",()=>({hasClerkCredentials:()=>false}));
vi.mock("@/lib/auth/tenant-context",()=>({getCurrentTenantContext:m.context}));
vi.mock("@/lib/db/tenants",()=>({getActiveTenants:m.tenants}));
vi.mock("@/lib/db/won-consolidation",()=>({getWinPolicy:m.policy}));
vi.mock("@/lib/db/tenant-capabilities",()=>({isTenantCapabilityEnabled:m.capability}));
vi.mock("@/components/layout/expiry-alerts-bell",()=>({ExpiryAlertsBell:()=>null}));
vi.mock("@/components/layout/dashboard-nav",()=>({DashboardNav:()=>null}));
import DashboardLayout from "./layout";
beforeEach(()=>{vi.clearAllMocks();m.context.mockResolvedValue({id:"a",name:"Empresa A",slug:"a",userId:"actor",userRole:"owner",isSuperAdmin:false});m.tenants.mockResolvedValue([{id:"a",name:"Empresa A",slug:"a"},{id:"b",name:"Empresa B",slug:"b"}]);m.capability.mockResolvedValue(false);m.policy.mockResolvedValue({rules:[],revision:0});});
it("shows active context without disclosing other companies to a non-superadmin",async()=>{
  const html=renderToStaticMarkup(await DashboardLayout({children:<p>Contenido</p>}));
  expect(html).toContain('class="cdc-label">Empresa activa</span><span class="cdc-company-name">Empresa A</span>');expect(html).not.toContain("Empresa B");expect(html).not.toContain("Cambiar empresa");expect(m.tenants).not.toHaveBeenCalled();
});
it("places the superadmin switcher in the shared header above the page content",async()=>{
  m.context.mockResolvedValue({id:"a",name:"Empresa A",slug:"a",userId:"actor",isSuperAdmin:true});
  const html=renderToStaticMarkup(await DashboardLayout({children:<p>Contenido</p>}));
  expect(html.slice(0,html.indexOf("</header>"))).toContain("Cambiar empresa");expect(html).toContain("Empresa B");expect(m.tenants).toHaveBeenCalledTimes(1);
});
