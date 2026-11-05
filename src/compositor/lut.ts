// MOD-Compositor — look tables (ADR-0007 §3 and outcome rule 3): 33 × 33 × 33 RGB tables stored as
// 8-bit PNG strips (x = r + 33·b, y = g), held as RGBA bytes indexed ((b·33 + g)·33 + r)·4 and
// uploaded as 3D textures with trilinear filtering. Promoted from SP-gpu-color (storage error ΔE00
// mean 0.08, max 0.78; no banding).
// Implements: RULE-09 (the look applied through its table; intensity mixes with the input).

/** Table size per axis. */
export const LUT_N = 33;
/** Bytes of one table (RGBA). */
export const LUT_BYTES = LUT_N * LUT_N * LUT_N * 4;
/** The strip's size in pixels. */
export const STRIP_WIDTH = LUT_N * LUT_N;
export const STRIP_HEIGHT = LUT_N;

/** A 33³ table as RGBA bytes, index ((b·33 + g)·33 + r)·4. */
export type LookTable = Uint8Array;

const index = (r: number, g: number, b: number): number => ((b * LUT_N + g) * LUT_N + r) * 4;

/** The identity table (each node holds its own colour, rounded to 8 bits). */
export function identityTable(): LookTable {
  const t = new Uint8Array(LUT_BYTES);
  const s = LUT_N - 1;
  for (let b = 0; b < LUT_N; b++)
    for (let g = 0; g < LUT_N; g++)
      for (let r = 0; r < LUT_N; r++) {
        const i = index(r, g, b);
        t[i] = Math.round((r * 255) / s);
        t[i + 1] = Math.round((g * 255) / s);
        t[i + 2] = Math.round((b * 255) / s);
        t[i + 3] = 255;
      }
  return t;
}

/**
 * Re-lays a decoded strip (RGBA pixels, row-major, `width` = 33², `height` = 33, decoded without colour
 * management) into a table. Throws on a wrong size.
 */
export function tableFromStrip(pixels: ArrayLike<number>, width: number, height: number): LookTable {
  if (width !== STRIP_WIDTH || height !== STRIP_HEIGHT || pixels.length !== width * height * 4)
    throw new RangeError(`look strip must be ${STRIP_WIDTH} × ${STRIP_HEIGHT} RGBA, got ${width} × ${height}`);
  const t = new Uint8Array(LUT_BYTES);
  for (let b = 0; b < LUT_N; b++)
    for (let g = 0; g < LUT_N; g++)
      for (let r = 0; r < LUT_N; r++) {
        const s = (g * STRIP_WIDTH + b * LUT_N + r) * 4;
        const o = index(r, g, b);
        t[o] = pixels[s]!;
        t[o + 1] = pixels[s + 1]!;
        t[o + 2] = pixels[s + 2]!;
        t[o + 3] = 255;
      }
  return t;
}

/** The inverse of `tableFromStrip` (tests and the build's look packer). */
export function stripFromTable(table: LookTable): Uint8Array {
  const p = new Uint8Array(STRIP_WIDTH * STRIP_HEIGHT * 4);
  for (let b = 0; b < LUT_N; b++)
    for (let g = 0; g < LUT_N; g++)
      for (let r = 0; r < LUT_N; r++) {
        const s = (g * STRIP_WIDTH + b * LUT_N + r) * 4;
        const o = index(r, g, b);
        p[s] = table[o]!;
        p[s + 1] = table[o + 1]!;
        p[s + 2] = table[o + 2]!;
        p[s + 3] = 255;
      }
  return p;
}

/**
 * Trilinear lookup on the 8-bit nodes, as the GPU samples the 3D texture at
 * `c · 32/33 + 0.5/33` (texel centres). `rgb` in [0, 1]; returns [0, 1].
 */
export function lutSample(table: LookTable, rgb: readonly [number, number, number]): [number, number, number] {
  const s = LUT_N - 1;
  const f = rgb.map((v) => Math.min(1, Math.max(0, v)) * s) as [number, number, number];
  const lo = f.map((v) => Math.min(Math.floor(v), s - 1)) as [number, number, number];
  const d = [f[0] - lo[0], f[1] - lo[1], f[2] - lo[2]];
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 8; k++) {
    const bx = k & 1;
    const by = (k >> 1) & 1;
    const bz = (k >> 2) & 1;
    const w = (bx ? d[0]! : 1 - d[0]!) * (by ? d[1]! : 1 - d[1]!) * (bz ? d[2]! : 1 - d[2]!);
    const i = index(lo[0] + bx, lo[1] + by, lo[2] + bz);
    out[0] += w * table[i]!;
    out[1] += w * table[i + 1]!;
    out[2] += w * table[i + 2]!;
  }
  return [out[0] / 255, out[1] / 255, out[2] / 255];
}

/** Decodes a PNG strip without colour management (ADR-0007 §3) into a table. Browser/worker only. */
export async function decodeLookStrip(png: Blob): Promise<LookTable> {
  const bmp = await createImageBitmap(png, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D context unavailable');
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return tableFromStrip(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
}
