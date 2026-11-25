// The Clip Maker looks pack (DEP-13, owner's own work; ADR-0007 §3 and outcome rule 3, ADR-0013 §1):
// the 16 RULE-09 looks of specs/30-experience/looks.md, each authored here as a parametric colour
// transform on gamma-encoded sRGB (the working space of ADR-0007 §1), written out as a 33³ `.cube`
// table and converted to the 8-bit PNG strip the tool ships (x = r + 33·b, y = g; MOD-Compositor
// `tableFromStrip`). Nothing is downloaded and no third-party look is used: every number below is ours.
//
//   node scripts/make-looks.mjs          writes src/assets/looks/<id>.png, looks.json, and the .cube
//                                         sources into src/assets/looks/cube/ (not committed: the
//                                         parameters below are the source; their checksums are in
//                                         looks.json)
//   node scripts/make-looks.mjs --check  fails when a committed strip differs from what the
//                                         parameters give
//
// Each strip is checked as it is written: its 8-bit storage error against the float table is at most
// ΔE00 1, and it is at most 108 KB (the incompressible bound; the budget is 30 KB per look, a warning).
// The owner signs off each look's result against its intent in looks.md ("look sign-off").
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './lib/png.mjs';
import { abs } from './lib/util.mjs';

export const LOOKS_DIR = 'src/assets/looks';
export const CUBE_DIR = `${LOOKS_DIR}/cube`;
export const PACK_FILE = `${LOOKS_DIR}/looks.json`;
/** ADR-0007 §3: 33 nodes per axis. */
export const N = 33;
export const STRIP_W = N * N;
export const STRIP_H = N;
/** ADR-0007 outcome rule 3: the budget per look, and the bound the build rejects above. */
export const LOOK_BUDGET = 30_000;
export const LOOK_MAX = 108_000;
/** ADR-0007 outcome rule 3: 8-bit storage error against the float table, ΔE00. */
export const STORAGE_MAX_DE = 1;

// ── colour operations on gamma-encoded sRGB in [0, 1] ─────────────────────────────────────────────
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** Contrast S-curve around mid-grey: p > 1 adds contrast, p < 1 softens; 0 and 1 stay put. */
const sCurve = (x, p) => (x < 0.5 ? 0.5 * Math.pow(2 * x, p) : 1 - 0.5 * Math.pow(2 - 2 * x, p));

/** The building blocks each look is made of (each returns c → c′). */
const op = {
  /** Per-channel mid-tone gamma: white and black stay, mid-tones lean (> 1 lifts that channel). */
  balance: (r, g, b) => (c) => [
    Math.pow(clamp01(c[0]), 1 / r),
    Math.pow(clamp01(c[1]), 1 / g),
    Math.pow(clamp01(c[2]), 1 / b),
  ],
  /** Per-channel gain: tints the whites too. */
  gain: (r, g, b) => (c) => [c[0] * r, c[1] * g, c[2] * b],
  /** Contrast on luminance, added to each channel (keeps the colour offsets). */
  contrast: (p) => (c) => {
    const y = luma(c);
    const d = sCurve(clamp01(y), p) - y;
    return c.map((v) => v + d);
  },
  /** Brightness on luminance by a gamma (< 1 brighter, > 1 darker), added to each channel. */
  gamma: (g) => (c) => {
    const y = clamp01(luma(c));
    const d = Math.pow(y, g) - y;
    return c.map((v) => v + d);
  },
  /** Black level and white level per channel (lifted blacks, rolled-off whites). */
  levels: (black, white) => (c) => c.map((v, i) => black[i] + v * (white[i] - black[i])),
  saturation: (s) => (c) => {
    const y = luma(c);
    return c.map((v) => y + (v - y) * s);
  },
  /** More saturation for muted colours than for colourful ones. */
  vibrance: (v) => (c) => {
    const y = luma(c);
    const chroma = Math.max(...c) - Math.min(...c);
    const s = 1 + v * (1 - clamp01(chroma)) ** 2;
    return c.map((x) => y + (x - y) * s);
  },
  /** Split toning: `shadows` added in proportion to darkness², `highlights` to brightness². */
  split: (shadows, highlights) => (c) => {
    const y = clamp01(luma(c));
    const ws = (1 - y) ** 2;
    const wh = y ** 2;
    return c.map((v, i) => v + shadows[i] * ws + highlights[i] * wh);
  },
  /** Saturation by brightness: `dark` in the shadows, `light` in the highlights. */
  saturationByLight: (dark, light) => (c) => {
    const y = clamp01(luma(c));
    const s = dark + (light - dark) * y;
    return c.map((v) => y + (v - y) * s);
  },
  /** Black and white (Rec. 709 weights), then a tone ramp black → mid → white (quadratic Bézier). */
  mono:
    (black = [0, 0, 0], mid = [0.5, 0.5, 0.5], white = [1, 1, 1]) =>
    (c) => {
      const y = clamp01(luma(c));
      return [0, 1, 2].map((i) => (1 - y) ** 2 * black[i] + 2 * y * (1 - y) * mid[i] + y ** 2 * white[i]);
    },
  /** Pulls warm (skin) hues toward orange and the rest toward teal, by how colourful they are. */
  tealOrange: (amount) => (c) => {
    const y = luma(c);
    const warmth = c[0] - c[2]; // > 0 for skin, fire, sunsets
    const chroma = Math.max(...c) - Math.min(...c);
    const w = Math.tanh(warmth * 4) * amount * Math.min(1, chroma * 3);
    const orange = [0.06, 0.01, -0.07];
    const teal = [-0.06, 0.01, 0.05];
    const t = w >= 0 ? orange : teal;
    const k = Math.abs(w) * (0.4 + 0.6 * (1 - Math.abs(2 * y - 1)));
    return c.map((v, i) => v + t[i] * k * 2);
  },
};

const chain =
  (...steps) =>
  (c) =>
    steps.reduce((x, f) => f(x), c).map(clamp01);

/**
 * The 16 looks (looks.md order). Each comment repeats the intent the owner signs the result off
 * against.
 */
export const LOOK_DEFINITIONS = {
  // Slightly brighter, cleaner whites, a bit more vibrance
  'natural-fresh': chain(op.gamma(0.92), op.vibrance(0.3), op.split([0, 0, 0], [-0.012, 0, 0.012]), op.contrast(1.06)),
  // Golden-hour warmth, soft skin tones
  'natural-warm': chain(
    op.balance(1.07, 1.02, 0.9),
    op.split([0.012, 0.004, -0.01], [0.03, 0.016, -0.03]),
    op.contrast(0.94),
    op.saturation(1.02),
  ),
  // Clean blue-leaning daylight
  'natural-cool': chain(
    op.balance(0.92, 0.99, 1.1),
    op.split([-0.01, 0, 0.015], [-0.01, 0.002, 0.012]),
    op.contrast(1.04),
  ),
  // Punchy colour for food and travel
  'natural-vivid': chain(op.saturation(1.3), op.vibrance(0.25), op.contrast(1.14)),
  // Lifted blacks, muted colour
  'film-faded': chain(op.contrast(0.9), op.saturation(0.68), op.levels([0.09, 0.085, 0.08], [0.95, 0.945, 0.93])),
  // Warm 1970s print: yellowed highlights, green-teal shadows
  'film-retro': chain(
    op.contrast(1.04),
    op.saturation(0.82),
    op.split([-0.04, 0.03, 0.02], [0.05, 0.035, -0.07]),
    op.levels([0.04, 0.045, 0.035], [0.98, 0.96, 0.9]),
  ),
  // Soft, airy, low-contrast pastel tones
  'film-pastel': chain(
    op.contrast(0.72),
    op.gamma(0.88),
    op.saturation(0.6),
    op.split([0.02, 0.01, 0.04], [0.02, 0, 0.02]),
    op.levels([0.12, 0.11, 0.13], [0.98, 0.97, 0.98]),
  ),
  // Instant-camera colour: cyan shadows, creamy highlights
  'film-instant': chain(
    op.contrast(1.08),
    op.saturation(0.88),
    op.split([-0.05, 0.015, 0.04], [0.03, 0.025, -0.035]),
    op.levels([0.05, 0.06, 0.07], [0.99, 0.97, 0.92]),
  ),
  // Teal shadows, warm skin
  'cine-teal-orange': chain(
    op.tealOrange(0.6),
    op.split([-0.05, 0.015, 0.05], [0.035, 0.01, -0.035]),
    op.contrast(1.12),
    op.saturation(1.05),
  ),
  // Darker, desaturated, cool greens
  'cine-moody': chain(
    op.gamma(1.3),
    op.saturation(0.66),
    op.split([-0.03, 0.02, 0.015], [-0.01, 0.005, 0.01]),
    op.contrast(1.1),
    op.levels([0.02, 0.025, 0.03], [0.96, 0.97, 0.97]),
  ),
  // Blue night with neon-friendly highlights
  'cine-night': chain(
    op.gamma(1.25),
    op.gain(0.8, 0.93, 1.12),
    op.split([-0.02, 0, 0.07], [0, 0.01, 0.02]),
    op.saturationByLight(0.7, 1.25),
    op.contrast(1.08),
  ),
  // Rich amber, deep contrast
  'cine-golden': chain(op.gain(1.06, 1.0, 0.84), op.balance(1.05, 1.0, 0.92), op.contrast(1.2), op.saturation(1.1)),
  // Neutral black and white, balanced contrast
  'bw-classic': chain(op.mono(), op.contrast(1.06)),
  // Punchy black and white with deep blacks
  'bw-high': chain(op.mono(), op.contrast(1.45), op.levels([-0.03, -0.03, -0.03], [1.02, 1.02, 1.02])),
  // Low-contrast, matte black and white
  'bw-soft': chain(op.mono(), op.contrast(0.8), op.levels([0.09, 0.09, 0.09], [0.94, 0.94, 0.94])),
  // Warm brown monochrome
  'bw-sepia': chain(op.mono([0.05, 0.03, 0.015], [0.58, 0.47, 0.35], [1, 0.97, 0.88]), op.contrast(1.04)),
};

/** The look ids in looks.md order, read from the spec (the pack must cover exactly these). */
export function specLookIds() {
  // The looks table only: the "Duotone pairs" section after it (RULE-24, D-053) lists pairs, not looks.
  const md = fs.readFileSync(abs('specs/30-experience/looks.md'), 'utf8').split(/^## Duotone pairs/m)[0];
  return [...md.matchAll(/^\|[^|]*\|\s*`([a-z]+(?:-[a-z]+)+)`\s*\|/gm)].map((m) => m[1]);
}

/** The look's float table: 33³ RGB triples in [0, 1], red fastest, then green, then blue (.cube order). */
export function floatTable(id) {
  const f = LOOK_DEFINITIONS[id];
  if (!f) throw new Error(`make-looks: no definition for ${id}`);
  const out = new Float64Array(N * N * N * 3);
  for (let b = 0; b < N; b++)
    for (let g = 0; g < N; g++)
      for (let r = 0; r < N; r++) {
        const c = f([r / (N - 1), g / (N - 1), b / (N - 1)]);
        const o = ((b * N + g) * N + r) * 3;
        out[o] = c[0];
        out[o + 1] = c[1];
        out[o + 2] = c[2];
      }
  return out;
}

/** The identity float table (tests: the strip of no change). */
export function identityFloatTable() {
  const out = new Float64Array(N * N * N * 3);
  for (let b = 0; b < N; b++)
    for (let g = 0; g < N; g++)
      for (let r = 0; r < N; r++) {
        const o = ((b * N + g) * N + r) * 3;
        out[o] = r / (N - 1);
        out[o + 1] = g / (N - 1);
        out[o + 2] = b / (N - 1);
      }
  return out;
}

/** The `.cube` text of a float table (Adobe/Resolve 3D LUT format, 6 decimals). */
export function cubeText(title, table) {
  const lines = [
    `# Clip Maker looks pack (DEP-13): owner's own work, generated by scripts/make-looks.mjs`,
    `TITLE "${title}"`,
    `LUT_3D_SIZE ${N}`,
    'DOMAIN_MIN 0.0 0.0 0.0',
    'DOMAIN_MAX 1.0 1.0 1.0',
  ];
  for (let i = 0; i < table.length; i += 3)
    lines.push(`${table[i].toFixed(6)} ${table[i + 1].toFixed(6)} ${table[i + 2].toFixed(6)}`);
  return lines.join('\n') + '\n';
}

/** Parses a 33³ `.cube` (domain 0–1) back into a float table. */
export function parseCube(text) {
  const values = [];
  let size = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^LUT_3D_SIZE\s+(\d+)$/.exec(line);
    if (m) size = Number(m[1]);
    else if (/^-?[\d.]/.test(line)) values.push(...line.split(/\s+/).map(Number));
    else if (/^DOMAIN_(MIN|MAX)/.test(line)) {
      const v = line.split(/\s+/).slice(1).map(Number);
      const want = line.startsWith('DOMAIN_MIN') ? 0 : 1;
      if (v.some((x) => x !== want)) throw new Error('cube: only the 0–1 domain');
    }
  }
  if (size !== N) throw new Error(`cube: LUT_3D_SIZE must be ${N}`);
  if (values.length !== N * N * N * 3 || values.some((v) => !Number.isFinite(v)))
    throw new Error('cube: wrong number of values');
  return Float64Array.from(values);
}

/** The strip's RGB bytes (x = r + 33·b, y = g) of a float table, rounded to 8 bits. */
export function stripRgb(table) {
  const out = new Uint8Array(STRIP_W * STRIP_H * 3);
  for (let b = 0; b < N; b++)
    for (let g = 0; g < N; g++)
      for (let r = 0; r < N; r++) {
        const t = ((b * N + g) * N + r) * 3;
        const s = (g * STRIP_W + b * N + r) * 3;
        for (let k = 0; k < 3; k++) out[s + k] = Math.round(clamp01(table[t + k]) * 255);
      }
  return out;
}

// ── ΔE00 (sRGB D65 → CIELAB → CIEDE2000), for the storage-error check ───────────────────────────
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lab([r, g, b]) {
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export function de00(c1, c2) {
  const [L1, a1, b1] = lab(c1);
  const [L2, a2, b2] = lab(c2);
  const rad = Math.PI / 180;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h = (y, x) => {
    if (x === 0 && y === 0) return 0;
    const d = Math.atan2(y, x) / rad;
    return d < 0 ? d + 360 : d;
  };
  const h1p = h(b1, a1p);
  const h2p = h(b2, a2p);
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp = h1p + h2p < 360 ? hbp + 360 : hbp - 360;
    hbp /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hbp - 30) * rad) +
    0.24 * Math.cos(2 * hbp * rad) +
    0.32 * Math.cos((3 * hbp + 6) * rad) -
    0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/** ADR-0007 outcome rule 3: the strip's largest and mean ΔE00 against the float table, over every node. */
export function storageError(table, rgba) {
  let max = 0;
  let sum = 0;
  const n = N * N * N;
  for (let b = 0; b < N; b++)
    for (let g = 0; g < N; g++)
      for (let r = 0; r < N; r++) {
        const t = ((b * N + g) * N + r) * 3;
        const s = (g * STRIP_W + b * N + r) * 4;
        const want = [0, 1, 2].map((k) => clamp01(table[t + k]));
        const got = [0, 1, 2].map((k) => rgba[s + k] / 255);
        const d = de00(want, got);
        max = Math.max(max, d);
        sum += d;
      }
  return { max, mean: sum / n };
}

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** Builds one look: its `.cube` text, PNG strip and the pack entry. Throws when it breaks a bound. */
export function buildLook(id) {
  const table = floatTable(id);
  const cube = cubeText(id, table);
  // The strip is made from the .cube source, as any authored .cube would be converted.
  const parsed = parseCube(cube);
  const png = encodePng(STRIP_W, STRIP_H, stripRgb(parsed));
  const { rgba } = decodePng(png);
  const err = storageError(parsed, rgba);
  if (err.max > STORAGE_MAX_DE)
    throw new Error(`${id}: 8-bit storage error ΔE00 ${err.max.toFixed(2)} > ${STORAGE_MAX_DE} (ADR-0007)`);
  if (png.length > LOOK_MAX) throw new Error(`${id}: strip is ${png.length} bytes, over ${LOOK_MAX} (ADR-0007)`);
  return {
    cube,
    png,
    entry: {
      id,
      file: `${id}.png`,
      bytes: png.length,
      sha256: sha256(png),
      cubeSha256: sha256(cube),
      storageDeMax: Number(err.max.toFixed(3)),
      storageDeMean: Number(err.mean.toFixed(3)),
    },
  };
}

/** The whole pack in looks.md order. */
export function buildPack() {
  const ids = specLookIds();
  const missing = ids.filter((id) => !LOOK_DEFINITIONS[id]);
  const extra = Object.keys(LOOK_DEFINITIONS).filter((id) => !ids.includes(id));
  if (missing.length || extra.length)
    throw new Error(`make-looks: definitions differ from looks.md (missing ${missing}, extra ${extra})`);
  return ids.map(buildLook);
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const looks = buildPack();
  const problems = [];
  for (const { png, cube, entry } of looks) {
    const pngPath = abs(LOOKS_DIR, entry.file);
    if (check) {
      if (!fs.existsSync(pngPath)) problems.push(`${entry.file} missing`);
      else {
        // zlib output may differ between Node versions: compare pixels, not bytes.
        const a = decodePng(fs.readFileSync(pngPath)).rgba;
        const b = decodePng(png).rgba;
        if (Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0)
          problems.push(`${entry.file} differs from its parameters`);
      }
      continue;
    }
    fs.mkdirSync(abs(CUBE_DIR), { recursive: true });
    fs.writeFileSync(abs(CUBE_DIR, `${entry.id}.cube`), cube);
    fs.writeFileSync(pngPath, png);
    const note = entry.bytes > LOOK_BUDGET ? ` (over the ${LOOK_BUDGET}-byte budget per look)` : '';
    console.log(
      `${entry.id.padEnd(17)} ${String(entry.bytes).padStart(6)} bytes  storage ΔE00 max ${entry.storageDeMax} mean ${entry.storageDeMean}${note}`,
    );
  }
  if (check) {
    if (problems.length) {
      console.error(problems.map((p) => `✗ ${p}`).join('\n'));
      process.exit(1);
    }
    console.log('looks: strips match their parameters');
  } else {
    const total = looks.reduce((s, l) => s + l.entry.bytes, 0);
    const pack = {
      about:
        "Clip Maker looks pack (DEP-13): owner's own work, generated by scripts/make-looks.mjs from parametric transforms; 33³ tables as 8-bit PNG strips (x = r + 33·b, y = g). The .cube sources are regenerated by the script into cube/ (not committed); cubeSha256 is their checksum.",
      size: N,
      looks: looks.map((l) => l.entry),
    };
    fs.writeFileSync(abs(PACK_FILE), JSON.stringify(pack, null, 2) + '\n');
    console.log(`looks: ${looks.length} strips, ${total} bytes in total → ${PACK_FILE}`);
  }
}
