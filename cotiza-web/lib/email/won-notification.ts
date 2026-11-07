import "server-only";
import { resolveResendConfig } from "./resend";
export type WonEmailMessage = { from: string; to: string; subject: string; text: string };
export type WonSendResult = { kind: "sent"; id: string } | { kind: "retry" | "failed"; code: string };
export type WonMailTransport = { from: string; send: (message: WonEmailMessage, key: string) => Promise<WonSendResult> };
export async function getWonMailTransport(): Promise<WonMailTransport | null> {
  const config = await resolveResendConfig();
  if (!config.client || config.error || !config.from) return null;
  const client = config.client;
  return { from: config.from, async send(message, key) {
    try {
      const response = await client.emails.send(message, { idempotencyKey: key });
      if (response.data?.id) return { kind: "sent", id: response.data.id };
      const error = response.error;
      // Never persist provider error text: it can contain addresses or request contents.
      if (error?.name === "invalid_idempotent_request") return { kind: "failed", code: "idempotency_payload_conflict" };
      const transient = !error?.statusCode || error.statusCode === 429 || error.statusCode >= 500 || error.name === "concurrent_idempotent_requests";
      return { kind: transient ? "retry" : "failed", code: transient ? "provider_retryable" : "provider_rejected" };
    } catch { return { kind: "retry", code: "provider_result_unknown" }; }
  } };
}
