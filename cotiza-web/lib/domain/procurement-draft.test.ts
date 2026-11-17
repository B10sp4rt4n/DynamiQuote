import { describe,expect,it } from "vitest";
import { procurementActionSchema,procurementEligibility,validateProcurementBasis,type ProcurementBasis } from "./procurement-draft";
import type { WinCase } from "./won-consolidation";
const fingerprint="a".repeat(64);
const current:WinCase={revision:3,policyRevision:1,rules:[],fingerprint,acceptedOn:"2026-11-01",acceptedAt:"2026-11-01T10:00:00.000Z",
  acceptedBy:"seller",acceptanceEvidence:"Aceptación de prueba",decisions:{},consolidatedAt:"2026-11-02T10:00:00.000Z",cancelledAt:null};
export const basis:ProcurementBasis={schemaVersion:1,tenantId:"a",proposalId:"p",proposalNumber:"PROP-SYNTHETIC",formalDocId:"f",quoteId:"q",opportunityId:null,
  customer:"Empresa de prueba",subject:"Licencias de prueba",currency:"USD",terms:"Condiciones aprobadas",fingerprint,winRevision:3,policyRevision:1,
  acceptedAt:current.acceptedAt,consolidatedAt:current.consolidatedAt!,acceptedBy:"seller",acceptanceEvidence:current.acceptanceEvidence,approvals:[],
  items:[{itemId:"i",itemNumber:1,sku:"TEST",description:"Licencia de prueba",quantity:2,costUnit:10,subtotalCost:20,componentType:"product",origin:"vendor"}]};
describe("procurement draft prerequisites and exact approved basis",()=>{
  it("requires an actual consolidated circuit, not just a won label or acceptance",()=>{
    expect(procurementEligibility(null,"won","approved",fingerprint)).toBeTruthy();
    expect(procurementEligibility({...current,consolidatedAt:null},null,"approved",fingerprint)).toBeTruthy();
    expect(procurementEligibility({...current,cancelledAt:"2026-11-03T00:00:00.000Z"},"won","approved",fingerprint)).toBeTruthy();
    expect(procurementEligibility(current,"won","draft",fingerprint)).toBeTruthy();
    expect(procurementEligibility(current,"won","approved","b".repeat(64))).toBeTruthy();
    expect(procurementEligibility(current,"won","approved",fingerprint)).toBeNull();
  });
  it("requires every recorded OK even if a stored circuit claims consolidation",()=>{
    const rule={id:"finance",label:"Finanzas",approverRoles:["owner" as const],approverUserIds:[],allowSelfApproval:true,evidenceRequired:true,allowWaiver:false,dependsOn:[],minimumAmount:null,currency:null};
    expect(procurementEligibility({...current,rules:[rule]},"won","approved",fingerprint)).toContain("autorizaciones");
    expect(procurementEligibility({...current,rules:[rule],decisions:{finance:{decision:"approved",actorId:"owner",actorRole:"owner",recordedAt:current.acceptedAt,evidence:"Anticipo confirmado"}}},"won","approved",fingerprint)).toBeNull();
  });
  it("keeps source currency, quantities, free support and exact cost reconciliation",()=>{
    const result=validateProcurementBasis({...basis,items:[...basis.items,{...basis.items[0],itemId:"free",itemNumber:2,costUnit:0,subtotalCost:0}]});
    expect(result.currency).toBe("USD");expect(result.items.map(i=>i.subtotalCost)).toEqual([20,0]);
  });
  it.each([
    {...basis,currency:null},{...basis,items:[]},{...basis,items:[{...basis.items[0],description:""}]},
    {...basis,items:[{...basis.items[0],costUnit:-1}]},{...basis,items:[{...basis.items[0],quantity:0}]},
    {...basis,items:[{...basis.items[0],subtotalCost:21}]},{...basis,items:[basis.items[0],basis.items[0]]},
  ])("rejects incomplete or inconsistent purchasing data",value=>expect(()=>validateProcurementBasis(value)).toThrow());
  it("accepts only the preparation metadata, revision and pinned close",()=>{
    expect(procurementActionSchema.safeParse({action:"prepare",expectedWinRevision:3,expectedFingerprint:fingerprint}).success).toBe(true);
    expect(procurementActionSchema.safeParse({action:"prepare",expectedWinRevision:3,expectedFingerprint:fingerprint,tenantId:"b"}).success).toBe(false);
    expect(procurementActionSchema.safeParse({action:"update",draftId:"00000000-0000-4000-8000-000000000001",expectedRevision:1,notes:"Entrega parcial",neededOn:"2026-02-30"}).success).toBe(false);
    expect(procurementActionSchema.safeParse({action:"send",draftId:"00000000-0000-4000-8000-000000000001"}).success).toBe(false);
  });
});
