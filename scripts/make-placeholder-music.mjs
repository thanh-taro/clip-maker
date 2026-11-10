// Placeholder music for the music pack (DEP-14, F-011) until the owner picks the real CC0 tracks (D-034).
// Synthesises three short pieces (chords, an arpeggio, a pad) as 48 kHz stereo 16-bit PCM and encodes
// each to AAC-LC 128 kbps in M4A with the operating system's own AAC converter (`afconvert`, macOS), the
// asset-preparation path ADR-0013 §2 names. Nothing is downloaded. The files are committed with their
// checksums in src/assets/music/music.json, marked `placeholder` (not for release); `pnpm gen` checks
// them (scripts/gen-music-manifest.mjs) and `pnpm check:licenses --release` refuses them.
// Run once: `node scripts/make-placeholder-music.mjs` (macOS). Re-running replaces the three files.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abs } from './lib/util.mjs';

const RATE = 48_000;
const DIR = abs('src/assets/music');
const MANIFEST = path.join(DIR, 'music.json');

/** Equal-tempered frequency of a MIDI note. */
const hz = (n) => 440 * 2 ** ((n - 69) / 12);

/** A soft note: fundamental plus two quiet harmonics. */
function voice(out, f, from, len, gain, pan, attack, release) {
  const [L, R] = out;
  const a = Math.round(attack * RATE);
  const r = Math.round(release * RATE);
  const n = Math.round(len * RATE);
  const s0 = Math.round(from * RATE);
  for (let i = 0; i < n && s0 + i < L.length; i++) {
    const env = Math.min(1, i / Math.max(1, a), (n - i) / Math.max(1, r));
    const t = i / RATE;
    const x =
      Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) + 0.1 * Math.sin(6 * Math.PI * f * t);
    const v = x * env * gain;
    L[s0 + i] += v * (1 - pan);
    R[s0 + i] += v * (1 + pan);
  }
}

/** A plucked note: fast attack, exponential decay. */
function pluck(out, f, from, len, gain, pan) {
  const [L, R] = out;
  const n = Math.round(len * RATE);
  const s0 = Math.round(from * RATE);
  for (let i = 0; i < n && s0 + i < L.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, i / 96) * Math.exp(-t * 5) * Math.min(1, (n - i) / 480);
    const v = (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * env * gain;
    L[s0 + i] += v * (1 - pan);
    R[s0 + i] += v * (1 + pan);
  }
}

const CHORDS = [
  [60, 64, 67], // C
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [55, 59, 62], // G
];

const PIECES = [
  {
    id: 'placeholder-chords',
    title: 'Placeholder · Chords',
    seconds: 60,
    make(out) {
      for (let k = 0; k * 2 < 60; k++) {
        const chord = CHORDS[k % 4];
        chord.forEach((n, j) => voice(out, hz(n), k * 2, 2, 0.12, (j - 1) * 0.3, 0.03, 0.25));
        voice(out, hz(chord[0] - 12), k * 2, 2, 0.15, 0, 0.02, 0.3);
      }
    },
  },
  {
    id: 'placeholder-arpeggio',
    title: 'Placeholder · Arpeggio',
    seconds: 30,
    make(out) {
      for (let k = 0; k * 0.25 < 30; k++) {
        const chord = CHORDS[Math.floor(k / 8) % 4];
        const n = chord[k % 3] + (k % 8 >= 4 ? 12 : 0);
        pluck(out, hz(n), k * 0.25, 0.5, 0.3, ((k % 3) - 1) * 0.4);
      }
    },
  },
  {
    id: 'placeholder-pad',
    title: 'Placeholder · Pad',
    seconds: 20,
    make(out) {
      for (let k = 0; k * 5 < 20; k++) {
        const chord = CHORDS[(k * 2) % 4];
        chord.forEach((n, j) => voice(out, hz(n - 12), k * 5, 5, 0.14, (j - 1) * 0.5, 1.2, 1.5));
      }
    },
  },
];

/** RMS to about −18 dBFS, peak at most −3 dBFS. */
function normalise([L, R]) {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < L.length; i++) {
    sum += L[i] * L[i] + R[i] * R[i];
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const rms = Math.sqrt(sum / (2 * L.length));
  const g = Math.min(10 ** (-18 / 20) / rms, 10 ** (-3 / 20) / peak);
  for (let i = 0; i < L.length; i++) {
    L[i] *= g;
    R[i] *= g;
  }
}

function wav([L, R]) {
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

if (process.platform !== 'darwin') {
  console.error('make-placeholder-music: needs macOS `afconvert` (ADR-0013 §2: the OS AAC converter)');
  process.exit(1);
}
fs.mkdirSync(DIR, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-maker-music-'));
const tracks = [];
try {
  for (const piece of PIECES) {
    const out = [new Float32Array(piece.seconds * RATE), new Float32Array(piece.seconds * RATE)];
    piece.make(out);
    normalise(out);
    const src = path.join(tmp, `${piece.id}.wav`);
    fs.writeFileSync(src, wav(out));
    const file = `${piece.id}.m4a`;
    const dest = path.join(DIR, file);
    // AAC-LC, 128 kbps constant bit rate, 48 kHz stereo, in an MPEG-4 audio file (ADR-0013 §2).
    const r = spawnSync('afconvert', ['-f', 'm4af', '-d', 'aac@48000', '-b', '128000', '-s', '0', src, dest], {
      stdio: 'inherit',
    });
    if (r.status !== 0) throw new Error(`afconvert failed for ${piece.id}`);
    const bytes = fs.readFileSync(dest);
    tracks.push({
      id: piece.id,
      file,
      title: piece.title,
      source: 'Generated by scripts/make-placeholder-music.mjs',
      licence: 'Placeholder — not for release',
      placeholder: true,
      durationUs: piece.seconds * 1_000_000,
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    });
    console.log(`${file}: ${(bytes.length / 1000).toFixed(1)} KB`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
const kept = fs.existsSync(MANIFEST)
  ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).tracks.filter((t) => !t.placeholder)
  : [];
const manifest = {
  $comment:
    'DEP-14 music pack (ADR-0013): one entry per bundled track (ENT-MusicTrack), checked by scripts/gen-music-manifest.mjs. Entries with "placeholder": true are generated stand-ins, not for release.',
  tracks: [...kept, ...tracks],
};
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${path.relative(abs('.'), MANIFEST)}`);
