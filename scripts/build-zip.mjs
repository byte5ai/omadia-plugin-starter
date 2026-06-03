#!/usr/bin/env node
/**
 * build-zip.mjs — compile an Omadia plugin/channel and produce an uploadable ZIP.
 *
 * Run it from a plugin package directory (it reads ./package.json from the
 * current working directory):
 *
 *     npm run build        # → out/<id>-<version>.zip
 *
 * Why esbuild and not plain `tsc`?
 *   The Omadia host resolves a plugin's bare imports against ITS OWN
 *   node_modules. Anything the host does NOT already ship (e.g. discord.js,
 *   @slack/web-api, an SDK you add) must therefore be BUNDLED into
 *   dist/plugin.js. We esbuild-bundle `src/plugin.ts` → `dist/plugin.js`
 *   (ESM), keeping only the host-provided peers external (see `external`
 *   below). A pure agent with no extra deps bundles to a tiny file all the
 *   same — one code path for every plugin kind.
 *
 * Steps:
 *   1) esbuild bundle  → dist/plugin.js
 *   2) verify the entry exists
 *   3) stage runtime artefacts into out/<id>-<version>-package/
 *   4) zip into out/<id>-<version>.zip
 *
 * Run `npm run typecheck` separately for the tsc gate.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { build } from 'esbuild';

const pkgRoot = process.cwd();

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

const pkg = readJson(join(pkgRoot, 'package.json'));
if (!pkg.name || !pkg.version) {
  throw new Error('package.json: "name" and "version" are required');
}

// --- 1) esbuild bundle -----------------------------------------------------
// ESM banner so any bundled CJS dependency can still call require / __dirname
// / __filename inside the ESM output.
const ESM_BANNER = [
  "import { createRequire as ___createRequire } from 'node:module';",
  "import { fileURLToPath as ___fileURLToPath } from 'node:url';",
  "import { dirname as ___dirname } from 'node:path';",
  'const require = ___createRequire(import.meta.url);',
  'const __filename = ___fileURLToPath(import.meta.url);',
  'const __dirname = ___dirname(__filename);',
].join('\n');

console.log('▶ esbuild bundle');
await build({
  entryPoints: [join(pkgRoot, 'src/plugin.ts')],
  outfile: join(pkgRoot, 'dist/plugin.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
  banner: { js: ESM_BANNER },
  external: [
    // Host-provided peers — NEVER bundle these; the Omadia host supplies them.
    '@omadia/plugin-api',
    '@omadia/channel-sdk',
    'express',
    // Optional native acceleration modules some platform SDKs (discord.js / ws,
    // voice libs, …) load via try/catch. Keeping them external + absent is
    // handled gracefully at runtime. Add your SDK's optionals here as needed.
    'zlib-sync',
    'bufferutil',
    'utf-8-validate',
  ],
});

// --- 2) verify entry -------------------------------------------------------
const entryRel = pkg.main ?? 'dist/plugin.js';
const entryAbs = join(pkgRoot, entryRel);
if (!existsSync(entryAbs) || !statSync(entryAbs).isFile()) {
  throw new Error(`entry not found after bundle: ${entryRel}`);
}

// --- 3) stage runtime artefacts -------------------------------------------
const safeName = pkg.name.replace(/^@/, '').replace(/\//g, '-');
const stageName = `${safeName}-${pkg.version}-package`;
const stageDir = join(pkgRoot, 'out', stageName);
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

// Everything the host needs at runtime. `skills/` ships prompt-partials that
// agents load at activation — it MUST be in the ZIP. node_modules must NOT.
const INCLUDE = ['manifest.yaml', 'package.json', 'dist', 'assets', 'skills', 'README.md', 'LICENSE', 'NOTICE'];
for (const entry of INCLUDE) {
  const src = join(pkgRoot, entry);
  if (!existsSync(src)) continue;
  cpSync(src, join(stageDir, entry), { recursive: true });
}

// --- 4) zip ----------------------------------------------------------------
const zipPath = join(pkgRoot, 'out', `${safeName}-${pkg.version}.zip`);
rmSync(zipPath, { force: true });

const zipRes = spawnSync('zip', ['-r', '-q', zipPath, stageName], {
  cwd: join(pkgRoot, 'out'),
  stdio: 'inherit',
});
if (zipRes.status !== 0) {
  throw new Error('zip CLI failed — on Windows use `7z a` or PowerShell `Compress-Archive`');
}

console.log(`✓ built ${zipPath}`);
