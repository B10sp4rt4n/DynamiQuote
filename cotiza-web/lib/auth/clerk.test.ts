import { afterEach, expect, it, vi } from "vitest";
import { hasClerkCredentials } from "@/lib/auth/clerk";

afterEach(() => vi.unstubAllEnvs());
it.each([
  ["", "", false],
  ["pk_configured", "", false],
  ["", "sk_configured", false],
  ["pk_configured", "sk_configured", true],
])("requires both Clerk keys (publishable=%s, secret=%s)", (publishable, secret, expected) => {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", publishable);
  vi.stubEnv("CLERK_SECRET_KEY", secret);
  expect(hasClerkCredentials()).toBe(expected);
});
