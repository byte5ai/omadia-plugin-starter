#!/usr/bin/env node
/**
 * check-sdk-drift.mjs — #468: has @omadia/plugin-api / @omadia/channel-sdk's
 * exported surface moved since types/omadia-*.d.ts was last synced?
 *
 * Compares exported symbols + printed type signatures (TypeScript compiler
 * API), not byte equality — see scripts/lib/sdk-drift.mjs for the "why".
 *
 * Usage:
 *   node scripts/check-sdk-drift.mjs --omadia-dir <path> [--ref <label>] [--report <path>]
 *
 * <path> must be a checkout of byte5ai/omadia with BOTH SDK packages already
 * built, i.e.:
 *
 *   cd <path>/middleware && npm ci \
 *     && npm run build -w @omadia/plugin-api -w @omadia/channel-sdk
 *
 * Exit codes:
 *   0 — no drift found
 *   1 — usage/setup error (bad path, packages not built, ...)
 *   2 — drift found. This is a REPORT, not a build failure — the caller
 *       (CI workflow) decides what to do with it (open an issue, etc).
 */

import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectReferencedSymbols,
  diffExports,
  extractAmbientModuleExports,
  extractRealModuleExports,
  hasRelevantDrift,
  scopeMissing,
} from './lib/sdk-drift.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGES = [
  {
    key: 'pluginApi',
    label: '@omadia/plugin-api',
    stubPath: path.join(REPO_ROOT, 'types/omadia-plugin-api.d.ts'),
    ambientModuleName: '@omadia/plugin-api',
    realEntryRel: 'middleware/packages/plugin-api/dist/index.d.ts',
    buildHint: 'npm run build -w @omadia/plugin-api',
  },
  {
    key: 'channelSdk',
    label: '@omadia/channel-sdk',
    stubPath: path.join(REPO_ROOT, 'types/omadia-channel-sdk.d.ts'),
    ambientModuleName: '@omadia/channel-sdk',
    realEntryRel: 'middleware/packages/harness-channel-sdk/dist/index.d.ts',
    buildHint: 'npm run build -w @omadia/channel-sdk',
  },
];

function parseArgs(argv) {
  const args = { report: null, ref: 'unknown' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--omadia-dir') args.omadiaDir = argv[++i];
    else if (a === '--report') args.report = argv[++i];
    else if (a === '--ref') args.ref = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.omadiaDir) throw new Error('--omadia-dir is required');
  args.omadiaDir = path.resolve(args.omadiaDir);
  return args;
}

function fail(message) {
  console.error(`check-sdk-drift: ${message}`);
  process.exit(1);
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    return;
  }

  const results = {};
  let anyDrift = false;

  for (const pkg of PACKAGES) {
    const realEntry = path.join(args.omadiaDir, pkg.realEntryRel);
    if (!existsSync(realEntry)) {
      fail(
        `${realEntry} does not exist. Build ${pkg.label} first ` +
          `(from <omadia>/middleware: ${pkg.buildHint}).`,
      );
      return;
    }
    if (!existsSync(pkg.stubPath)) {
      fail(`${pkg.stubPath} does not exist.`);
      return;
    }

    const real = extractRealModuleExports(realEntry);
    const stub = extractAmbientModuleExports(pkg.stubPath, pkg.ambientModuleName);
    // The stub is the curated authoring contract, so raw `missing` over the
    // full export surface is scope difference, not drift (the first real run
    // found 324 of them in plugin-api alone). Itemize only the missing
    // symbols this repo's own examples/docs actually reference; the rest is
    // reported as a count. `stale`/`changed` stay unscoped — they break
    // authors regardless.
    const referenced = collectReferencedSymbols(
      [path.join(REPO_ROOT, 'examples'), path.join(REPO_ROOT, 'docs')],
      pkg.ambientModuleName,
      new Set(real.keys()),
    );
    const scoped = scopeMissing(diffExports(real, stub), referenced);
    const drift = hasRelevantDrift(scoped);
    anyDrift = anyDrift || drift;

    results[pkg.key] = {
      label: pkg.label,
      exportedByReal: real.size,
      exportedByStub: stub.size,
      referencedByRepo: referenced.size,
      hasDrift: drift,
      ...scoped,
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    omadiaRef: args.ref,
    hasDrift: anyDrift,
    packages: results,
  };

  const json = JSON.stringify(report, null, 2);
  if (args.report) writeFileSync(args.report, json);

  if (!anyDrift) {
    console.log(`No drift. (${PACKAGES.map((p) => p.label).join(', ')} match ${args.ref}.)`);
    process.exit(0);
  }

  for (const r of Object.values(results)) {
    if (!r.hasDrift) continue;
    console.log(`\n${r.label}:`);
    if (r.missing.length) {
      console.log(`  missing from stub (referenced by examples/docs, absent from stub): ${r.missing.join(', ')}`);
    }
    if (r.missingOutOfScope > 0) {
      console.log(`  (${String(r.missingOutOfScope)} further real exports absent from the stub but referenced nowhere in this repo — scope difference, not drift)`);
    }
    if (r.stale.length) {
      console.log(`  stale in stub (stub exports these, real no longer does): ${r.stale.join(', ')}`);
    }
    if (r.changed.length) {
      console.log(`  signature changed: ${r.changed.map((c) => c.name).join(', ')}`);
    }
  }
  if (args.report) console.log(`\nFull report written to ${args.report}`);
  process.exit(2);
}

main();
