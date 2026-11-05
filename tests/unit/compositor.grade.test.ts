// MOD-Compositor grade maths on the CPU reference (ADR-0006 §6, ADR-0007 outcome rule 4): RULE-08
// quality bars on the 256-step grey ramp at every adjustment's min and max, the order of the chain,
// RULE-09 intensity, deterministic grain (ADR-0006 §4).
import { describe, expect, it } from 'vitest';
import { RULE_08, type Adjustments } from '../../src/core';
import {
  clipHash,
  gradeUniforms,
  grainCell,
  grainHash,
  identityTable,
  NEUTRAL,
  pcg,
  reference,
} from '../../src/compositor';
import { deRgb, GREY_RAMP, rampBars, type Rgb } from '../support/colour';

const ALL: readonly (keyof Adjustments)[] = [...RULE_08.bipolar, ...RULE_08.unipolar] as (keyof Adjustments)[];
/** Spatial or per-position adjustments are judged elsewhere (sharpen: flat ramp; vignette/grain: finish). */
const GRADE_PASS: readonly (keyof Adjustments)[] = ALL.filter((a) => !['sharpen', 'vignette', 'grain'].includes(a));

const ramp = (a: Adjustments): Rgb[] => GREY_RAMP.map((c) => reference.grade(c, a) as Rgb);

describe('RULE-08 adjustments (CPU reference, full precision)', () => {
  it('RULE-08 with every adjustment at default and no look the ramp is unchanged (ΔE00 < 0.5)', () => {
    const out = ramp({});
    for (let i = 0; i < 256; i++) expect(deRgb(out[i]!, GREY_RAMP[i]!)).toBeLessThan(0.5);
  });

  for (const name of GRADE_PASS) {
    const range = (RULE_08.bipolar as readonly string[]).includes(name)
      ? [RULE_08.bipolarMin, RULE_08.bipolarMax]
      : [RULE_08.unipolarMax];
    for (const v of range) {
      it(`RULE-08 ${name} at ${v}: the ramp never reverses, unclipped steps stay distinct, no step over 2× default`, () => {
        const bars = rampBars(ramp({ [name]: v }));
        expect(bars.reversals).toBe(0);
        expect(bars.merged).toBe(0);
        expect(bars.pass).toBe(true);
      });
    }
  }

  it('RULE-08 vignette darkens toward the clip edge and keeps the centre (judged at each position)', () => {
    const u = gradeUniforms({ vignette: 100 }, null);
    const at = (uv: [number, number]): Rgb =>
      reference.finish([0.5, 0.5, 0.5], u, { uv, frag: [0, 0], frame: 0, clip: 0, s: 1080 }) as Rgb;
    expect(at([0.5, 0.5])[0]).toBeCloseTo(0.5, 6);
    expect(at([0, 0])[0]).toBeLessThan(at([0.25, 0.25])[0]);
    // Along the ramp at a fixed position the order is kept.
    const pos: [number, number] = [0.1, 0.1];
    const out = GREY_RAMP.map(
      (c) => reference.finish(c, u, { uv: pos, frag: [0, 0], frame: 0, clip: 0, s: 1080 }) as Rgb,
    );
    expect(rampBars(out).reversals).toBe(0);
  });

  it('RULE-08 temperature warms (more red than blue) and tint moves green', () => {
    const warm = reference.grade([0.5, 0.5, 0.5], { temperature: 60 });
    expect(warm[0]).toBeGreaterThan(warm[2]);
    const magenta = reference.grade([0.5, 0.5, 0.5], { tint: 60 });
    expect(magenta[1]).toBeLessThan(0.5);
  });

  it('RULE-08 saturation −100 gives grey; vibrance changes muted colours more than saturated ones', () => {
    const g = reference.grade([0.8, 0.3, 0.2], { saturation: -100 });
    expect(Math.abs(g[0] - g[1])).toBeLessThan(1e-9);
    const muted = reference.grade([0.55, 0.5, 0.45], { vibrance: 100 });
    const vivid = reference.grade([0.9, 0.1, 0.1], { vibrance: 100 });
    const gain = (o: readonly number[], i: readonly number[]): number =>
      (Math.max(...o) - Math.min(...o)) / (Math.max(...i) - Math.min(...i));
    expect(gain(muted, [0.55, 0.5, 0.45])).toBeGreaterThan(gain(vivid, [0.9, 0.1, 0.1]));
  });

  it('RULE-08 the look applies after saturation and before fade (order of the chain)', () => {
    // A table that turns everything to its blue channel: saturation −100 first makes it grey anyway.
    const t = identityTable();
    for (let i = 0; i < t.length; i += 4) t[i] = t[i + 1] = t[i + 2]!;
    const c = reference.grade([0.9, 0.2, 0.1], { saturation: -100 }, { id: 'x', intensity: 100 }, t);
    expect(Math.abs(c[0] - c[2])).toBeLessThan(0.02);
    // Fade lifts the black after the look: black → 0.25 × fade.
    const f = reference.grade([0, 0, 0], { fade: 100 }, { id: 'x', intensity: 100 }, identityTable());
    expect(f[0]).toBeCloseTo(0.25, 2);
  });
});

describe('RULE-09 look intensity', () => {
  it('RULE-09 intensity 0 equals None and 100 applies the table fully', () => {
    const swap = identityTable();
    for (let i = 0; i < swap.length; i += 4) [swap[i], swap[i + 2]] = [swap[i + 2]!, swap[i]!];
    const c: Rgb = [0.8, 0.4, 0.1];
    expect(reference.grade(c, {}, { id: 'x', intensity: 0 }, swap)).toEqual(reference.grade(c, {}, null, swap));
    const full = reference.grade(c, {}, { id: 'x', intensity: 100 }, swap);
    expect(full[0]).toBeCloseTo(0.1, 1);
    expect(full[2]).toBeCloseTo(0.8, 1);
    expect(gradeUniforms({}, { id: 'x', intensity: 0 }).look).toBeNull();
  });

  it('RULE-08 compare draws the clip without adjustments and look (NEUTRAL)', () => {
    expect(NEUTRAL).toEqual(gradeUniforms({}, null));
    expect(NEUTRAL.lookMix).toBe(0);
  });
});

describe('ADR-0006 §4 deterministic grain', () => {
  it('RULE-08 grain is pixel-identical for the same output cell, frame and clip, and differs by frame', () => {
    expect(grainHash(10, 20, 5, clipHash('a'))).toBe(grainHash(10, 20, 5, clipHash('a')));
    expect(grainHash(10, 20, 5, clipHash('a'))).not.toBe(grainHash(10, 20, 6, clipHash('a')));
    expect(grainHash(10, 20, 5, clipHash('a'))).not.toBe(grainHash(10, 20, 5, clipHash('b')));
    const u = gradeUniforms({ grain: 100 }, null);
    const at = { uv: [0.5, 0.5] as [number, number], frag: [33, 44] as [number, number], frame: 9, clip: 7, s: 1080 };
    expect(reference.finish([0.5, 0.5, 0.5], u, at)).toEqual(reference.finish([0.5, 0.5, 0.5], u, at));
  });

  it('RULE-08 grain size is relative to s (2 px cells at 1080, 4 at 2160)', () => {
    expect(grainCell(1080)).toBe(2);
    expect(grainCell(2160)).toBe(4);
  });

  it('ADR-0006 §4 the hash is uint32 PCG (matches the GLSL constants)', () => {
    expect(pcg(0)).toBe(pcg(0));
    expect(pcg(1)).toBeGreaterThanOrEqual(0);
    expect(pcg(1)).toBeLessThan(2 ** 32);
    expect(pcg(0)).toBe(129708002); // computed independently in 64-bit integers
  });
});
