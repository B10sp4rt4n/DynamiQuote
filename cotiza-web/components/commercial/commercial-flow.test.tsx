import { expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/link",()=>({default:({children,...props}:React.ComponentProps<"a">)=><a {...props}>{children}</a>}));
import { CommercialFlow } from "./commercial-flow";
it("returns to the exact business, quote revision and proposal",()=>{
 const html=renderToStaticMarkup(<CommercialFlow current={3} context={{opportunityId:"opp-a",opportunityNumber:"OPP-0064",title:"Renewal",quoteId:"quote-v1",proposalId:"prop-a"}} next="Review"/>);
 for(const href of ["/oportunidades/opp-a","/cotizaciones?quoteId=quote-v1","/propuestas/prop-a"])expect(html).toContain(`href="${href}"`);
 expect(html).toContain("OPP-0064");expect(html).toContain('aria-current="page"');
 expect(html).toContain("Sección actual");expect(html).not.toMatch(/Pendiente|Completado|Paso anterior|Estás aquí/);
});
it("shows actual documents for a closed business and never asks to restart it",()=>{
 const html=renderToStaticMarkup(<CommercialFlow current={1} context={{opportunityId:"opp-a",stage:"won",title:"Won business"}} hideContext
  summaries={["Ganada","1 cotización · 2 revisiones","1 propuesta · 1 autorizada"]} next="Crea la primera cotización"/>);
 expect(html).toContain("1 cotización · 2 revisiones");expect(html).toContain("1 propuesta · 1 autorizada");
 expect(html).toContain('href="/oportunidades/opp-a#cotizaciones"');
 expect(html).not.toMatch(/Pendiente|Crea la primera cotización|Won business/);
 expect(html).toContain("Consulta el resultado y el seguimiento");
});
it("keeps an unquoted business at its proposal section instead of opening unrelated proposals",()=>{
 const html=renderToStaticMarkup(<CommercialFlow current={1} context={{opportunityId:"opp-a"}} next="Quote"/>);
 expect(html).toContain('href="/cotizaciones?opportunityId=opp-a"');expect(html).toContain('href="/oportunidades/opp-a#propuestas"');expect(html).not.toContain('href="/propuestas"');
});
