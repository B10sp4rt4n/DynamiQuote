import "server-only";

import QRCode from "qrcode";

import type { ParsedCfdi } from "@/lib/pdf/cfdi-xml";

// Formato oficial del SAT para el codigo QR de verificacion de un CFDI
// (https://verificacfdi.facturaelectronica.sat.gob.mx). `fe` son los
// ultimos 8 caracteres del sello digital del CFDI (no del SAT).
function buildVerificationUrl(cfdi: ParsedCfdi): string {
  // Conservar la secuencia id, re, rr, tt, fe y el separador inicial ?&id=.
  // El portal SAT requiere ese & inicial para reconocer la consulta del QR.
  const params = new URLSearchParams({
    id: cfdi.timbre.uuid,
    re: cfdi.emisor.rfc,
    rr: cfdi.receptor.rfc,
    tt: cfdi.total.toFixed(6),
    fe: cfdi.sello.slice(-8),
  });
  return `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?&${params.toString()}`;
}

export async function buildCfdiQrDataUrl(cfdi: ParsedCfdi): Promise<string> {
  const url = buildVerificationUrl(cfdi);
  return QRCode.toDataURL(url, { margin: 0, width: 200 });
}
