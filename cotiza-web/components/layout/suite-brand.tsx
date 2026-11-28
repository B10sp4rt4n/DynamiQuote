import Link from "next/link";
import experience from "@/lib/suite/experience.json";

export function SuiteBrand({ companyName }: { companyName: string }) {
  return (
    <div className="cdc-brand-context">
      <Link href="/inicio" className="cdc-brand" aria-label="CDC Suite · Inicio">
        <span className="cdc-mark" aria-hidden="true">C</span>
        <span>
          <span className="cdc-brand-title">{experience.brand}</span>
          <span className="cdc-subtitle">Comercial · Cotiza</span>
        </span>
      </Link>
      <div className="cdc-company">
        <span className="cdc-label">Empresa activa</span>
        <span className="cdc-company-name">{companyName}</span>
      </div>
    </div>
  );
}
