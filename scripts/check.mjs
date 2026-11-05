// `pnpm check` — every local gate in one command (ADR-0002 §5: no code-host workflows; MOD-Build).
// The licence step is strict (package.json passes --strict) since the 2026-11-04 audit.
// Stops at the first failing step and prints a summary. Includes the Playwright smoke on Chromium and
// WebKit; `pnpm check:fast` (`--no-e2e`) skips it. Wall-clock tests tagged @realtime (A/V sync,
// export speed, worklet underruns) are left out here because parallel worktree builds load the
// machine; run them with `pnpm check:realtime` (6 tests) on a quiet machine at every wave gate and in QA.
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/util.mjs';

const e2e = !process.argv.includes('--no-e2e');
const steps = [
  ['spec lint', 'python3', ['tools/spec_lint.py']],
  ['codegen up to date', 'pnpm', ['gen:check']],
  ['typecheck', 'pnpm', ['typecheck']],
  ['lint + format', 'pnpm', ['lint']],
  ['unit + property tests', 'pnpm', ['test']],
  ['build', 'pnpm', ['build']],
  ['licence audit + dist scan', 'pnpm', ['check:licenses']],
  ['size budgets', 'pnpm', ['check:size']],
  ...(e2e ? [['e2e smoke (chromium + webkit)', 'pnpm', ['test:e2e', '--grep-invert', '@realtime']]] : []),
];

const done = [];
for (const [name, cmd, args] of steps) {
  console.log(`\n── ${name}: ${cmd} ${args.join(' ')}`);
  const started = Date.now();
  const { status } = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  done.push(`${status === 0 ? '✓' : '✗'} ${name} (${secs} s)`);
  if (status !== 0) {
    console.error(`\n${done.join('\n')}\ncheck: FAILED at "${name}"`);
    process.exit(1);
  }
}
console.log(`\n${done.join('\n')}\ncheck: all ${done.length} steps passed${e2e ? '' : ' (e2e skipped)'}`);
