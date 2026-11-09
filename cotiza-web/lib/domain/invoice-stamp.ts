import { XMLParser, XMLValidator } from "fast-xml-parser";
const CFDI = "http://www.sat.gob.mx/cfd/4", TFD = "http://www.sat.gob.mx/TimbreFiscalDigital";
export const INVOICE_UUID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
type Node = Record<string, unknown>;
function namespaces(node: Node, parent: Record<string, string>) {
  const result = { ...parent };
  for (const [key, value] of Object.entries(node)) {
    if (key === "@xmlns") result[""] = String(value);
    if (key.startsWith("@xmlns:")) result[key.slice(7)] = String(value);
  }
  return result;
}
function children(node: Node, parent: Record<string, string>, uri: string, local: string) {
  const result: Array<{ node: Node; ns: Record<string, string> }> = [];
  for (const [name, value] of Object.entries(node)) {
    if (name.startsWith("@") || name.startsWith("?") || name.startsWith("#")) continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (!child || typeof child !== "object") continue;
      const ns = namespaces(child, parent), parts = name.split(":"), prefix = parts.length === 2 ? parts[0] : "";
      if (parts.at(-1) === local && ns[prefix] === uri) result.push({ node: child, ns });
    }
  }
  return result;
}
/** Structural identity/integrity only; does not certify seals or SAT status. */
export function readInvoiceStamp(encoded: string, expectedUuid?: string | null) {
  if (!encoded || encoded.length > 7_000_000 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw Error("XML fiscal inválido");
  const bytes = Buffer.from(encoded, "base64"), xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw Error("XML fiscal inválido");
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseAttributeValue: false }).parse(xml);
  if (Object.keys(parsed).filter(name => !name.startsWith("?") && !name.startsWith("#")).length !== 1) throw Error("XML fiscal ambiguo");
  const roots = children(parsed, {}, CFDI, "Comprobante");
  if (roots.length !== 1 || roots[0].node["@Version"] !== "4.0" || roots[0].node["@TipoDeComprobante"] !== "I") throw Error("El XML no es una factura CFDI 4.0");
  const root = roots[0];
  if (["Emisor", "Receptor", "Conceptos"].some(name => children(root.node, root.ns, CFDI, name).length !== 1)) throw Error("XML de factura incompleto");
  const stamps = children(root.node, root.ns, CFDI, "Complemento").flatMap(row => children(row.node, row.ns, TFD, "TimbreFiscalDigital"));
  const uuid = stamps.length === 1 ? String(stamps[0].node["@UUID"] ?? "") : "";
  if (!INVOICE_UUID_PATTERN.test(uuid) || (expectedUuid && uuid.toLowerCase() !== expectedUuid.toLowerCase())) throw Error("El UUID no coincide con el XML de la factura");
  return { uuid, bytes };
}
