import { vi } from "vitest";
export function gmailTestEnv() {
  vi.stubEnv("COTIZA_GMAIL_ENABLED","true");vi.stubEnv("COTIZA_GMAIL_TENANT_ID","one");
  vi.stubEnv("COTIZA_GMAIL_ACCOUNT","reader@example.test");vi.stubEnv("COTIZA_GMAIL_CLIENT_ID","synthetic.apps.googleusercontent.com");
  vi.stubEnv("COTIZA_GMAIL_CLIENT_SECRET","synthetic-secret");vi.stubEnv("COTIZA_GMAIL_TOKEN_KEY","ab".repeat(32));
  vi.stubEnv("COTIZA_GMAIL_REDIRECT_URI","https://cotiza.test/api/integrations/gmail/callback");
}
