/** Actual Loom panel; synthetic HTTP only. Never contacts Loom, a tenant DB or an AI provider. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../cotiza-web/", import.meta.url));
const require = createRequire(root + "package.json"), { build } = require(process.env.ESBUILD_MODULE || "esbuild");
const out = await mkdtemp(path.join(tmpdir(), "cotiza-loom-ui-")), artifacts = path.resolve("artifacts/loom-context");
await mkdir(artifacts, { recursive: true });
await build({ stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {LoomContextPanel} from ${JSON.stringify(root + "components/integraciones/loom-context-panel.tsx")};
function App(){const [tenant,setTenant]=useState('tenant-a');return <main className="mx-auto max-w-3xl p-4"><h1>Expediente de prueba</h1><button onClick={()=>setTenant('tenant-b')}>Cambiar empresa de prueba</button><LoomContextPanel tenantId={tenant} targetId="synthetic-client" kind="client"/></main>}
createRoot(document.getElementById('root')).render(<App/>);`, loader: "tsx", resolveDir: root },
  bundle: true, jsx: "automatic", tsconfig: root + "tsconfig.json", outfile: out + "/app.js", define: { "process.env.NODE_ENV": '"production"' } });
const css = await require("postcss")([require("@tailwindcss/postcss")({ base: root })]).process('@import "tailwindcss";', { from: root + "app/globals.css" });
await writeFile(out + "/app.css", css.css);
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  const file = pathname === "/app.js" ? "app.js" : pathname === "/app.css" ? "app.css" : null;
  if (!file && pathname !== "/") { res.writeHead(404); res.end(); return; }
  res.setHeader("Content-Type", file?.endsWith(".js") ? "text/javascript" : file ? "text/css" : "text/html");
  res.end(file ? await readFile(out + "/" + file) : '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body style="font-family:Arial;background:#f4f4f5"><div id="root"></div><script src="/app.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const width of [1360, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], unexpected = []; let reads = 0, previews = 0, writes = 0, fail = false, delay = false, release, delayedStarted;
    const source = "https://www.loom.com/share/" + "a".repeat(32);
    const snapshot = { sourceId: "a".repeat(32), ari: "ari:synthetic", url: source, title: "Reunión comercial sintética",
      type: "ASYNC_VIDEO", createdAt: "2026-11-10T18:00:00Z", durationSeconds: 60,
      transcript: "[0:01] Confirmar cantidades y fecha antes de preparar propuesta.\n" + "Texto de prueba ".repeat(500),
      transcriptStatus: "ready", sourceStatus: "READY", observedAt: "2026-11-10T18:01:00Z" };
    const link = { linkId: "synthetic-link", revision: 1, snapshot };
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) { unexpected.push(url.origin); return route.abort(); }
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname !== "/api/clients/synthetic-client/loom") { unexpected.push(url.pathname); return route.abort(); }
      const tenant = req.headers()["x-tenant-context"];
      if (req.method() === "GET") { reads++; return route.fulfill({ json: { links: [] } }); }
      const input = req.postDataJSON();
      if (input.action === "preview") {
        previews++;
        if (delay) await new Promise(resolve => { release = resolve; delayedStarted?.(); });
        return route.fulfill({ json: { snapshot: { ...snapshot, title: tenant === "tenant-b" ? "Otro expediente" : snapshot.title }, previewToken: "synthetic-reviewed" } }).catch(() => {});
      }
      if (input.action !== "link" || input.previewToken !== "synthetic-reviewed") { unexpected.push(input.action); return route.abort(); }
      writes++;
      return fail ? route.fulfill({ status: 409, json: { error: "La grabación cambió. Revisa de nuevo" } }) : route.fulfill({ status: 201, json: { link, unchanged: false } });
    });
    await page.goto(origin);
    assert.equal(reads, 0);
    await page.getByText("Reuniones y videos · Loom", { exact: true }).click();
    await page.getByText("Todavía no hay grabaciones vinculadas por ti en este expediente.", { exact: true }).waitFor();
    assert.equal(reads, 1); assert.equal(writes, 0);
    await page.getByLabel("Enlace de la grabación", { exact: true }).fill(source);
    await page.getByRole("button", { name: "Revisar grabación", exact: true }).click();
    await page.getByRole("region", { name: "Vista previa de Loom" }).waitFor();
    assert.equal(writes, 0);
    await page.getByText("Ver transcripción", { exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(artifacts, "preview-" + width + ".png"), fullPage: true });
    await page.getByRole("button", { name: "Confirmar vínculo", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Grabación vinculada" }).waitFor();
    assert.equal(writes, 1);
    await page.getByLabel("Enlace de la grabación", { exact: true }).fill(source);
    await page.getByRole("button", { name: "Revisar grabación", exact: true }).click();
    await page.getByRole("region", { name: "Vista previa de Loom" }).waitFor();
    fail = true;
    await page.getByRole("button", { name: "Confirmar vínculo", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "La grabación cambió" }).waitFor();
    assert.equal(await page.getByRole("region", { name: "Vista previa de Loom" }).count(), 0);
    assert.equal(await page.getByRole("article").count(), 1);
    await page.screenshot({ path: path.join(artifacts, "preserved-copy-" + width + ".png"), fullPage: true });
    // A response from an old company must not reappear after changing context.
    fail = false; delay = true;
    const started = new Promise(resolve => { delayedStarted = resolve; });
    await page.getByLabel("Enlace de la grabación", { exact: true }).fill(source);
    await page.getByRole("button", { name: "Revisar grabación", exact: true }).click();
    await started;
    await page.getByRole("button", { name: "Cambiar empresa de prueba", exact: true }).click();
    if (release) release();
    await page.getByText("Reuniones y videos · Loom", { exact: true }).click();
    await page.getByText("Todavía no hay grabaciones vinculadas por ti en este expediente.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("article").count(), 0);
    assert.equal(await page.getByRole("region", { name: "Vista previa de Loom" }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log(JSON.stringify({ width, reads, previews, writes, errors, unexpected, preservedOnFailure: true, clearedOnCompanyChange: true }));
    await page.close();
  }
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
