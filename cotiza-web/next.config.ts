import path from "node:path";
import type { NextConfig } from "next";

// En Vercel el proyecto se despliega directamente desde cotiza-web/, no hay
// directorio padre que trazar. En local (codespace) sí se necesita apuntar
// al monorepo root para que Turbopack resuelva node_modules correctamente.
const isVercel = Boolean(process.env["VERCEL"]);
const workspaceRoot = path.join(__dirname, "..");

const devPort = process.env["PORT"] ?? "3000";
const codespaceHost =
  process.env["CODESPACE_NAME"] && process.env["GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"]
    ? `${process.env["CODESPACE_NAME"]}-${devPort}.${process.env["GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"]}`
    : undefined;

const nextConfig: NextConfig = {
  async headers() {
    return ["/autorizacion-verificable", "/confirmar-autorizacion/:path*"].map(source => ({ source, headers: [
      { key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Frame-Options", value: "DENY" },
      { key: "Cache-Control", value: "no-store, private" },
    ] }));
  },
  allowedDevOrigins: ["localhost", "127.0.0.1", codespaceHost].filter(
    (value): value is string => Boolean(value),
  ),
  // Solo necesario en local para trazar desde el root del monorepo
  ...(isVercel ? {} : { outputFileTracingRoot: workspaceRoot }),
  outputFileTracingIncludes: { "/api/**": ["./public/fonts/*.ttf"] },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "127.0.0.1:3000", codespaceHost].filter(
        (value): value is string => Boolean(value),
      ),
    },
  },
  // Solo necesario en local para que Turbopack resuelva desde el monorepo root
  ...(isVercel ? {} : { turbopack: { root: workspaceRoot } }),
};

export default nextConfig;
