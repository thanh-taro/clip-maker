// The bundled music pack (DEP-14, ADR-0013 §2 and §4, F-011, RULE-12): turns the owner-approved CC0
// downloads (owner approval 2026-11-20) into the shipped AAC files and their manifest entries.
//
// Usage (macOS, asset preparation only; nothing here ships):
//   node scripts/make-music.mjs <source-folder>
// <source-folder> holds `provenance.json` (one entry per track: slug, title, artist, page, file, bytes,
// sha256, licence, retrieved), `audio/<slug>.mp3` and `pages/<slug>.html` (the saved track page with its
// CC0 1.0 dedication). Only the tracks listed in provenance.json are used.
//
// For each track: the MP3 is checked against its recorded size and SHA-256, decoded by the operating
// system's own converter (`afconvert`) to 48 kHz stereo 16-bit PCM, cut to its first 60 s (a track whose
// whole length is at most its own cap is kept whole), loudness-normalised to about −16 LUFS integrated
// (ITU-R BS.1770 K-weighting with the absolute and relative gates; the gain is limited so the sample peak
// stays at or under −1 dBFS), given a 20 ms fade-in and a 2 s fade-out, and encoded by `afconvert` to
// AAC-LC 128 kbps CBR, 48 kHz stereo, in an MPEG-4 audio file (`src/assets/music/<id>.m4a`). Then:
//  - src/assets/music/music.json is rewritten (id, file, "Title — Artist", source = track page URL,
//    licence, duration in µs, bytes, SHA-256), in provenance order;
//  - each saved track page and provenance.json are copied to licences/music/ (the licence audit's
//    record, ADR-0013 §4; never bundled: it is outside src/ and public/);
//  - the pack must stay within NFR-10's 10,000,000 bytes, or nothing is written to the manifest.
// The source files are treated as untrusted data: they are only read, hashed and decoded by afconvert.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abs } from './lib/util.mjs';

const RATE = 48_000;
const DIR = abs('src/assets/music');
const MANIFEST = path.join(DIR, 'music.json');
const LICENCES = abs('licences/music');
/** NFR-10 (bytes, as the size gate counts). */
const BUDGET = 10_000_000;
/** Default cut: the first 60 s (owner's brief, 2026-11-20). */
const CUT_S = 60;
/** Tracks that may keep their natural length up to this cap (seconds). */
const KEEP_WHOLE_UP_TO = { 'calm-moment': 75 };
const FADE_IN_S = 0.02;
const FADE_OUT_S = 2;
const TARGET_LUFS = -16;
const PEAK_CEILING_DB = -1;
const LICENCE = 'CC0 1.0 Universal';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status ?? r.signal})`);
}

/** Reads a 16-bit PCM WAV file (any chunk order; afconvert may add padding chunks) into two channels. */
export function readWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not WAV');
  let fmt = null;
  let data = null;
  for (let o = 12; o + 8 <= buf.length;) {
    const id = buf.toString('ascii', o, o + 4);
    const size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ')
      fmt = {
        format: buf.readUInt16LE(o + 8),
        channels: buf.readUInt16LE(o + 10),
        rate: buf.readUInt32LE(o + 12),
        bits: buf.readUInt16LE(o + 22),
      };
    if (id === 'data') data = buf.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('WAV without fmt or data');
  if (fmt.format !== 1 || fmt.bits !== 16 || fmt.channels !== 2 || fmt.rate !== RATE)
    throw new Error(`unexpected WAV format ${JSON.stringify(fmt)}`);
  const n = Math.floor(data.length / 4);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = data.readInt16LE(i * 4) / 32768;
    R[i] = data.readInt16LE(i * 4 + 2) / 32768;
  }
  return [L, R];
}

export function writeWav([L, R]) {
  const n = L.length;
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 4, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  return b;
}

/** One biquad (direct form I) over a channel. */
function biquad(x, [b0, b1, b2], [, a1, a2]) {
  const y = new Float32Array(x.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** ITU-R BS.1770-4 integrated loudness (LUFS) of 48 kHz stereo: K-weighting, 400 ms blocks, 75 % overlap, gates. */
export function integratedLoudness(channels) {
  const k = channels.map((c) =>
    biquad(
      biquad(c, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]),
      [1, -2, 1],
      [1, -1.99004745483398, 0.99007225036621],
    ),
  );
  const block = Math.round(0.4 * RATE);
  const step = Math.round(0.1 * RATE);
  const z = [];
  for (let s = 0; s + block <= k[0].length; s += step) {
    let sum = 0;
    for (const c of k) for (let i = s; i < s + block; i++) sum += c[i] * c[i];
    z.push(sum / block);
  }
  const lufs = (ms) => -0.691 + 10 * Math.log10(ms);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const abs70 = z.filter((v) => lufs(v) > -70);
  if (!abs70.length) return -Infinity;
  const rel = lufs(mean(abs70)) - 10;
  const gated = abs70.filter((v) => lufs(v) > rel);
  return lufs(mean(gated));
}

function prepare([L, R], keepWholeUpTo) {
  // The first CUT_S seconds, or up to the track's own cap (its natural length when shorter).
  const n = Math.min(L.length, Math.floor((keepWholeUpTo ?? CUT_S) * RATE));
  const out = [L.slice(0, n), R.slice(0, n)];
  // Loudness (ADR-0013 §2): about −16 LUFS integrated, sample peak ≤ −1 dBFS.
  const measured = integratedLoudness(out);
  let peak = 0;
  for (const c of out) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(c[i]));
  const gainDb = Math.min(TARGET_LUFS - measured, PEAK_CEILING_DB - 20 * Math.log10(peak));
  const g = 10 ** (gainDb / 20);
  const fin = Math.round(FADE_IN_S * RATE);
  const fout = Math.round(FADE_OUT_S * RATE);
  for (const c of out) {
    for (let i = 0; i < n; i++) {
      let e = g;
      if (i < fin) e *= i / fin;
      const left = n - 1 - i;
      if (left < fout) e *= 0.5 - 0.5 * Math.cos((Math.PI * left) / fout); // raised-cosine fade-out to 0
      c[i] *= e;
    }
  }
  return { pcm: out, samples: n, measured, gainDb };
}

function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('usage: node scripts/make-music.mjs <source-folder>');
    process.exit(2);
  }
  if (process.platform !== 'darwin') {
    console.error('make-music: needs macOS `afconvert` (ADR-0013 §2: the OS AAC converter)');
    process.exit(1);
  }
  const provenance = JSON.parse(fs.readFileSync(path.join(src, 'provenance.json'), 'utf8'));
  if (!Array.isArray(provenance) || provenance.length < 8)
    throw new Error('provenance.json: need at least 8 tracks (RULE-12)');
  for (const p of provenance) {
    if (!SLUG.test(p.slug ?? '')) throw new Error(`provenance: bad slug ${p.slug}`);
    for (const k of ['title', 'artist', 'page', 'sha256', 'licence', 'retrieved'])
      if (typeof p[k] !== 'string' || !p[k].trim()) throw new Error(`provenance ${p.slug}: "${k}" missing`);
    if (!/^CC0 1\.0 Universal/.test(p.licence)) throw new Error(`provenance ${p.slug}: licence is not CC0 1.0`);
    if (!p.page.startsWith('https://freemusicarchive.org/')) throw new Error(`provenance ${p.slug}: unexpected page`);
    const mp3 = fs.readFileSync(path.join(src, 'audio', `${p.slug}.mp3`));
    if (mp3.length !== p.bytes || sha256(mp3) !== p.sha256)
      throw new Error(`${p.slug}.mp3 differs from provenance.json`);
    const page = fs.readFileSync(path.join(src, 'pages', `${p.slug}.html`), 'utf8');
    if (!page.includes('creativecommons.org/publicdomain/zero/1.0/'))
      throw new Error(`pages/${p.slug}.html shows no CC0 1.0 dedication link`);
  }

  fs.mkdirSync(DIR, { recursive: true });
  fs.mkdirSync(LICENCES, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-maker-music-'));
  const tracks = [];
  try {
    for (const p of provenance) {
      const decoded = path.join(tmp, `${p.slug}-in.wav`);
      run('afconvert', [
        '-f',
        'WAVE',
        '-d',
        `LEI16@${RATE}`,
        '-c',
        '2',
        path.join(src, 'audio', `${p.slug}.mp3`),
        decoded,
      ]);
      const { pcm, samples, measured, gainDb } = prepare(readWav(fs.readFileSync(decoded)), KEEP_WHOLE_UP_TO[p.slug]);
      const cut = path.join(tmp, `${p.slug}.wav`);
      fs.writeFileSync(cut, writeWav(pcm));
      const file = `${p.slug}.m4a`;
      const dest = path.join(DIR, file);
      // AAC-LC, 128 kbps constant bit rate, 48 kHz stereo, MPEG-4 audio file (ADR-0013 §2).
      run('afconvert', ['-f', 'm4af', '-d', `aac@${RATE}`, '-b', '128000', '-s', '0', cut, dest]);
      const bytes = fs.readFileSync(dest);
      tracks.push({
        id: p.slug,
        file,
        title: `${p.title} — ${p.artist}`,
        source: p.page,
        licence: LICENCE,
        durationUs: Math.floor((samples * 1_000_000) / RATE),
        bytes: bytes.length,
        sha256: sha256(bytes),
      });
      fs.copyFileSync(path.join(src, 'pages', `${p.slug}.html`), path.join(LICENCES, `${p.slug}.html`));
      console.log(
        `${file}: ${(samples / RATE).toFixed(2)} s, ${bytes.length} bytes, source ${measured.toFixed(1)} LUFS, gain ${gainDb.toFixed(1)} dB`,
      );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const total = tracks.reduce((s, t) => s + t.bytes, 0);
  if (total > BUDGET) throw new Error(`the pack is ${total} bytes, over NFR-10's ${BUDGET}; manifest not written`);
  fs.copyFileSync(path.join(src, 'provenance.json'), path.join(LICENCES, 'provenance.json'));
  // Files of earlier packs that are no longer listed are removed (only .m4a in the music folder).
  for (const f of fs.readdirSync(DIR))
    if (f.endsWith('.m4a') && !tracks.some((t) => t.file === f)) fs.rmSync(path.join(DIR, f));
  const manifest = {
    $comment:
      'DEP-14 music pack (ADR-0013): one entry per bundled track (ENT-MusicTrack), written by scripts/make-music.mjs and checked by scripts/gen-music-manifest.mjs. Saved track pages and provenance: licences/music/.',
    tracks,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`wrote ${path.relative(abs('.'), MANIFEST)}: ${tracks.length} tracks, ${total} bytes`);
}

main();
