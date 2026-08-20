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
