import { describe, expect, it } from "vitest";

import { NOT_DISCARDED_WHERE } from "@/lib/db/proposal-filters";

describe("NOT_DISCARDED_WHERE", () => {
  it("pide el outcome NULL de forma explicita (Prisma `not` excluye los NULL)", () => {
    expect(NOT_DISCARDED_WHERE.OR).toContainEqual({ outcome: null });
  });

  it("excluye solo 'discarded', no ganada ni perdida", () => {
    expect(NOT_DISCARDED_WHERE.OR).toContainEqual({ outcome: { not: "discarded" } });
  });
});
