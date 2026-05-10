import path from "node:path";
import type { NextConfig } from "next";

const workspaceRoot = path.join(__dirname, "..");

const devPort = process.env["PORT"] ?? "3000";
const codespaceHost =
  process.env["CODESPACE_NAME"] && process.env["GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"]
    ? `${process.env["CODESPACE_NAME"]}-${devPort}.${process.env["GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"]}`
    : undefined;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", codespaceHost].filter(
    (value): value is string => Boolean(value),
  ),
  outputFileTracingRoot: workspaceRoot,
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "127.0.0.1:3000", codespaceHost].filter(
        (value): value is string => Boolean(value),
      ),
    },
  },
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
