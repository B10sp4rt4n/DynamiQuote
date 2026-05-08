import type { NextConfig } from "next";

const devPort = process.env["PORT"] ?? "3000";
const codespaceHost =
  process.env["CODESPACE_NAME"] && process.env["GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"]
    ? `${process.env["CODESPACE_NAME"]}-${devPort}.${process.env["GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"]}`
    : undefined;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", codespaceHost].filter(
    (value): value is string => Boolean(value),
  ),
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "127.0.0.1:3000", codespaceHost].filter(
        (value): value is string => Boolean(value),
      ),
    },
  },
};

export default nextConfig;
