import "server-only";
import { getDocumentProxy } from "unpdf";
import { parseThreatDownQuote } from "@/lib/domain/threatdown-quote";
import { QuoteInputError } from "@/lib/domain/quote-input";

type PdfTextItem = { str: string; transform: number[]; width: number };

function rowText(row: PdfTextItem[]) {
  return row.sort((a, b) => a.transform[4] - b.transform[4]).map((item, i, all) => {
    const previous = all[i - 1];
    const gap = previous ? item.transform[4] - previous.transform[4] - previous.width : 0;
    return `${i ? gap > 15 ? "   " : " " : ""}${item.str}`;
  }).join("");
}

function joinWrappedAmounts(rows: PdfTextItem[][]) {
  const sku = /^[A-Z][A-Z0-9-]{3,119}(?:\s|$)/;
  for (let index = 0; index < rows.length; index++) {
    if (!/^[A-Z][A-Z0-9-]{3,119}\s+ThreatDown\b/.test(rowText(rows[index]).trim())) continue;
    const continuation: PdfTextItem[] = [];
    for (let next = index + 1; next < rows.length; next++) {
      const first = rowText(rows[next]).trim();
      if (sku.test(first) || /^(Subtotal|Tax|Total|Terms and Conditions|Page\s+\d)\b/.test(first)) break;
      continuation.push(...rows[next]);
    }
    for (const currency of rows[index].filter(item => item.str.trim() === "USD")) {
      // ThreatDown right-aligns money cells. A wrapped amount must stay in the
      // same column and SKU; never infer it from a different price or total.
      const right = currency.transform[4] + currency.width;
      const matches = continuation.filter(item => /^[\d,]+\.\d{2}$/.test(item.str.trim())
        && Math.abs(item.transform[4] + item.width - right) < 2);
      if (matches.length !== 1) continue;
      currency.str = `USD ${matches[0].str.trim()}`;
      for (let next = index + 1; next < rows.length; next++) {
        rows[next] = rows[next].filter(item => item !== matches[0]);
      }
    }
  }
}

export async function readThreatDownPdf(bytes: Uint8Array) {
  if (bytes.length > 3 * 1024 * 1024 || Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") {
    throw new QuoteInputError("Adjunta un PDF válido de hasta 3 MB.");
  }
  const pdf = await getDocumentProxy(bytes);
  try {
    if (pdf.numPages > 10) throw new QuoteInputError("El PDF supera el límite de 10 páginas.");
    const pages: string[] = [];
    let length = 0;
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      const items = content.items.filter((i): i is typeof i & PdfTextItem =>
        "str" in i && Boolean(i.str.trim())).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
      const rows: typeof items[] = [];
      for (const item of items) {
        const previous = rows.at(-1);
        if (previous && Math.abs(previous[0].transform[5] - item.transform[5]) < 2) previous.push(item);
        else rows.push([item]);
      }
      joinWrappedAmounts(rows);
      const text = rows.map(rowText).join("\n");
      length += text.length;
      if (length > 300_000) throw new QuoteInputError("El contenido del PDF supera el límite de lectura.");
      pages.push(text);
    }
    return parseThreatDownQuote(pages.join("\n"));
  } finally {
    await pdf.loadingTask.destroy();
  }
}
