/** Offline review of the real printed-CFDI renderer. No DB, PAC or remote fonts.
 * ESBUILD_MODULE=/path/to/esbuild node scripts/render_cfdi_pdf.mjs XML OUTPUT [status]
 * Keep real XML and generated customer PDFs outside the repository.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../cotiza-web/', import.meta.url));
const require = createRequire(root + 'package.json');
const { build } = require(process.env.ESBUILD_MODULE || 'esbuild');
const [input, output, status = ''] = process.argv.slice(2);
if (!input || !output) throw new Error('Pass the local stamped XML path and PDF output path');
const cache = root + 'node_modules/.cache/cfdi-offline-review';
await mkdir(cache, { recursive: true });
const outfile = cache + '/render.mjs';
await build({ stdin: { contents: `import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {renderToBuffer} from '@react-pdf/renderer';
import {CfdiDocument} from ${JSON.stringify(root + 'lib/pdf/cfdi-document.tsx')};
import {parseCfdiXml} from ${JSON.stringify(root + 'lib/pdf/cfdi-xml.ts')};
import {buildCfdiQrDataUrl} from ${JSON.stringify(root + 'lib/pdf/cfdi-qr.ts')};
const [input,output,status]=process.argv.slice(2);
const cfdi=parseCfdiXml((await readFile(input)).toString('base64'));
if(!cfdi.timbre.uuid||!cfdi.sello||!cfdi.timbre.selloSAT)throw new Error('A stamped XML is required');
const qrDataUrl=await buildCfdiQrDataUrl(cfdi);
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,await renderToBuffer(CfdiDocument({cfdi,proposalNumber:cfdi.folio??cfdi.timbre.uuid,qrDataUrl,fiscalStatus:status})));
console.log(JSON.stringify({rendered:true,output}));`, loader: 'tsx', resolveDir: root },
  bundle: true, packages: 'external', platform: 'node', format: 'esm', jsx: 'automatic',
  tsconfig: root + 'tsconfig.json', outfile,
  plugins: [{ name: 'offline-server-boundary', setup(b) {
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'offline' }));
    b.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: 'export {};', loader: 'js' }));
  } }],
});
const result = spawnSync(process.execPath, [outfile, path.resolve(input), path.resolve(output), status], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
