// dist/ scan (ADR-0001 rule 7, ADR-0005, MOD-Build): the one gate that proves what actually SHIPS.
// From the hidden source maps it collects every third-party package whose code reached a shipped
// JS/CSS chunk (page, workers, worklet), and fails when any of them is not a registered runtime/asset
// row or carries a license outside the shipped allow-list (plus the scoped MPL-2.0 exception for
// `mediabunny`, ADR-0005). Font files must trace to a registered font asset package and be a latin or
// vietnamese subset (ADR-0012); bundled music files (.m4a) must trace to the checked music pack and a
// registered track row (DEP-14, ADR-0013, F-011), and with `--release` (or LICENCE_RELEASE=1; `pnpm
// check:release`) a placeholder track (`"placeholder": true`) fails; look strips (.png) must trace to the
// checked looks pack and its registry row (DEP-13, ADR-0013 §1, F-008); unknown binary file types fail.
// It also reads the shipped code for network behaviour (NFR-01, qa-security L2): no XMLHttpRequest,
// WebSocket, EventSource, sendBeacon, importScripts, RTCPeerConnection, WebAssembly, eval or new Function
// anywhere; `fetch(` only in the main chunk (MOD-Assets) and sw.js; absolute http(s) URLs only from a short
// allow-list (namespaces, licence and codec-registry comments, the portal origin, the source repository and
// the bundled tracks' pages).
// Copied from the sibling image-annotator.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abs } from './lib/util.mjs';
import { findInstalled, isActive, isShipped, readRegistry } from './lib/registry.mjs';
import { musicPack } from './gen-music-manifest.mjs';
import { looksPack } from './gen-looks.mjs';
import { DEFAULT_HOST_ORIGINS, hostOrigins } from './gen-headers.mjs';

/** Network primitives that never ship (NFR-01; the CSP would block most of them anyway). */
const BANNED_CODE = [
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['importScripts', /\bimportScripts\b/],
  ['RTCPeerConnection', /\bRTCPeerConnection\b/],
  ['WebAssembly', /\bWebAssembly\b/],
  ['eval(', /(?<![\w$.])eval\s*\(/],
  ['new Function', /\bnew\s+Function\s*\(/],
];
/** A call of `fetch` (also `self.fetch(`), not a method that merely ends in "fetch" (`prefetch(`). */
const FETCH_CALL = /(?<![\w$])fetch\s*\(/;
/** Where `fetch(` may ship: the main chunk (MOD-Assets, ADR-0014) and the offline worker (ADR-0015). */
const FETCH_ALLOWED = [/^assets\/index-[\w-]+\.js$/, /^sw\.js$/];
const URL_LITERAL = /https?:\/\/[^\s"'`)<>\\]+/g;
/** URL prefixes that may appear in shipped code: XML namespaces, licence and codec-registry comments. */
const URL_PREFIXES = [
  'http://www.w3.org/',
  'https://www.w3.org/',
  'https://mozilla.org/MPL/2.0/',
  'https://aomediacodec.github.io/av1-isobmff/',
  'https://www.webmproject.org/vp9/mp4/',
];
/** The source repository link (F-020.R3, src/app/StatusBar.tsx). */
export const SOURCE_URL = 'https://github.com/thanh-taro/clip-maker';

/**
 * The shipped code's network behaviour (NFR-01, qa-security L2), over every `.js` file of `files`
 * (paths relative to `distDir`).
 * @param {string} distDir
 * @param {string[]} files
 * @returns {string[]} problems
 */
export function scanCode(distDir, files) {
  const problems = [];
  const exact = new Set([
    SOURCE_URL,
    ...DEFAULT_HOST_ORIGINS.split(/\s+/),
    ...hostOrigins(),
    ...musicPack().tracks.map((t) => t.source),
  ]);
  for (const f of files.filter((f) => f.endsWith('.js'))) {
    const rel = f.split(path.sep).join('/');
    const code = fs.readFileSync(path.join(distDir, f), 'utf8');
    for (const [name, re] of BANNED_CODE)
      if (re.test(code)) problems.push(`network primitive ${name} ships in ${rel} (NFR-01)`);
    if (FETCH_CALL.test(code) && !FETCH_ALLOWED.some((re) => re.test(rel)))
      problems.push(`fetch( ships in ${rel}: only the main chunk (MOD-Assets) and sw.js may fetch (NFR-01, ADR-0014)`);
    const bad = new Set();
    for (const m of code.matchAll(URL_LITERAL)) {
      const url = m[0].replace(/[.,;:]+$/, '');
      if (!exact.has(url) && !URL_PREFIXES.some((p) => url.startsWith(p))) bad.add(url);
    }
    for (const url of bad) problems.push(`absolute URL outside the allow-list ships in ${rel}: ${url} (NFR-01)`);
  }
  return problems;
}

const CODE_MAP = /\.(?:js|css)\.map$/;
const NODE_MODULES = /node_modules\/((?:@[^/]+\/)?[^/@][^/]*)/g;
const FONT_EXT = /\.(woff2?|ttf|otf|eot)$/i;
/** The only font subsets the tool ships (ADR-0012 §1): variable or one static weight. */
const FONT_SUBSET = /-(latin|vietnamese)-(wght|\d{3})-normal-[\w-]+\.woff2$/;
const KNOWN_EXT = new Set(['.js', '.css', '.map', '.html', '.txt', '.json', '.svg', '.webmanifest', '.ico']);
/** A bundled music file as Vite emits it: the pack's file name with a content hash (`name-HASH.m4a`). */
const MUSIC_FILE = /^(.+)-[\w-]{8}\.m4a$/;
/** A look strip as Vite emits it: the pack's file name with a content hash (`name-HASH.png`). */
const LOOK_FILE = /^(.+)-[\w-]{8}\.png$/;
/** The looks pack's registry row (DEP-13): its name names the pack. */
const LOOKS_ROW = /looks pack/i;

/** Every file under a directory, as paths relative to it. */
function walk(dir, base = dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

const SHIPPED_LICENSES = new Set([
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
const SHIPPED_EXCEPTIONS = { mediabunny: 'MPL-2.0' };

/**
 * @param {{ release?: boolean }} [options] release: a shipped placeholder music track fails (F-011, DEP-14)
 * @returns {{ shipped: Map<string,string>, problems: string[] }}
 */
export function scanDist(distDir, registry, { release = false } = {}) {
  const problems = [];
  const files = walk(distDir);
  const registered = new Map(registry.flatMap((r) => r.names.map((n) => [n, r])));
  const musicTracks = musicPack().tracks;
  const looks = looksPack().looks;

  // Packages whose code reached a shipped chunk, read from the hidden source maps.
  const shipped = new Map();
  for (const f of files.filter((f) => CODE_MAP.test(f))) {
    let map;
    try {
      map = JSON.parse(fs.readFileSync(path.join(distDir, f), 'utf8'));
    } catch {
      problems.push(`unreadable source map: ${f}`);
      continue;
    }
    for (const src of map.sources ?? []) {
      for (const m of String(src).matchAll(NODE_MODULES)) {
        const name = m[1];
        if (name === '.pnpm') continue; // pnpm store directory, not a package
        if (!shipped.has(name)) {
          const dir = findInstalled(name);
          const version = dir ? JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version : '?';
          shipped.set(name, version);
        }
      }
    }
  }

  for (const [name, version] of shipped) {
    const r = registered.get(name);
    if (!r || !isShipped(r)) {
      problems.push(`${name}@${version} ships but is not a registered runtime/asset row`);
      continue;
    }
    const ok =
      SHIPPED_LICENSES.has(r.license) ||
      (FONT_LICENSES.has(r.license) && /asset/i.test(r.kind)) ||
      (SHIPPED_EXCEPTIONS[name] === r.license && /^approved/i.test(r.status));
    if (!ok) problems.push(`${name}@${version} ships with license ${r.license} (not in the shipped allow-list)`);
  }

  // Registered font asset packages (OFL), by their family name (`@fontsource-variable/manrope` →
  // `manrope`): every shipped font file must trace to one of them (the font files are emitted with
  // the family as a filename prefix, e.g. `manrope-latin-wght-normal-*.woff2`).
  const fontFamilies = registry
    .filter((r) => /asset/i.test(r.kind) && FONT_LICENSES.has(r.license))
    .flatMap((r) => r.names)
    .map((n) => n.split('/').pop() ?? n);

  // Non-code files that actually ship (source maps and the Vite manifest are stripped on deploy).
  for (const f of files) {
    if (CODE_MAP.test(f) || f.startsWith('.vite' + path.sep) || f === '.vite') continue;
    const ext = path.extname(f).toLowerCase();
    if (FONT_EXT.test(f)) {
      const base = path.basename(f);
      if (!fontFamilies.some((fam) => base.startsWith(fam + '-')))
        problems.push(`font file ships without a registered font asset package: ${f}`);
      else if (!FONT_SUBSET.test(base))
        problems.push(`font subset not allowed (latin + vietnamese only, ADR-0012): ${f}`);
    } else if (ext === '.m4a') {
      // F-011 / DEP-14: a music file ships only as a track of the checked pack with its own registry row.
      const base = path.basename(f);
      const track = musicTracks.find((t) => MUSIC_FILE.exec(base)?.[1] === t.file.replace(/\.m4a$/, ''));
      if (!track) problems.push(`music file ships outside the checked music pack (DEP-14): ${f}`);
      else if (release && track.placeholder)
        problems.push(`placeholder music track ${track.file} ships in a release (DEP-14, build question 114): ${f}`);
      else if (!registry.some((r) => isActive(r) && /asset/i.test(r.kind) && r.label.includes(track.file)))
        problems.push(`music track ${track.file} ships without its registry row (DEP-14, ADR-0013 §4): ${f}`);
    } else if (ext === '.png') {
      // F-008 / DEP-13: a PNG ships only as a strip of the checked looks pack, with the pack's registry row.
      const base = path.basename(f);
      const look = looks.find((l) => LOOK_FILE.exec(base)?.[1] === l.file.replace(/\.png$/, ''));
      if (!look) problems.push(`image ships outside the checked looks pack (DEP-13): ${f}`);
      else if (!registry.some((r) => isActive(r) && /asset/i.test(r.kind) && LOOKS_ROW.test(r.label)))
        problems.push(`look strip ${look.file} ships without the looks pack's registry row (DEP-13): ${f}`);
    } else if (ext && !KNOWN_EXT.has(ext)) {
      problems.push(`unexpected shipped file type: ${f}`);
    }
  }

  problems.push(...scanCode(distDir, files.filter((f) => !CODE_MAP.test(f))));

  return { shipped, problems };
}

// CLI: `pnpm check:dist` (after `pnpm build`).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = abs('dist');
  if (!fs.existsSync(dist)) {
    console.error('✗ dist/ missing: run `pnpm build` first');
    process.exit(1);
  }
  const release = process.argv.includes('--release') || process.env.LICENCE_RELEASE === '1';
  const { shipped, problems } = scanDist(dist, readRegistry().filter(isActive), { release });
  const list = [...shipped].map(([n, v]) => `${n}@${v}`).sort();
  console.log(`dist: ${shipped.size} third-party packages ship — ${list.length ? list.join(', ') : '(none)'}`);
  if (problems.length) {
    console.error(problems.map((p) => `✗ ${p}`).join('\n'));
    process.exit(1);
  }
  console.log("dist: only the tool's own files and registered runtime/asset packages");
}
