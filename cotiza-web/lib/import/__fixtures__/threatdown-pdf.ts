// An actual, synthetic PDF for the reader/route regression tests. No customer data.
export function syntheticThreatDownPdf() {
  const lines = [
    "ThreatDown Limited",
    "Quotation - Preliminary",
    "Quote #: Q-123456",
    "Expires On: 11/30/2026",
    "LICENSE TO: (If Applicable)",
    "Cliente sintetico",
    "Subscription Start Date: 11/01/2026",
    "Subscription End Date: 10/31/2029",
    "Subscription Term: 36",
    "PURCHASE SUMMARY",
    "PRODUCT NUMBER PRODUCT NAME QTY NET UNIT NET TOTAL",
    "TDADVS36B1 ThreatDown Advanced EDR Server 2 USD 300.00 10.00 USD 540.00 35.00 USD 123.45 USD 246.90",
    "MPSNC36S01 ThreatDown Standard Support 1 USD 0.00 0.00 USD 0.00 20.00 USD 0.00 USD 0.00",
    "Subtotal USD 246.90",
    "Terms and Conditions",
  ];
  const content = lines.map((line, i) =>
    "BT /F1 8 Tf 30 " + (750 - i * 18) + " Td (" + line.replace(/[\\()]/g, "\\$&") + ") Tj ET",
  ).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 900] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += (i + 1) + " 0 obj\n" + object + "\nendobj\n";
  }
  const xref = Buffer.byteLength(pdf);
  pdf += "xref\n0 6\n0000000000 65535 f \n"
    + offsets.map((offset) => String(offset).padStart(10, "0") + " 00000 n \n").join("")
    + "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return new TextEncoder().encode(pdf);
}
