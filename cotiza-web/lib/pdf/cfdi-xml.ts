import "server-only";

import { XMLParser } from "fast-xml-parser";

// Parsea el XML CFDI 4.0 timbrado (con complemento TimbreFiscalDigital) que
// regresa TimbraCFDI via Digestor Fiscal. Solo se usa para armar la
// representacion impresa propia de Cotiza -- nunca se reenvia ni se vuelve a
// timbrar desde aqui.

export type ParsedCfdiConcepto = {
  cantidad: number;
  claveProdServ: string;
  claveUnidad: string;
  descripcion: string;
  importe: number;
  noIdentificacion: string | null;
  objetoImp: string;
  valorUnitario: number;
};

export type ParsedCfdi = {
  emisor: {
    nombre: string;
    regimenFiscal: string;
    rfc: string;
  };
  receptor: {
    domicilioFiscalReceptor: string | null;
    nombre: string;
    regimenFiscalReceptor: string;
    rfc: string;
    usoCFDI: string;
  };
  cadenaOriginal: string;
  conceptos: ParsedCfdiConcepto[];
  fecha: string;
  folio: string | null;
  formaPago: string | null;
  lugarExpedicion: string;
  metodoPago: string | null;
  moneda: string;
  noCertificado: string;
  sello: string;
  serie: string | null;
  subTotal: number;
  timbre: {
    fechaTimbrado: string;
    noCertificadoSAT: string;
    rfcProvCertif: string;
    selloCFD: string;
    selloSAT: string;
    uuid: string;
  };
  tipoDeComprobante: string;
  total: number;
  totalImpuestosTrasladados: number | null;
};

const parser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  isArray: (name) => name === "Concepto" || name === "Traslado",
  removeNSPrefix: true,
});

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export function parseCfdiXml(xmlBase64: string): ParsedCfdi {
  const xml = Buffer.from(xmlBase64, "base64").toString("utf-8");
  const parsed = parser.parse(xml) as {
    Comprobante: Record<string, unknown> & {
      Complemento?: { TimbreFiscalDigital?: Record<string, unknown> };
      Conceptos?: { Concepto?: Array<Record<string, unknown>> };
      Emisor: Record<string, unknown>;
      Impuestos?: { TotalImpuestosTrasladados?: string };
      Receptor: Record<string, unknown>;
    };
  };

  const comprobante = parsed.Comprobante;
  const emisor = comprobante.Emisor;
  const receptor = comprobante.Receptor;
  const timbre = comprobante.Complemento?.TimbreFiscalDigital;
  const conceptosRaw = comprobante.Conceptos?.Concepto ?? [];

  if (!timbre) {
    throw new Error("El XML no trae el complemento TimbreFiscalDigital -- no se puede armar la representacion impresa.");
  }

  // La cadena original NO viene como texto en el XML -- se calcula con la
  // plantilla oficial del SAT para TFD 1.1 (cadenaoriginal_TFD_1_1.xslt).
  const cadenaOriginal = `||1.1|${timbre.UUID}|${timbre.FechaTimbrado}|${timbre.RfcProvCertif}|${timbre.SelloCFD}|${timbre.NoCertificadoSAT}||`;

  return {
    cadenaOriginal,
    conceptos: conceptosRaw.map((c) => ({
      cantidad: toNumber(c.Cantidad),
      claveProdServ: String(c.ClaveProdServ ?? ""),
      claveUnidad: String(c.ClaveUnidad ?? ""),
      descripcion: String(c.Descripcion ?? ""),
      importe: toNumber(c.Importe),
      noIdentificacion: c.NoIdentificacion ? String(c.NoIdentificacion) : null,
      objetoImp: String(c.ObjetoImp ?? ""),
      valorUnitario: toNumber(c.ValorUnitario),
    })),
    emisor: {
      nombre: String(emisor.Nombre ?? ""),
      regimenFiscal: String(emisor.RegimenFiscal ?? ""),
      rfc: String(emisor.Rfc ?? ""),
    },
    fecha: String(comprobante.Fecha ?? ""),
    folio: comprobante.Folio ? String(comprobante.Folio) : null,
    formaPago: comprobante.FormaPago ? String(comprobante.FormaPago) : null,
    lugarExpedicion: String(comprobante.LugarExpedicion ?? ""),
    metodoPago: comprobante.MetodoPago ? String(comprobante.MetodoPago) : null,
    moneda: String(comprobante.Moneda ?? "MXN"),
    noCertificado: String(comprobante.NoCertificado ?? ""),
    receptor: {
      domicilioFiscalReceptor: receptor.DomicilioFiscalReceptor ? String(receptor.DomicilioFiscalReceptor) : null,
      nombre: String(receptor.Nombre ?? ""),
      regimenFiscalReceptor: String(receptor.RegimenFiscalReceptor ?? ""),
      rfc: String(receptor.Rfc ?? ""),
      usoCFDI: String(receptor.UsoCFDI ?? ""),
    },
    sello: String(comprobante.Sello ?? ""),
    serie: comprobante.Serie ? String(comprobante.Serie) : null,
    subTotal: toNumber(comprobante.SubTotal),
    timbre: {
      fechaTimbrado: String(timbre.FechaTimbrado ?? ""),
      noCertificadoSAT: String(timbre.NoCertificadoSAT ?? ""),
      rfcProvCertif: String(timbre.RfcProvCertif ?? ""),
      selloCFD: String(timbre.SelloCFD ?? ""),
      selloSAT: String(timbre.SelloSAT ?? ""),
      uuid: String(timbre.UUID ?? ""),
    },
    tipoDeComprobante: String(comprobante.TipoDeComprobante ?? ""),
    total: toNumber(comprobante.Total),
    totalImpuestosTrasladados: comprobante.Impuestos?.TotalImpuestosTrasladados
      ? toNumber(comprobante.Impuestos.TotalImpuestosTrasladados)
      : null,
  };
}
