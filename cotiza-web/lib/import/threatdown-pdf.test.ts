import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readThreatDownPdf } from "./threatdown-pdf";
import { syntheticThreatDownPdf } from "./__fixtures__/threatdown-pdf";

describe("original PDF bytes after extraction", () => {
  it("preserves the original for evidence, hashing and a repeat read", async () => {
    const bytes = syntheticThreatDownPdf();
    const original = Uint8Array.from(bytes);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const quote = await readThreatDownPdf(bytes);
    expect(quote.quoteNumber).toBe("Q-123456");
    expect(quote.lines.map(line => line.quantity)).toEqual([2, 1]);
    expect(bytes).toEqual(original);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
    // PostgreSQL serializes a Uint8Array through its underlying ArrayBuffer.
    expect(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)).toEqual(Buffer.from(original));
    expect((await readThreatDownPdf(bytes)).quoteNumber).toBe(quote.quoteNumber);
  });
});

describe("PDF limits", () => {
  it("rejects false PDF and oversize files before extraction", async () => {
    await expect(readThreatDownPdf(new TextEncoder().encode("not PDF"))).rejects.toThrow("PDF válido");
    await expect(readThreatDownPdf(new Uint8Array(3 * 1024 * 1024 + 1))).rejects.toThrow("PDF válido");
  });
});
// Private input files stay outside git. Opt in only with copies the operator owns.
describe.skipIf(!process.env.THREATDOWN_PDF_TEST_DIR)("real ThreatDown PDF extraction", () => {
  it.each([
    ["td-selanusa-Q795488.pdf", "Q-795488", 6114.15, [5,245,1], [31.64,24.31,0]],
    ["td-distmar-Q760396.pdf", "Q-760396", 466.17, [21,1,1], [20.46,36.51,0]],
  ] as const)("extracts and reconciles %s", async (name, quoteNumber, netTotal, quantities, costs) => {
    const q = await readThreatDownPdf(new Uint8Array(await readFile(join(process.env.THREATDOWN_PDF_TEST_DIR!, name))));
    expect(q.quoteNumber).toBe(quoteNumber); expect(q.netTotal).toBe(netTotal);
    expect(q.lines.map((l) => l.quantity)).toEqual(quantities);
    expect(q.lines.map((l) => l.costUnit)).toEqual(costs);
  });
});
