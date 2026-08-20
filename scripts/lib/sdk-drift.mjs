/**
 * sdk-drift.mjs — core extraction + diff logic for the #468 SDK-drift check.
 *
 * `types/omadia-plugin-api.d.ts` and `types/omadia-channel-sdk.d.ts` are
 * hand-maintained ambient stand-ins for `@omadia/plugin-api` and
 * `@omadia/channel-sdk` — packages the Omadia host injects at runtime and
 * never publishes to npm (see the header comment in either stub). The only
 * sync mechanism today is a human occasionally reading the real source.
 *
 * This module answers "has the real SDK's exported API surface moved since
 * the stub was last synced?" by comparing EXPORTED SYMBOLS + their printed
 * TYPE SIGNATURES (via the TypeScript compiler API's type checker), not byte
 * equality — a stub can reformat, reorder or add explanatory comments
 * without that counting as drift, but an added/removed/reshaped export does.
 *
 * Both the stub and the real package resolve to a single TypeScript "module
 * symbol" — the stub via `declare module '<name>' { ... }` (an ambient
 * module the checker can look up by name), the real package via its
 * compiled `dist/index.d.ts` barrel (a normal ES module the checker
 * resolves directly). `checker.getExportsOfModule()` walks every
 * `export * from` / `export { x } from` re-export chain for us, so this
 * does not need to know how many files either side's public surface is
 * spread across.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

/** Compiler options shared by both extraction paths. `skipLibCheck` because
 *  we only need declaration shapes, not a clean compile of the whole tree —
 *  a lib-typing mismatch elsewhere in a large checkout must not block this. */
const BASE_OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  types: ['node'],
  skipLibCheck: true,
  strict: true,
};

/**
 * Strips `import("...").` qualifiers and collapses whitespace, so a type
 * printed as `import("./targetRef.js").TargetRef` (real, cross-file) and the
 * stub's locally-declared `TargetRef` compare equal when they are otherwise
 * the same shape. This is the one deliberate concession to "signature, not
 * byte equality" — it trades a little precision (a genuine rename on the
 * real side could hide behind it) for not drowning every run in import-path
 * noise that has nothing to do with the public contract.
 */
export function normalizeSignature(text) {
  return text
    .replace(/import\([^)]*\)\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function printSymbol(printer, symbol) {
  const decls = symbol.getDeclarations() ?? [];
  return decls
    .map((d) => normalizeSignature(printer.printNode(ts.EmitHint.Unspecified, d, d.getSourceFile())))
    .sort()
    .join('\n---\n');
}

/** name -> normalized printed signature, for every export of a module symbol. */
function collectExports(checker, printer, moduleSymbol) {
  const out = new Map();
  for (const exp of checker.getExportsOfModule(moduleSymbol)) {
    out.set(exp.getName(), printSymbol(printer, exp));
  }
  return out;
}

/**
 * Extracts the export surface of an AMBIENT module declaration, i.e. one of
 * this repo's `types/omadia-*.d.ts` stubs (`declare module '<name>' { ... }`).
 */
export function extractAmbientModuleExports(filePath, moduleName, options = BASE_OPTIONS) {
  const program = ts.createProgram([filePath], options);
  const checker = program.getTypeChecker();
  const printer = ts.createPrinter({ removeComments: true });
  const ambient = checker
    .getAmbientModules()
    .find((m) => m.getName().replace(/^"|"$/g, '') === moduleName);
  if (!ambient) {
    throw new Error(
      `no ambient module named '${moduleName}' found in ${filePath} — did the ` +
        `'declare module' wrapper get renamed or removed?`,
    );
  }
  return collectExports(checker, printer, ambient);
}

/**
 * Extracts the export surface of a REAL compiled entry point, i.e. a built
 * `dist/index.d.ts` for `@omadia/plugin-api` / `@omadia/channel-sdk`. Every
 * sibling `dist/*.d.ts` the entry re-exports from must already exist next to
 * it (a normal `tsc` build produces exactly that).
 */
export function extractRealModuleExports(entryPath, options = BASE_OPTIONS) {
  const program = ts.createProgram([entryPath], options);
  const checker = program.getTypeChecker();
  const printer = ts.createPrinter({ removeComments: true });
  const sourceFile = program.getSourceFile(entryPath);
  if (!sourceFile) {
    throw new Error(`could not load ${entryPath} as a TypeScript source file`);
  }
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    throw new Error(
      `${entryPath} has no resolvable module symbol — is it really a built ` +
        `declaration entry point (does it have top-level exports)?`,
    );
  }
  return collectExports(checker, printer, moduleSymbol);
}

/**
 * Diffs two name -> signature maps.
 *
 *   missing  — real has it, stub does not.   Plugin authors compiling
 *              against the stub cannot see a symbol the host actually
 *              exposes.
 *   stale    — stub has it, real does not.   The stub promises something
 *              that no longer exists — worse than merely incomplete.
 *   changed  — both have it, signatures differ. Could be a genuine breaking
 *              change, or noise the normalizer did not catch (e.g. an
 *              intentional stub simplification like `Router` -> `unknown`
 *              to avoid an express dependency) — a human call either way.
 */
export function diffExports(real, stub) {
  const missing = [];
  const stale = [];
  const changed = [];
  const names = new Set([...real.keys(), ...stub.keys()]);
  for (const name of [...names].sort()) {
    const r = real.get(name);
    const s = stub.get(name);
    if (r !== undefined && s === undefined) missing.push(name);
    else if (r === undefined && s !== undefined) stale.push(name);
    else if (r !== s) changed.push({ name, real: r, stub: s });
  }
  return { missing, stale, changed };
}

export function hasDrift(diff) {
  return diff.missing.length > 0 || diff.stale.length > 0 || diff.changed.length > 0;
}

// ---------------------------------------------------------------------------
// Missing-scope: the stub IS the curation (#468 follow-up)
// ---------------------------------------------------------------------------
//
// The first real run against byte5ai/omadia found 324 "missing" exports in
// @omadia/plugin-api alone — because that package exports entire internal
// domains (knowledge graph, nudges, bulk promotion, ...) alongside the actual
// plugin-authoring contract. The stub was hand-written to cover what a plugin
// AUTHOR compiles against, so "real has it, stub does not" is, for most of
// that surface, a scope difference by construction — not drift.
//
// The fix is NOT a second hand-maintained allowlist (a curation list that
// itself drifts is the exact disease this tool treats). The relevance source
// is the repo itself:
//
//   - every named import from the SDK modules in `examples/**/*.ts` — if a
//     template imports it, authors copy it;
//   - every backticked identifier in `docs/**/*.md` that names a real export —
//     if the docs tell authors about it, its absence from the stub misleads.
//
// `stale` and `changed` stay unscoped on purpose: they are inherently limited
// to the stub's own surface and are the classes that BREAK authors.

/**
 * Named bindings imported from `moduleName` across every `.ts` file under
 * `dirs`, plus backticked identifiers in every `.md` under `dirs` that name a
 * real export (`realNames`). Returns a Set of symbol names.
 *
 * Import parsing is line-based on purpose — the examples are small template
 * files, and a full program parse would need module resolution for files whose
 * imports (the SDK itself) deliberately do not resolve outside the host.
 */
export function collectReferencedSymbols(dirs, moduleName, realNames) {
  const referenced = new Set();
  const importRe = new RegExp(
    String.raw`import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]` +
      moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      String.raw`['"]`,
    'g',
  );
  for (const dir of dirs) {
    for (const file of walkFiles(dir)) {
      if (file.endsWith('.ts')) {
        const text = readFileSync(file, 'utf8');
        // Multi-line import clauses: normalise whitespace first so the
        // line-based regex sees `import {\n  A,\n  B,\n} from '...'` whole.
        const flat = text.replace(/\s+/g, ' ');
        for (const m of flat.matchAll(importRe)) {
          for (const raw of m[1].split(',')) {
            // `Foo as Bar` references Foo; `type Foo` references Foo.
            const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
            if (name !== '') referenced.add(name);
          }
        }
      } else if (file.endsWith('.md')) {
        const text = readFileSync(file, 'utf8');
        for (const m of text.matchAll(/`([A-Za-z_$][A-Za-z0-9_$]*)`/g)) {
          if (realNames.has(m[1])) referenced.add(m[1]);
        }
      }
    }
  }
  return referenced;
}

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * Splits a diff's `missing` list by relevance. Itemized `missing` shrinks to
 * the referenced names; everything else becomes a COUNT (`missingOutOfScope`),
 * still visible but never the thing that opens or floods an issue. `stale` and
 * `changed` pass through untouched.
 */
export function scopeMissing(diff, referenced) {
  const missing = diff.missing.filter((n) => referenced.has(n));
  return {
    missing,
    missingOutOfScope: diff.missing.length - missing.length,
    stale: diff.stale,
    changed: diff.changed,
  };
}

/** Drift that should open/refresh the weekly issue, post-scoping. */
export function hasRelevantDrift(scoped) {
  return scoped.missing.length > 0 || scoped.stale.length > 0 || scoped.changed.length > 0;
}
