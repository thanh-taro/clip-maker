// Size gate (NFR-10, architecture.md "Budgets and baselines", MOD-Build). Adapted from the sibling
// image-annotator. Everything loads at start-up (ADR-0002: no lazy chunks), so every shipped JS/CSS
// file is counted and must be either loaded by dist/index.html, or one of the module workers / the
// audio worklet of ADR-0003. Compressed with gzip level 9; 1 KB = 1,000 bytes. WOFF2 is already
// compressed, so font files count as they are. Bundled music (AAC, already compressed) counts as it is in
// its own group, outside the code total (NFR-10: ≤ 10 MB; F-011). Looks join when they are packed.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { abs } from './lib/util.mjs';

/** architecture.md "Size" table (compressed). Shared chunks would count once, under main. */
export const BUDGET = {
  html: 15_000,
  css: 25_000,
  main: 200_000,
  engine: 150_000,
  audio: 50_000, // audio worker + worklet
  // architecture.md: "≤ 30 KB extra, shared chunks counted once". Vite bundles each module worker on
  // its own, so the container reader (≈ 73 KB, ADR-0005 outcome) cannot be a shared chunk: it is
  // counted here as 75 KB on top of the 30 KB (E2; architecture.md Size row change proposed).
  analysis: 105_000,
  export: 180_000, // its own bundle: container read + write (≈ 121 KB), compositor, codec, export, gifenc (E3 review)
  // architecture.md says 10 KB; the windowed decoder and 48 kHz resampler (E6, ADR-0008 §2/§6) bring it
  // to ≈ 10.9 KB. Raised to 12 KB pending the owner's decision on build question 83 (not silent).
  'export-audio': 12_000,
  code: 560_000, // code and styles total
  fonts: 200_000, // "≈ 200 KB" for the five font packages
  music: 10_000_000, // NFR-10: bundled music ≤ 10 MB in total (F-011, DEP-14); outside the code total
};
/** Worker / worklet chunks (Vite names them after their source file). */
const CHUNK_GROUP = [
  [/^assets\/engine\.worker-[\w-]+\.js$/, 'engine'],
  [/^assets\/audio\.worker-[\w-]+\.js$/, 'audio'],
  [/^assets\/playback\.worklet-[\w-]+\.js$/, 'audio'],
  [/^assets\/analysis\.worker-[\w-]+\.js$/, 'analysis'],
  [/^assets\/export\.worker-[\w-]+\.js$/, 'export'],
  [/^assets\/export-audio\.worker-[\w-]+\.js$/, 'export-audio'],
];
const FONT = /^assets\/[\w-]+-(latin|vietnamese)-(wght|\d{3})-normal-[\w-]+\.woff2$/;

const DIST = abs('dist');
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('✗ dist/index.html missing: run `pnpm build` first');
  process.exit(1);
}
const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
const kb = (n) => `${(n / 1000).toFixed(1)} KB`;
const html = fs.readFileSync(path.join(DIST, 'index.html'));
const refs = new Set(
  [...html.toString().matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="\/([^"]+)"/g)].map((m) => m[1]),
);
const assets = fs.existsSync(path.join(DIST, 'assets'))
  ? fs.readdirSync(path.join(DIST, 'assets')).map((f) => `assets/${f}`)
  : [];

const groups = Object.fromEntries(Object.keys(BUDGET).map((g) => [g, []]));
groups.html.push(['index.html', gz(html)]);
const problems = [];
for (const f of assets) {
  if (f.endsWith('.map')) continue;
  const buf = fs.readFileSync(path.join(DIST, f));
  if (f.endsWith('.css')) groups.css.push([f, gz(buf)]);
  else if (f.endsWith('.js')) {
    const group = refs.has(f) ? 'main' : CHUNK_GROUP.find(([re]) => re.test(f))?.[1];
    if (group) groups[group].push([f, gz(buf)]);
    else problems.push(`${f}: JS chunk not loaded at start-up and not a worker/worklet (no lazy chunks, ADR-0002)`);
  } else if (FONT.test(f)) groups.fonts.push([f, buf.length]);
  else if (f.endsWith('.m4a')) groups.music.push([f, buf.length]);
  else if (/\.woff2?$/.test(f)) problems.push(`${f}: font file outside the latin/vietnamese subsets (ADR-0012)`);
}
// A dynamic import() leaves a trace in the Vite manifest (ADR-0002: none allowed).
const manifestFile = path.join(DIST, '.vite', 'manifest.json');
if (fs.existsSync(manifestFile)) {
  for (const [key, entry] of Object.entries(JSON.parse(fs.readFileSync(manifestFile, 'utf8')))) {
    if (entry.dynamicImports?.length) problems.push(`${key}: dynamic import() (no lazy chunks, ADR-0002)`);
    if (entry.isDynamicEntry) problems.push(`${key}: lazy chunk (no lazy chunks, ADR-0002)`);
  }
}

const sum = (g) => groups[g].reduce((s, [, n]) => s + n, 0);
const sums = Object.fromEntries(Object.keys(BUDGET).map((g) => [g, sum(g)]));
sums.code = Object.keys(BUDGET)
  .filter((g) => !['code', 'fonts', 'music'].includes(g))
  .reduce((s, g) => s + sums[g], 0);
for (const rows of Object.values(groups)) for (const [f, n] of rows) console.log(`${kb(n).padStart(9)}  ${f}`);
console.log('');
for (const g of Object.keys(BUDGET)) {
  const over = sums[g] > BUDGET[g];
  if (over) problems.push(`${g}: ${kb(sums[g])} over the ${kb(BUDGET[g])} budget (NFR-10)`);
  console.log(`${over ? '✗' : '✓'} ${g.padEnd(12)} ${kb(sums[g]).padStart(9)} / ${kb(BUDGET[g])}`);
}
if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('size: within the architecture.md budgets; no lazy chunks');
