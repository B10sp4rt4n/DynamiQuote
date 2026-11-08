// Entirely synthetic: no real taxpayer, certificate, payment or PAC operation.
export const RECEIPT_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
export const INVOICE_UUID = '11111111-2222-4333-8444-555555555555';
export const REP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
 Version="4.0" Serie="RP" Folio="PRUEBA-SINTETICA-001" Fecha="2026-11-07T12:00:00" SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="P" LugarExpedicion="01000"
 NoCertificado="00000000000000000000" Sello="${'SINTETICO'.repeat(35)}" Certificado="c3ludGhldGlj">
 <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMISOR SINTETICO DE PRUEBAS" RegimenFiscal="601"/>
 <cfdi:Receptor Rfc="BBB010101BBB" Nombre="RECEPTOR SINTETICO DE PRUEBAS" DomicilioFiscalReceptor="01000" RegimenFiscalReceptor="601" UsoCFDI="CP01"/>
 <cfdi:Conceptos><cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/></cfdi:Conceptos>
 <cfdi:Complemento><pago20:Pagos Version="2.0"><pago20:Totales MontoTotalPagos="58.00" TotalTrasladosBaseIVA16="50.00" TotalTrasladosImpuestoIVA16="8.00"/>
 <pago20:Pago FechaPago="2026-11-06T10:30:00" FormaDePagoP="03" MonedaP="MXN" Monto="58.00">
 <pago20:DoctoRelacionado IdDocumento="${INVOICE_UUID}" MonedaDR="MXN" NumParcialidad="1" ImpSaldoAnt="116.00" ImpPagado="58.00" ImpSaldoInsoluto="58.00" ObjetoImpDR="02"/>
 </pago20:Pago></pago20:Pagos>
 <tfd:TimbreFiscalDigital Version="1.1" UUID="${RECEIPT_UUID}" FechaTimbrado="2026-11-07T12:01:00" RfcProvCertif="AAA010101AAA" SelloCFD="c3ludGhldGlj" NoCertificadoSAT="00000000000000000000" SelloSAT="${'SINTETICO'.repeat(35)}"/>
 </cfdi:Complemento></cfdi:Comprobante>`;
export const REP_BASE64 = Buffer.from(REP_XML).toString('base64');
