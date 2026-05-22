import { describe, expect, it } from "vitest";

import { enforceRateLimit } from "@/lib/utils/rate-limit";

// Prefija claves con Math.random() para aislar estado global entre pruebas
function key(suffix: string): string {
  return `test:${Math.random().toString(36).slice(2)}:${suffix}`;
}

describe("enforceRateLimit", () => {
  it("permite la primera solicitud", () => {
    const result = enforceRateLimit(key("basic"), 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("permite solicitudes hasta el limite", () => {
    const k = key("limit");
    for (let i = 0; i < 3; i++) {
      const result = enforceRateLimit(k, 3, 60_000);
      expect(result.allowed).toBe(true);
    }
    const overflow = enforceRateLimit(k, 3, 60_000);
    expect(overflow.allowed).toBe(false);
    expect(overflow.remaining).toBe(0);
  });

  it("rechaza solicitudes por encima del limite", () => {
    const k = key("block");
    enforceRateLimit(k, 1, 60_000);
    const second = enforceRateLimit(k, 1, 60_000);
    expect(second.allowed).toBe(false);
  });

  it("resetea el bucket tras ventana vencida", async () => {
    const k = key("reset");
    enforceRateLimit(k, 1, 1);
    // Esperar 5ms para que el bucket venza
    await new Promise((r) => setTimeout(r, 5));
    const result = enforceRateLimit(k, 1, 60_000);
    expect(result.allowed).toBe(true);
  });

  it("diferentes claves tienen buckets independientes", () => {
    const k1 = key("ind-a");
    const k2 = key("ind-b");
    enforceRateLimit(k1, 1, 60_000);
    enforceRateLimit(k1, 1, 60_000);
    const result = enforceRateLimit(k2, 1, 60_000);
    expect(result.allowed).toBe(true);
  });

  it("devuelve resetAt en el futuro", () => {
    const before = Date.now();
    const result = enforceRateLimit(key("future"), 5, 10_000);
    expect(result.resetAt).toBeGreaterThan(before);
  });
});
