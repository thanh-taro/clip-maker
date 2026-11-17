// MOD-Build — the looks pack (DEP-13, ADR-0007 §3 and outcome rule 3, ADR-0013 §1): 16 looks authored as
// parametric transforms in scripts/make-looks.mjs, written as 33³ `.cube` sources and converted to 8-bit PNG
// strips with checksums. The committed strips must be what the parameters give, within the storage and
// size bounds; the identity strip is no change.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM build script without type declarations
import { LOOK_MAX_BYTES, LOOKS_BUDGET, looksPack } from '../../scripts/gen-looks.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { decodePng, encodePng } from '../../scripts/lib/png.mjs';
import {
  buildLook,
  cubeText,
  floatTable,
  identityFloatTable,
  LOOK_BUDGET,
  LOOK_DEFINITIONS,
  parseCube,
  specLookIds,
  storageError,
  stripRgb,
  STRIP_H,
  STRIP_W,
  // @ts-expect-error -- plain ESM build script without type declarations
} from '../../scripts/make-looks.mjs';
import { gradeUniforms, identityTable, lutSample, reference, tableFromStrip } from '../../src/compositor';
import { LOOK_GROUPS, LOOK_IDS, LOOKS } from '../../src/core';
import { deRgb } from '../support/colour';

interface PackEntry {
  id: string;
  file: string;
  bytes: number;
  sha256: string;
  cubeSha256: string;
  storageDeMax: number;
}
const pack = (): { looks: PackEntry[]; total: number } => looksPack();
const file = (name: string): Uint8Array => fs.readFileSync(new URL(`../../src/assets/looks/${name}`, import.meta.url));
const decoded = (name: string): Uint8Array => (decodePng(file(name)) as { rgba: Uint8Array }).rgba;
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const u32 = (b: Uint8Array, at: number): number => new DataView(b.buffer, b.byteOffset).getUint32(at);
const has = (b: Uint8Array, text: string): boolean => {
  const t = Array.from(text, (c) => c.charCodeAt(0));
  for (let i = 0; i + t.length <= b.length; i++) if (t.every((c, k) => b[i + k] === c)) return true;
  return false;
};

describe('MOD-Build looks pack (DEP-13)', () => {
  it('RULE-09 the pack holds the 16 looks of looks.md in four groups, each a parametric definition of our own', () => {
    expect(LOOK_IDS).toHaveLength(16);
    expect(LOOK_GROUPS).toEqual(['Natural', 'Film', 'Cinematic', 'Black & White']);
    for (const g of LOOK_GROUPS) expect(LOOK_IDS.filter((id) => LOOKS[id].group === g)).toHaveLength(4);
    expect(specLookIds()).toEqual([...LOOK_IDS]);
    expect(Object.keys(LOOK_DEFINITIONS)).toEqual([...LOOK_IDS]);
    expect(pack().looks.map((l) => l.id)).toEqual([...LOOK_IDS]);
  });

  it('ADR-0013 §1 every strip matches its checksum and byte size (gen refuses a changed strip)', () => {
    // looksPack() throws on a missing strip, a size or checksum mismatch, a wrong strip size or an oversize file.
    const { looks, total } = pack();
    for (const l of looks) {
      expect(file(l.file).length).toBe(l.bytes);
      expect(l.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(l.cubeSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(total).toBe(looks.reduce((s, l) => s + l.bytes, 0));
  });

  it('DEP-13 each committed strip is exactly what its parameters give (pixels), and its .cube source matches its checksum', () => {
    for (const l of pack().looks) {
      const built = buildLook(l.id) as { png: Uint8Array; entry: PackEntry };
      expect(same(decoded(l.file), (decodePng(built.png) as { rgba: Uint8Array }).rgba), l.id).toBe(true);
      expect(built.entry.cubeSha256, l.id).toBe(l.cubeSha256);
    }
  });

  it('ADR-0007 outcome rule 3 each strip is within 30 KB (rejected over 108 KB), the pack within 0.5 MB, and 8-bit storage error ≤ ΔE00 1', () => {
    expect(LOOK_MAX_BYTES).toBe(108_000);
    expect(LOOKS_BUDGET).toBe(500_000);
    const { looks, total } = pack();
    for (const l of looks) {
      expect(l.bytes, l.id).toBeLessThanOrEqual(LOOK_BUDGET);
      expect(l.storageDeMax, l.id).toBeLessThanOrEqual(1);
    }
    expect(total).toBeLessThanOrEqual(LOOKS_BUDGET);
    // Recomputed for two looks from the committed file, not taken from the pack's own record.
    for (const id of ['cine-teal-orange', 'bw-sepia']) {
      const err = storageError(floatTable(id), decoded(`${id}.png`)) as { max: number };
      expect(err.max, id).toBeLessThanOrEqual(1);
    }
  });

  it('ADR-0007 §3 a strip is a plain 1089 × 33 RGB PNG with no colour chunk (browsers decode its values untouched)', () => {
    for (const l of pack().looks) {
      const b = file(l.file);
      expect(u32(b, 16)).toBe(STRIP_W);
      expect(u32(b, 20)).toBe(STRIP_H);
      for (const chunk of ['gAMA', 'cHRM', 'sRGB', 'iCCP']) expect(has(b, chunk), chunk).toBe(false);
    }
    const cut = new Uint8Array(48);
    cut.set(file('bw-classic.png').subarray(0, 40));
    expect(() => decodePng(cut)).toThrow();
  });

  it('RULE-09 the identity strip is no change: through .cube, PNG and the strip layout it is the identity table', () => {
    const cube = cubeText('identity', identityFloatTable());
    const png = encodePng(STRIP_W, STRIP_H, stripRgb(parseCube(cube)));
    const { width, height, rgba } = decodePng(png) as { width: number; height: number; rgba: Uint8Array };
    const table = tableFromStrip(rgba, width, height);
    expect(table).toEqual(identityTable());
    for (const c of [
      [0.1, 0.5, 0.9],
      [0.73, 0.21, 0.4],
      [1, 1, 1],
    ] as const)
      expect(deRgb(lutSample(table, c), c)).toBeLessThan(0.5);
  });

  it('RULE-09 a look at intensity 0 equals None; at 100 it is the table', () => {
    const table = tableFromStrip(decoded('film-retro.png'), STRIP_W, STRIP_H);
    const c: [number, number, number] = [0.6, 0.4, 0.3];
    const none = reference.grade(c, {}, null, null);
    expect(reference.grade(c, {}, { id: 'film-retro', intensity: 0 }, table)).toEqual(none);
    expect(gradeUniforms({}, { id: 'film-retro', intensity: 0 }).look).toBeNull();
    const full = reference.grade(c, {}, { id: 'film-retro', intensity: 100 }, table);
    expect(deRgb(full, lutSample(table, c))).toBeLessThan(0.01);
    expect(deRgb(full, none)).toBeGreaterThan(1);
  });

  it('DEP-13 the .cube writer and reader round-trip a table within 6 decimals; a wrong size is refused', () => {
    const t = floatTable('natural-warm') as Float64Array;
    const back = parseCube(cubeText('Warm', t)) as Float64Array;
    expect(back.length).toBe(t.length);
    let worst = 0;
    for (let i = 0; i < t.length; i++) worst = Math.max(worst, Math.abs(back[i]! - t[i]!));
    expect(worst).toBeLessThanOrEqual(5e-7);
    expect(() => parseCube('LUT_3D_SIZE 17\n0 0 0\n')).toThrow(/LUT_3D_SIZE/);
  });

  it('RULE-09 every look changes the picture, and the Black & White looks have no colour', () => {
    const identity = identityTable();
    for (const id of LOOK_IDS) {
      const t = tableFromStrip(decoded(`${id}.png`), STRIP_W, STRIP_H);
      let changed = 0;
      for (let i = 0; i < t.length; i++) changed = Math.max(changed, Math.abs(t[i]! - identity[i]!));
      expect(changed, id).toBeGreaterThan(8);
      if (LOOKS[id].group === 'Black & White' && id !== 'bw-sepia') {
        const c = lutSample(t, [0.8, 0.3, 0.2]);
        expect(Math.max(...c) - Math.min(...c), id).toBeLessThan(1 / 255 + 1e-9);
      }
    }
  });
});
