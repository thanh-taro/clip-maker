// License audit (ADR-0001 rules 2–7, ADR-0005, MOD-Build). Copied from the sibling image-annotator
// and adapted to this registry:
//  - every installed package (prod + dev + transitive) must carry an allowed license, or a named
//    build/dev/test-only exception (ADR-0001 rule 2), or the scoped runtime exception of ADR-0005
//    (exactly `mediabunny`, MPL-2.0) — the copyleft guard over the whole lockfile;
//  - every direct dependency and devDependency must be a registered, active DEP row (rule 5), at a
//    version inside the row's range; direct production dependencies must be runtime/asset rows;
//    every transitive production package must be registered;
//  - rows of installed packages still `proposed` are listed as PENDING AUDIT. They fail the gate only
//    in strict mode (`--strict` or LICENCE_STRICT=1), which the licence audit / G3 turns on once the
//    audit has approved the rows (the registry is a spec; this script never edits it);
//  - then the dist/ scan (scripts/check-dist.mjs, rule 7) proves what actually ships.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { abs } from './lib/util.mjs';
import { scanDist } from './check-dist.mjs';
import { findInstalled, isActive, isApproved, isShipped, readRegistry, REGISTRY } from './lib/registry.mjs';

const STRICT = process.argv.includes('--strict') || process.env.LICENCE_STRICT === '1';

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Apache-2.0',
  'Unlicense',
  'CC0-1.0',
  'BlueOak-1.0.0',
  'Python-2.0',
]);
const FONT_LICENSES = new Set(['OFL-1.1']);
/** ADR-0005: the one shipped exception, by exact package name. */
const RUNTIME_EXCEPTIONS = { 'MPL-2.0': [/^mediabunny$/] };
/** Build/dev/test-only exceptions of ADR-0001 rule 2, by package name (DEP-18, DEP-19, DEP-25). */
const BUILD_ONLY_EXCEPTIONS = {
  'MPL-2.0': [/^lightningcss(-[\w-]+)?$/, /^axe-core$/, /^@axe-core\/playwright$/],
  'CC-BY-4.0': [/^caniuse-lite$/],
};
/** Packages whose npm metadata gives no clean SPDX id; the license file was reviewed by hand. */
const REVIEWED = {};

function licenses(prod) {
  let out;
  try {
    out = execFileSync('pnpm', ['licenses', 'list', '--json', ...(prod ? ['--prod'] : [])], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // `pnpm licenses` exits non-zero when it has nothing to report; its stdout still holds the JSON.
    out = e.stdout ?? '';
  }
  const parsed = JSON.parse(out || '{}');
  const groups = Array.isArray(parsed) ? parsed.reduce((m, p) => ((m[p.license] ??= []).push(p), m), {}) : parsed;
  return Object.entries(groups).flatMap(([license, pkgs]) =>
    pkgs.flatMap((p) =>
      (p.versions ?? [p.version]).map((v) => ({
        name: p.name,
        version: v,
        license: REVIEWED[`${p.name}@${v}`] ?? license,
      })),
    ),
  );
}

/** Evaluates a simple SPDX expression (OR / AND, parentheses ignored) against a predicate. */
function spdxOk(expr, ok) {
  const e = String(expr).replace(/[()]/g, ' ').trim();
  if (/\sOR\s/i.test(e)) return e.split(/\s+OR\s+/i).some((x) => spdxOk(x, ok));
  if (/\sAND\s/i.test(e)) return e.split(/\s+AND\s+/i).every((x) => spdxOk(x, ok));
  return ok(e.trim());
}

/**
 * Does `version` satisfy the registry's range? Understands the forms the registry uses: `^a[.b]`,
 * `~a.b`, `a.x`, an exact `a.b.c`, `exact a.b.x`; anything else (e.g. "transitive") is not checked (null).
 */
export function inRange(version, range) {
  const m = /^\s*(?:exact\s+)?([~^]?)(\d+)(?:\.(\d+|x))?(?:\.(\d+|x))?/.exec(range);
  if (!m) return null;
  const [maj, min, pat] = version.split('.').map((n) => parseInt(n, 10));
  const [, op, rMaj, rMin, rPat] = m;
  if (maj !== Number(rMaj)) return false;
  const want = [rMin, rPat].map((x) => (x === undefined || x === 'x' ? null : Number(x)));
  if (op === '^' && maj === 0) return want[0] === null || (min === want[0] && pat >= (want[1] ?? 0));
  if (op === '^') return min > (want[0] ?? -1) || (min === (want[0] ?? min) && pat >= (want[1] ?? 0));
  if (op === '~') return want[0] === null || (min === want[0] && pat >= (want[1] ?? 0));
  return (want[0] === null || min === want[0]) && (want[1] === null || pat === want[1]);
}

const registry = readRegistry().filter(isActive);
const registered = new Map(registry.flatMap((r) => r.names.map((n) => [n, r])));
const pkg = JSON.parse(fs.readFileSync(abs('package.json'), 'utf8'));
const problems = [];
const report = [];

function installedVersion(name) {
  const dir = findInstalled(name);
  return dir ? JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version : null;
}

for (const [section, deps] of [
  ['dependencies', pkg.dependencies ?? {}],
  ['devDependencies', pkg.devDependencies ?? {}],
]) {
  for (const name of Object.keys(deps)) {
    const r = registered.get(name);
    const version = installedVersion(name);
    if (!r) {
      problems.push(`${name}: direct ${section} entry not registered in ${REGISTRY}`);
      continue;
    }
    if (section === 'dependencies' && !isShipped(r))
      problems.push(`${name}: direct dependency not registered as runtime/asset (${r.id} is ${r.kind})`);
    const ok = version ? inRange(version, r.range) : false;
    if (ok === false) problems.push(`${name}@${version ?? 'missing'}: outside ${r.id}'s range "${r.range}"`);
    report.push(`${r.id.padEnd(7)} ${`${name}@${version}`.padEnd(42)} ${r.license.padEnd(18)} ${r.status}`);
  }
}

// Every installed package: allowed license, OFL for a registered font asset, or a named exception.
const all = licenses(false);
for (const p of all) {
  const r = registered.get(p.name);
  const ok = spdxOk(
    p.license,
    (l) =>
      ALLOWED.has(l) ||
      (FONT_LICENSES.has(l) && r && /asset/i.test(r.kind)) ||
      (BUILD_ONLY_EXCEPTIONS[l] ?? []).some((re) => re.test(p.name)) ||
      ((RUNTIME_EXCEPTIONS[l] ?? []).some((re) => re.test(p.name)) && r && isApproved(r)),
  );
  if (!ok) problems.push(`${p.name}@${p.version}: license ${p.license} not allowed (ADR-0001)`);
}
// Transitive runtime packages (what the shipped code may pull in) must be registered (rule 4).
for (const p of licenses(true)) {
  if (!registered.has(p.name)) problems.push(`${p.name}@${p.version}: runtime package not registered in ${REGISTRY}`);
}

console.log('direct dependencies (registry row, installed version, licence, status):');
console.log(report.map((l) => `  ${l}`).join('\n'));
const counts = all.reduce((m, p) => m.set(p.license, (m.get(p.license) ?? 0) + 1), new Map());
console.log(`licenses: ${all.length} installed packages — ${[...counts].map(([l, n]) => `${l} ${n}`).join(', ')}`);
const exceptions = all.filter((p) => !spdxOk(p.license, (l) => ALLOWED.has(l)));
if (exceptions.length) {
  console.log(`  outside the general allow-list, admitted by a named exception or as a font asset:`);
  for (const p of exceptions) console.log(`    ${p.name}@${p.version} (${p.license})`);
}
// Rows whose packages are installed but not yet approved by the licence audit (ADR-0001 rule 5).
const installedRows = new Set(
  [...all, ...Object.keys(pkg.dependencies ?? {}).map((name) => ({ name }))]
    .map((p) => registered.get(p.name))
    .filter(Boolean),
);
const pending = [...installedRows]
  .filter((r) => !isApproved(r))
  .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
if (pending.length) {
  console.log(
    `PENDING AUDIT — installed, registered, not yet approved in ${REGISTRY}${STRICT ? '' : ' (warning; --strict fails)'}:`,
  );
  for (const r of pending) console.log(`  ${r.id.padEnd(7)} ${r.label.padEnd(48)} ${r.status}`);
  if (STRICT) problems.push(`${pending.length} installed registry rows are not approved (strict mode)`);
}
const notInstalled = registry.filter((r) => /^proposed/i.test(r.status) && !installedRows.has(r) && r.names.length);
if (notInstalled.length) {
  console.log('registered, proposed and NOT installed (awaiting the licence audit before install):');
  for (const r of notInstalled) console.log(`  ${r.id.padEnd(7)} ${r.label}`);
}

const DIST = abs('dist');
if (!fs.existsSync(DIST)) problems.push('dist/ missing: run `pnpm build` first (the dist/ scan of ADR-0001 rule 6)');
else {
  const scan = scanDist(DIST, registry);
  problems.push(...scan.problems.map((p) => `dist: ${p}`));
  const list = [...scan.shipped].map(([n, v]) => `${n}@${v}`).sort();
  console.log(`dist: ${scan.shipped.size} third-party packages ship — ${list.length ? list.join(', ') : '(none)'}`);
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('licenses: all within the ADR-0001 allow-lists; dist/ ships only registered runtime/asset packages');
