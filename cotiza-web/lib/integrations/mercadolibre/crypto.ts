import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mercadoLibreConfig } from "./config";

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const nonce = () => randomBytes(32).toString("base64url");
export const challenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

// AAD prevents copying ciphertext between companies, accounts or OAuth attempts.
export function seal(value: string, context: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", mercadoLibreConfig().key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function unseal(value: string, context: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw Error("Invalid encrypted credential");
  const cipher = createDecipheriv("aes-256-gcm", mercadoLibreConfig().key, Buffer.from(iv, "base64url"));
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(encrypted, "base64url")), cipher.final()]).toString("utf8");
}
