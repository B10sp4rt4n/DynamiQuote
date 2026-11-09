// Structural synthetic invoice only; no valid seals, certificate or fiscal operation.
import { REP_XML, RECEIPT_UUID, INVOICE_UUID } from "./synthetic-rep";
export { INVOICE_UUID };
export const INVOICE_XML = REP_XML
  .replace(/<pago20:Pagos[\s\S]*?<\/pago20:Pagos>/, "")
  .replace('TipoDeComprobante="P"', 'TipoDeComprobante="I" MetodoPago="PUE" FormaPago="03"')
  .replace('SubTotal="0" Moneda="XXX" Total="0"', 'SubTotal="100.00" Moneda="MXN" Total="116.00"')
  .replace('UsoCFDI="CP01"', 'UsoCFDI="G03"')
  .replace(/<cfdi:Conceptos>[\s\S]*?<\/cfdi:Conceptos>/, `<cfdi:Conceptos><cfdi:Concepto ClaveProdServ="80101500" Cantidad="1" ClaveUnidad="E48" Descripcion="Servicio sintético" ValorUnitario="100.00" Importe="100.00" ObjetoImp="02"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="100.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="16.00"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos><cfdi:Impuestos TotalImpuestosTrasladados="16.00"><cfdi:Traslados><cfdi:Traslado Base="100.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="16.00"/></cfdi:Traslados></cfdi:Impuestos>`)
  .replace(RECEIPT_UUID, INVOICE_UUID);
export const INVOICE_BASE64 = Buffer.from(INVOICE_XML).toString("base64");
