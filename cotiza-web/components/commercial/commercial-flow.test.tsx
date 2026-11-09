import { expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/link",()=>({default:({children,...props}:React.ComponentProps<"a">)=><a {...props}>{children}</a>}));
import { CommercialFlow } from "./commercial-flow";
import { businessBillingSection, type WorkspaceProposal } from "@/lib/domain/business-follow-up";
it("keeps the current section separate from recorded progress and links billing to its exact proposal",()=>{
 const html=renderToStaticMarkup(<CommercialFlow current={1} completed={[true,true,true]} summaries={["Ganada","1 cotización","1 autorizada"]}
  billing={{href:"/propuestas/winner#facturacion",label:"Pendiente de preparar"}}/>);
 expect(html).toContain("4. Facturación"); expect(html).toContain("grid-cols-2");
 expect(html).toContain('href="/propuestas/winner#facturacion"');expect(html).toContain("Pendiente de preparar");
 expect(html.match(/aria-current="page"/g)).toHaveLength(1);expect(html.match(/Avance registrado/g)).toHaveLength(3);
});
const winner:WorkspaceProposal={proposal_id:"winner",status:"approved",outcome:"won",formal_proposals:[]};
it("derives billing from evidence without inferring payment or SAT validity",()=>{
 expect(businessBillingSection([winner],true,"opp").label).toBe("Pendiente de preparar");
 for(const [input,label] of [[{invoice_draft_id:"draft"},"Prefactura preparada"],[{invoice_status:"stamping"},"Timbrado por verificar"],
  [{invoice_uuid:"uuid"},"CFDI registrado"],[{invoice_status:"stamped"},"Registro fiscal incompleto"]] as const)
  expect(businessBillingSection([{...winner,...input}],true,"opp").label).toBe(label);
 expect(businessBillingSection([{...winner,status:"draft"}],true,"opp").label).toBe("Autorización pendiente");
});
it("keeps disabled, missing and ambiguous billing on the business's own documents",()=>{
 for(const [proposals,enabled,review] of [[[winner],false,false],[[],true,false],[[winner,{...winner,proposal_id:"other"}],true,false],[[winner],true,true]] as const){
  const section=businessBillingSection(proposals,enabled,"opp",review);
  expect(section.href).toBe("/oportunidades/opp#propuestas");expect(section.label).not.toBe("Pendiente de preparar");
 }
});
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
