import "server-only";
import { getDocumentProxy } from "unpdf";
import { parseThreatDownQuote } from "@/lib/domain/threatdown-quote";
import { QuoteInputError } from "@/lib/domain/quote-input";

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
      const items = content.items.filter((i): i is typeof i & { str: string; transform: number[]; width: number } =>
        "str" in i && Boolean(i.str.trim())).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
      const rows: typeof items[] = [];
      for (const item of items) {
        const previous = rows.at(-1);
        if (previous && Math.abs(previous[0].transform[5] - item.transform[5]) < 2) previous.push(item);
        else rows.push([item]);
      }
      const text = rows.map((row) => row.sort((a, b) => a.transform[4] - b.transform[4]).map((item, i, all) => {
        const previous = all[i - 1];
        const gap = previous ? item.transform[4] - previous.transform[4] - previous.width : 0;
        return `${i ? gap > 15 ? "   " : " " : ""}${item.str}`;
      }).join("")).join("\n");
      length += text.length;
      if (length > 300_000) throw new QuoteInputError("El contenido del PDF supera el límite de lectura.");
      pages.push(text);
    }
    return parseThreatDownQuote(pages.join("\n"));
  } finally {
    await pdf.loadingTask.destroy();
  }
}
