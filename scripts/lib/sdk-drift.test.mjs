/**
 * Wiring test for #468's drift detector: does injected drift actually make
 * `diffExports` fire, or does the check just look plausible while silently
 * comparing nothing? (The failure mode this guards against is the same
 * shape as the golden-eval guard that stayed green with no API key
 * configured — a check that can never go red is not a check.)
 *
 * Runs against small in-memory fixture ".d.ts" files rather than a real
 * omadia checkout, so it stays fast and network-free; the real packages are
 * only exercised by the scheduled CI workflow.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { diffExports, extractAmbientModuleExports, extractRealModuleExports, hasDrift } from './sdk-drift.mjs';

function withTmpDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sdk-drift-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A real-package-shaped fixture: a plain module with top-level exports,
 *  mirroring what a built `dist/index.d.ts` (+ inlined siblings) looks
 *  like after declaration emit. */
const REAL_FIXTURE = `
export interface Widget {
  id: string;
  label: string;
}
export function createWidget(id: string): Widget;
export declare const WIDGET_VERSION: 1;
`;

/** The stub-shaped counterpart: an ambient module declaration, matching
 *  types/omadia-*.d.ts's own \`declare module '<name>' { ... }\` wrapper. */
function stubFixture(body) {
  return `declare module '@fixture/widgets' {\n${body}\n}\n`;
}

const STUB_FIXTURE_MATCHING = stubFixture(`
  export interface Widget {
    id: string;
    label: string;
  }
  export function createWidget(id: string): Widget;
  export declare const WIDGET_VERSION: 1;
`);

test('identical real/stub fixtures report zero drift', () => {
  withTmpDir((dir) => {
    const realPath = path.join(dir, 'real.d.ts');
    const stubPath = path.join(dir, 'stub.d.ts');
    writeFileSync(realPath, REAL_FIXTURE);
    writeFileSync(stubPath, STUB_FIXTURE_MATCHING);

    const real = extractRealModuleExports(realPath);
    const stub = extractAmbientModuleExports(stubPath, '@fixture/widgets');
    const diff = diffExports(real, stub);

    assert.equal(hasDrift(diff), false, JSON.stringify(diff));
    assert.deepEqual(diff.missing, []);
    assert.deepEqual(diff.stale, []);
    assert.deepEqual(diff.changed, []);
  });
});

test('MUTATION: an export added to the real side and never mirrored in the stub is caught as "missing"', () => {
  withTmpDir((dir) => {
    const realPath = path.join(dir, 'real.d.ts');
    const stubPath = path.join(dir, 'stub.d.ts');
    // Real side gained a new export the stub was never updated for.
    writeFileSync(realPath, `${REAL_FIXTURE}\nexport function destroyWidget(id: string): void;\n`);
    writeFileSync(stubPath, STUB_FIXTURE_MATCHING);

    const real = extractRealModuleExports(realPath);
    const stub = extractAmbientModuleExports(stubPath, '@fixture/widgets');
    const diff = diffExports(real, stub);

    assert.equal(hasDrift(diff), true);
    assert.deepEqual(diff.missing, ['destroyWidget']);
    assert.deepEqual(diff.stale, []);
    assert.deepEqual(diff.changed, []);
  });
});

test('MUTATION: an export removed from the real side but left in the stub is caught as "stale"', () => {
  withTmpDir((dir) => {
    const realPath = path.join(dir, 'real.d.ts');
    const stubPath = path.join(dir, 'stub.d.ts');
    writeFileSync(realPath, REAL_FIXTURE);
    // Stub still promises a function the real SDK no longer has.
    writeFileSync(
      stubPath,
      stubFixture(`
        export interface Widget {
          id: string;
          label: string;
        }
        export function createWidget(id: string): Widget;
        export declare const WIDGET_VERSION: 1;
        export function destroyWidget(id: string): void;
      `),
    );

    const real = extractRealModuleExports(realPath);
    const stub = extractAmbientModuleExports(stubPath, '@fixture/widgets');
    const diff = diffExports(real, stub);

    assert.equal(hasDrift(diff), true);
    assert.deepEqual(diff.missing, []);
    assert.deepEqual(diff.stale, ['destroyWidget']);
    assert.deepEqual(diff.changed, []);
  });
});

test('MUTATION: a reshaped signature (new required field) on the real side is caught as "changed"', () => {
  withTmpDir((dir) => {
    const realPath = path.join(dir, 'real.d.ts');
    const stubPath = path.join(dir, 'stub.d.ts');
    // Widget grew a required field on the real side; the stub is unaware.
    writeFileSync(
      realPath,
      `
export interface Widget {
  id: string;
  label: string;
  ownerId: string;
}
export function createWidget(id: string): Widget;
export declare const WIDGET_VERSION: 1;
`,
    );
    writeFileSync(stubPath, STUB_FIXTURE_MATCHING);

    const real = extractRealModuleExports(realPath);
    const stub = extractAmbientModuleExports(stubPath, '@fixture/widgets');
    const diff = diffExports(real, stub);

    assert.equal(hasDrift(diff), true);
    assert.deepEqual(diff.missing, []);
    assert.deepEqual(diff.stale, []);
    assert.deepEqual(
      diff.changed.map((c) => c.name),
      ['Widget'],
    );
  });
});

test('cross-file import() qualifiers on the real side do not by themselves count as drift', () => {
  // Guards the normalizer: a type re-exported from a sibling compiled file
  // prints as `import("./other.js").Foo` on the real side but as a bare
  // `Foo` in the stub's inline declaration — that must not be "changed".
  withTmpDir((dir) => {
    const realPath = path.join(dir, 'real.d.ts');
    const stubPath = path.join(dir, 'stub.d.ts');
    writeFileSync(
      realPath,
      `
export interface Ref {
  target: import("./other.js").TargetKind;
}
`,
    );
    writeFileSync(
      stubPath,
      stubFixture(`
        export interface Ref {
          target: TargetKind;
        }
        export type TargetKind = string;
      `),
    );

    const real = extractRealModuleExports(realPath);
    const stub = extractAmbientModuleExports(stubPath, '@fixture/widgets');
    const diff = diffExports(real, stub);

    // TargetKind itself is legitimately missing from the real side's export
    // list in this fixture (it lives in the sibling file, not re-exported
    // here) — that is real drift-shaped signal, not the thing this test is
    // isolating. What matters is that `Ref` itself is NOT flagged "changed"
    // purely because of the import() qualifier.
    assert.ok(!diff.changed.some((c) => c.name === 'Ref'), JSON.stringify(diff.changed));
  });
});

test('extractAmbientModuleExports throws a clear error when the module name is wrong', () => {
  withTmpDir((dir) => {
    const stubPath = path.join(dir, 'stub.d.ts');
    writeFileSync(stubPath, STUB_FIXTURE_MATCHING);
    assert.throws(
      () => extractAmbientModuleExports(stubPath, '@fixture/does-not-exist'),
      /no ambient module named/,
    );
  });
});
