// The music pack (DEP-14, ADR-0013, F-011) → the bundled track list (MOD-Core) and the files' URLs
// (MOD-Assets). Source: src/assets/music/music.json, one entry per track: id, file, title, source,
// licence, duration (µs), byte size, SHA-256 and `placeholder` (a generated stand-in, not for release).
// Generation fails when a file is missing or differs from its checksum or size, when an entry lacks a
// field, or when the pack is over NFR-10's 10 MB. Vite emits each file into dist/assets/ with a content
// hash in its name, so it joins the asset manifest the service worker precaches (ADR-0015, F-021.R1).
// `musicPack()` is also read by scripts/check-licenses.mjs (placeholders) and scripts/check-size.mjs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { abs, emit, GENERATED_HEADER } from './lib/util.mjs';

export const MUSIC_DIR = 'src/assets/music';
const SOURCE = `${MUSIC_DIR}/music.json`;
const CORE_OUT = abs('src/core/music.gen.ts');
const ASSETS_OUT = abs('src/assets/music.gen.ts');
/** NFR-10: bundled music ≤ 10 MB in total (1 MB = 1,000,000 bytes, as the size gate counts). */
export const MUSIC_BUDGET = 10_000_000;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE = /^[a-z0-9-]+\.m4a$/;

/** The checked music pack. Throws on any problem. */
export function musicPack() {
  const json = JSON.parse(fs.readFileSync(abs(SOURCE), 'utf8'));
  const tracks = json.tracks;
  if (!Array.isArray(tracks)) throw new Error(`${SOURCE}: no "tracks" list`);
  const seen = new Set();
  let total = 0;
  for (const t of tracks) {
    const where = `${SOURCE} ${t?.id ?? '?'}`;
    if (!ID.test(t.id ?? '')) throw new Error(`${where}: id must be lower-case words joined by "-"`);
    if (seen.has(t.id)) throw new Error(`${where}: duplicate id`);
    seen.add(t.id);
    for (const k of ['title', 'source', 'licence'])
      if (typeof t[k] !== 'string' || !t[k].trim()) throw new Error(`${where}: "${k}" is missing`);
    if (!Number.isInteger(t.durationUs) || t.durationUs <= 0) throw new Error(`${where}: "durationUs" must be > 0`);
    if (t.placeholder !== undefined && typeof t.placeholder !== 'boolean')
      throw new Error(`${where}: "placeholder" must be true or false`);
    if (!FILE.test(t.file ?? '')) throw new Error(`${where}: "file" must be a .m4a name (ADR-0013 §2)`);
    const path = abs(MUSIC_DIR, t.file);
    if (!fs.existsSync(path)) throw new Error(`${where}: ${MUSIC_DIR}/${t.file} is missing`);
    const bytes = fs.readFileSync(path);
    if (bytes.length !== t.bytes) throw new Error(`${where}: ${t.file} is ${bytes.length} bytes, not ${t.bytes}`);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    if (sha !== t.sha256) throw new Error(`${where}: ${t.file} does not match its checksum`);
    total += bytes.length;
  }
  if (total > MUSIC_BUDGET)
    throw new Error(`${SOURCE}: the pack is ${total} bytes, over NFR-10's ${MUSIC_BUDGET} (never raise it silently)`);
  return { tracks, total };
}

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

export function genMusicManifest({ check }) {
  const { tracks } = musicPack();
  const header = GENERATED_HEADER(SOURCE, 'scripts/gen-music-manifest.mjs');
  const core = `// ${header}
// Implements: RULE-12 Bundled music, ENT-MusicTrack (id, title, source, licence, duration in µs).
import type { MusicTrack } from './music';

/** The bundled tracks in pack order (DEP-14). */
export const BUNDLED_MUSIC: readonly MusicTrack[] = /* @__PURE__ */ Object.freeze([
${tracks
  .map(
    (t) =>
      `  /* @__PURE__ */ Object.freeze({ id: ${JSON.stringify(t.id)}, title: ${JSON.stringify(t.title)}, source: ${JSON.stringify(t.source)}, licence: ${JSON.stringify(t.licence)}, duration: ${t.durationUs} }),`,
  )
  .join('\n')}
]);
`;
  const assets = `// ${header}
// Implements: F-011.R7 — each track is a file of the tool itself (Vite emits it with a content hash).
${tracks.map((t) => `import ${camel(t.id)} from './music/${t.file}?url';`).join('\n')}

/** Each bundled track's own-origin path (MOD-Assets fetches only these and the manifest's). */
export const MUSIC_FILES: Readonly<Record<string, string>> = Object.freeze({
${tracks.map((t) => `  ${JSON.stringify(t.id)}: ${camel(t.id)},`).join('\n')}
});

/** Tracks generated as stand-ins until the owner picks the real ones (D-034): not for release. */
export const PLACEHOLDER_MUSIC: readonly string[] = ${JSON.stringify(tracks.filter((t) => t.placeholder).map((t) => t.id))};
`;
  return [emit(CORE_OUT, core, { check }), emit(ASSETS_OUT, assets, { check })].every(Boolean);
}
