import { expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/link",()=>({default:({children,...props}:React.ComponentProps<"a">)=><a {...props}>{children}</a>}));
import { CommercialFlow } from "./commercial-flow";
it("returns to the exact business, quote revision and proposal",()=>{
 const html=renderToStaticMarkup(<CommercialFlow current={3} completed={[1,2]} context={{opportunityId:"opp-a",opportunityNumber:"OPP-0064",title:"Renewal",quoteId:"quote-v1",proposalId:"prop-a"}} next="Review"/>);
 for(const href of ["/oportunidades/opp-a","/cotizaciones?quoteId=quote-v1","/propuestas?proposalId=prop-a"])expect(html).toContain(`href="${href}"`);
 expect(html).toContain("OPP-0064");expect(html).toContain('aria-current="step"');
});
it("keeps an unquoted business at its proposal section instead of opening unrelated proposals",()=>{
 const html=renderToStaticMarkup(<CommercialFlow current={1} context={{opportunityId:"opp-a"}} next="Quote"/>);
 expect(html).toContain('href="/cotizaciones?opportunityId=opp-a"');expect(html).toContain('href="/oportunidades/opp-a#propuestas"');expect(html).not.toContain('href="/propuestas"');
});
