// @vitest-environment jsdom
import { act, useMemo, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuoteGroupSummary } from "@/lib/db/quotes";
import { QuoteShell } from "./quote-shell";

const m = vi.hoisted(() => ({
  search: "", listeners: new Set<() => void>(),
  replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), fetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/cotizaciones",
  useRouter: () => ({ replace: m.replace, push: m.push, refresh: m.refresh }),
  useSearchParams: () => {
    const search = useSyncExternalStore((listener) => {
      m.listeners.add(listener);
      return () => { m.listeners.delete(listener); };
    }, () => m.search);
    return useMemo(() => new URLSearchParams(search), [search]);
  },
}));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("recharts", () => ({
  Cell: () => null, Pie: () => null, PieChart: () => null,
  ResponsiveContainer: () => null, Tooltip: () => null,
}));

function quote(version: number, group = "COT-0066"): QuoteGroupSummary {
  return { quoteId: `${group}-v${version}`, quoteGroupId: group, version, versionCount: 4,
    status: "draft", clientName: "Cliente de prueba", proposalName: "Escenario de prueba",
    createdAt: "2026-10-26T12:00:00.000Z", playbookName: "General", totalRevenue: version * 100, avgMargin: 20 };
}
const versions = [4, 3, 2, 1].map((version) => ({ ...quote(version), sentAt: null, rejectedAt: null, closedAt: null }));
const line = (id: string) => ({ lineId: `${id}-line`, sku: "TEST", description: `Partida ${id}`,
  quantity: 1, costUnit: 80, priceUnit: 100, marginPct: 20, classification1: "product", classification2: "" });
let root: Root;
let container: HTMLDivElement;

async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
function historyRow(version: number) {
  const row = [...container.querySelectorAll("tr")].find((item) => item.querySelector("td")?.textContent?.startsWith(`v${version}`));
  if (!row) throw new Error(`No history for v${version}`);
  return row;
}
async function view(version: number) {
  await act(async () => { (historyRow(version).querySelector("button") as HTMLButtonElement).click(); });
  await settle();
}
async function render(requestedQuote: QuoteGroupSummary | null = null) {
  await act(async () => { root.render(<QuoteShell currentTenantSlug="test" items={[quote(4), quote(1, "COT-0065")]}
    requestedQuote={requestedQuote} tenantName="Tenant de prueba" tenantOptions={[]} />); });
  await settle();
}

beforeEach(() => {
  vi.clearAllMocks();
  m.search = "quoteId=COT-0066-v4";
  m.listeners.clear();
  m.replace.mockImplementation((url: string) => {
    m.search = url.split("?")[1] ?? "";
    m.listeners.forEach((listener) => listener());
  });
  m.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const id = url.split("/")[3];
    if (url.endsWith("/versions")) return { ok: true, json: async () => ({ currentQuoteId: id, quoteGroupId: "COT-0066", versions }) };
    if (url.endsWith("/lines") && init?.method === "PUT") {
      return { ok: true, json: async () => ({ quote: quote(2), lines: [line(id)], versionCreated: false,
        totals: { avgMargin: 20, grossProfit: 20, totalCost: 80, totalRevenue: 100 } }) };
    }
    if (url.endsWith("/lines")) return { ok: true, json: async () => ({ lines: [line(id)] }) };
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", m.fetch);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("quote version navigation through the real shell and editor", () => {
  it("opens v3, then v2 and returns to v4 without the latest-groups fallback bouncing selection", async () => {
    await render();
    for (const version of [3, 2, 4]) {
      await view(version);
      expect((container.querySelector("#quote-selector") as HTMLSelectElement).value).toBe(`COT-0066-v${version}`);
      expect(historyRow(version).textContent).toContain("(actual)");
      expect([...container.querySelectorAll("input")].some((input) => input.value === `Partida COT-0066-v${version}`)).toBe(true);
      expect(m.search).toBe(`quoteId=COT-0066-v${version}`);
    }
    expect(m.fetch.mock.calls.every(([, init]) => !init || init.method === "GET")).toBe(true);
  });

  it("loads the exact historical version from the server on a reload instead of opening v4 first", async () => {
    m.search = "quoteId=COT-0066-v2";
    await render(quote(2));
    expect((container.querySelector("#quote-selector") as HTMLSelectElement).value).toBe("COT-0066-v2");
    expect(historyRow(2).textContent).toContain("(actual)");
    expect(m.fetch).not.toHaveBeenCalledWith("/api/quotes/COT-0066-v4/lines", expect.anything());
    expect(m.search).toBe("quoteId=COT-0066-v2");
  });

  it("keeps the working version when the seller declines to discard unsaved changes", async () => {
    await render();
    const add = [...container.querySelectorAll("button")].find((button) => button.textContent === "+ Partida")!;
    await act(async () => add.click());
    vi.mocked(window.confirm).mockReturnValue(false);
    await view(2);
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(historyRow(4).textContent).toContain("(actual)");
    expect(m.search).toBe("quoteId=COT-0066-v4");
  });

  it("saving v2 keeps the group's latest version at v4 and keeps v2 selected", async () => {
    await render();
    await view(2);
    const save = [...container.querySelectorAll("button")].find((button) => button.textContent === "Guardar")!;
    await act(async () => save.click());
    await settle();
    expect(m.fetch).toHaveBeenCalledWith("/api/quotes/COT-0066-v2/lines", expect.objectContaining({ method: "PUT" }));
    const options = [...container.querySelectorAll<HTMLSelectElement>("#quote-selector option")].map((option) => option.textContent);
    expect(options.filter((text) => text?.startsWith("COT-0066"))).toEqual([
      "COT-0066 · v4 · Borrador — Cliente de prueba", "COT-0066 · v2 · Borrador — Cliente de prueba",
    ]);
    expect(historyRow(2).textContent).toContain("(actual)");
  });

  it("ignores a delayed v3 response after the seller has already opened v2", async () => {
    const defaultFetch = m.fetch.getMockImplementation()!;
    let resolveV3!: (value: unknown) => void;
    m.fetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/quotes/COT-0066-v3/lines") return new Promise((resolve) => { resolveV3 = resolve; });
      return defaultFetch(url, init);
    });
    await render();
    await view(3);
    await view(2);
    await act(async () => resolveV3({ ok: true, json: async () => ({ lines: [line("COT-0066-v3")] }) }));
    const values = [...container.querySelectorAll("input")].map((input) => input.value);
    expect(values).toContain("Partida COT-0066-v2");
    expect(values).not.toContain("Partida COT-0066-v3");
    expect(historyRow(2).textContent).toContain("(actual)");
  });
});
