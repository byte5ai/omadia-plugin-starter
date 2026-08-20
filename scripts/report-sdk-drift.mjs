#!/usr/bin/env node
/**
 * report-sdk-drift.mjs — turns a check-sdk-drift.mjs report into a GitHub
 * issue, via `gh` (must be authenticated — GH_TOKEN in the environment).
 *
 * Drift is expected, not urgent, so this:
 *   - opens ONE issue, labelled `sdk-drift`, the first time drift is seen;
 *   - on every subsequent run while that issue is still open, posts an
 *     update COMMENT instead of opening a second issue (a weekly cron that
 *     opened a fresh issue every week would train everyone to ignore it);
 *   - never fails the workflow itself — see sdk-drift-check.yml, which
 *     treats a completed drift check (exit 0 or 2) as success and only
 *     fails on exit 1 (a setup/script error, not drift).
 *
 * Usage:
 *   node scripts/report-sdk-drift.mjs --report <path> --repo <owner/repo> [--run-url <url>]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const LABEL = 'sdk-drift';
const MAX_NAMES_SHOWN = 25;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--report') args.report = argv[++i];
    else if (a === '--repo') args.repo = argv[++i];
    else if (a === '--run-url') args.runUrl = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.report || !args.repo) throw new Error('--report and --repo are required');
  return args;
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

function truncatedList(names) {
  if (names.length === 0) return '_none_';
  if (names.length <= MAX_NAMES_SHOWN) return names.map((n) => `\`${n}\``).join(', ');
  const shown = names.slice(0, MAX_NAMES_SHOWN).map((n) => `\`${n}\``).join(', ');
  return `${shown}, _and ${String(names.length - MAX_NAMES_SHOWN)} more_`;
}

function renderPackageSection(pkg) {
  const lines = [`### ${pkg.label}`, ''];
  lines.push(`Real exports: ${String(pkg.exportedByReal)} · stub exports: ${String(pkg.exportedByStub)}`, '');
  lines.push(`**Missing from stub** (${String(pkg.missing.length)}) — the real SDK exports these, the stub does not:`);
  lines.push(truncatedList(pkg.missing), '');
  lines.push(`**Stale in stub** (${String(pkg.stale.length)}) — the stub exports these, the real SDK no longer does:`);
  lines.push(truncatedList(pkg.stale), '');
  lines.push(`**Signature changed** (${String(pkg.changed.length)}) — same name, different shape (real call, since the normalizer can only rule out import-path noise, not tell a genuine reshape from an intentional stub simplification):`);
  lines.push(truncatedList(pkg.changed.map((c) => c.name)), '');
  return lines.join('\n');
}

function renderBody(report, runUrl) {
  const sections = Object.values(report.packages).map(renderPackageSection).join('\n\n');
  return [
    `Automated check (#468): \`types/omadia-*.d.ts\` no longer matches \`byte5ai/omadia\` @ \`${report.omadiaRef}\`.`,
    '',
    'This is expected drift, not a broken build — the two packages are never published to npm, so these stubs are the only thing plugin authors compile against, and they only move when someone reads the real source. Reconcile at your convenience; this issue tracks that it is still open.',
    '',
    sections,
    '',
    runUrl ? `Full machine-readable report: ${runUrl} (artifact \`sdk-drift-report\`).` : '',
    '',
    `_Generated ${report.generatedAt} by \`.github/workflows/sdk-drift-check.yml\`. This issue is reused (commented on, not reopened) by future runs while it stays open — close it once the stubs are resynced._`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

function ensureLabelExists(repo) {
  try {
    gh(['label', 'list', '--repo', repo, '--search', LABEL, '--json', 'name']);
  } catch {
    // Non-fatal — `gh issue create --label` will just fail loudly below if
    // the label truly cannot be created, which is a clearer signal than
    // silently swallowing a labelling problem here.
  }
  const existing = JSON.parse(gh(['label', 'list', '--repo', repo, '--json', 'name']));
  if (existing.some((l) => l.name === LABEL)) return;
  gh([
    'label',
    'create',
    LABEL,
    '--repo',
    repo,
    '--color',
    'D4C5F9',
    '--description',
    'Ambient SDK stubs (types/omadia-*.d.ts) are out of sync with byte5ai/omadia (#468).',
  ]);
}

function findOpenIssue(repo) {
  const issues = JSON.parse(
    gh(['issue', 'list', '--repo', repo, '--label', LABEL, '--state', 'open', '--json', 'number,title', '--limit', '5']),
  );
  return issues[0] ?? null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(readFileSync(args.report, 'utf8'));

  if (!report.hasDrift) {
    console.log('report-sdk-drift: report says no drift, nothing to do.');
    return;
  }

  const body = renderBody(report, args.runUrl);

  if (args.dryRun) {
    console.log(body);
    return;
  }

  ensureLabelExists(args.repo);
  const existing = findOpenIssue(args.repo);

  if (existing) {
    gh(['issue', 'comment', String(existing.number), '--repo', args.repo, '--body', body]);
    console.log(`report-sdk-drift: updated existing issue #${String(existing.number)}.`);
    return;
  }

  const title = `SDK drift: types/omadia-*.d.ts out of sync with byte5ai/omadia @ ${report.omadiaRef}`;
  gh(['issue', 'create', '--repo', args.repo, '--title', title, '--body', body, '--label', LABEL]);
  console.log('report-sdk-drift: opened a new issue.');
}

main();
