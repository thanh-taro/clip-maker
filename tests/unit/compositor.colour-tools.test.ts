// MOD-Compositor colour tools on the CPU reference (ADR-0017 §8: the oracle the GPU must match): the RULE-24
// quality bars on the 24-patch chart, the 256-step grey ramp and the 360-step hue ring, the order of the
// chain, and the rendered halves of F-024…F-027's acceptance criteria. (Their UI halves — dragging, keyboard,
// announcements — come with the panels; the GPU and export halves are in tests/e2e/colour-tools.spec.ts.)
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM build script without type declarations
import { decodePng } from '../../scripts/lib/png.mjs';
import { NEUTRAL, reference, tableFromStrip, gradeUniforms, type LookTable } from '../../src/compositor';
import {
  COLOUR_RANGES,
  DUOTONE_PAIR_COLOURS,
  DUOTONE_PAIRS,
  duotoneLab,
  gapAfter,
  gapBefore,
  hexRgb,
  okLch,
  oklabToSrgb,
  popKeep,
  RANGE_CENTRES,
  rangeWeight,
  smoothstep,
  splitWeights,
  srgbToOklab,
  wheelOkHue,
  type Adjustments,
  type ColourTools,
  type Look,
} from '../../src/core';
import { CHART_24, chroma, de00, deRgb, DEFAULT_MAX_STEP, GREY_RAMP, lab, type Rgb } from '../support/colour';
import { centreStep, hueDiff, hueRing } from '../support/hue-ring';

const RING = hueRing();
const CHART: readonly Rgb[] = CHART_24.map(([r, g, b]) => [r / 255, g / 255, b / 255] as const);
const render = (
  input: readonly Rgb[],
  tools: ColourTools,
  a: Adjustments = {},
  look: Look = null,
  table: LookTable | null = null,
): Rgb[] => input.map((c) => reference.grade(c, a, look, table, tools) as Rgb);
const ok = (c: Rgb) => okLch(srgbToOklab(c));
/** Lightness on RULE-24's scale (0–100): OKLab L × 100. */
const okL = (c: Rgb): number => ok(c)[0] * 100;
const okH = (c: Rgb): number => ok(c)[2];
const C = (c: Rgb): number => chroma(lab(c));
const lookTable = (id: string): LookTable => {
  const png = fs.readFileSync(new URL(`../../src/assets/looks/${id}.png`, import.meta.url));
  const { width, height, rgba } = decodePng(png) as { width: number; height: number; rgba: Uint8Array };
  return tableFromStrip(rgba, width, height);
};
/** Largest ΔE00 between adjacent steps of an output ramp. */
const maxAdjacent = (out: readonly Rgb[]): number => {
  let m = 0;
  for (let i = 1; i < out.length; i++) m = Math.max(m, deRgb(out[i - 1]!, out[i]!));
  return m;
};
/** The ramp step whose OK lightness is nearest `L` (0–100). */
const rampStepAt = (L: number): number => {
  let best = 0;
  for (let i = 0; i < 256; i++) if (Math.abs(okL(GREY_RAMP[i]!) - L) < Math.abs(okL(GREY_RAMP[best]!) - L)) best = i;
  return best;
};
const mixerAll = (name: 'hue' | 'saturation' | 'lightness', v: (i: number) => number): ColourTools => ({
  mixer: Object.fromEntries(COLOUR_RANGES.map((r, i) => [r, { [name]: v(i) }])),
});

describe('RULE-24 colour tools at default (CPU reference)', () => {
  it('RULE-24 with every colour tool at default the output matches the RULE-08 result exactly (chart, ramp, ring)', () => {
    const defaults: ColourTools = {
      mixer: { red: { hue: 0, saturation: 0, lightness: 0 } },
      pop: { colour: null, range: 70, amount: 100 },
      splitToning: { shadowsHue: 100, shadowsStrength: 0, highlightsStrength: 0, balance: 40 },
      duotone: { on: false, pair: 'plum-gold', shadows: '#3A1645', highlights: '#F2C14E', strength: 100 },
    };
    const u = gradeUniforms({}, null, defaults);
    expect([u.hue, u.split, u.duotone]).toEqual([null, null, null]);
    for (const set of [CHART, GREY_RAMP, RING])
      for (const c of set)
        expect(reference.grade(c, { contrast: 20 }, null, null, defaults)).toEqual(
          reference.grade(c, { contrast: 20 }),
        );
  });

  it('RULE-24 compare draws the clip without adjustments, colour tools and look (NEUTRAL has no colour stage)', () => {
    expect([NEUTRAL.hue, NEUTRAL.split, NEUTRAL.duotone]).toEqual([null, null, null]);
  });
});

describe('F-024 colour mixer (CPU reference)', () => {
  it('F-024.AC1 render: Red Saturation −100 leaves the hue ring’s Red centre step with C* below 2', () => {
    const out = render(RING, { mixer: { red: { saturation: -100 } } });
    expect(C(out[centreStep(0)]!)).toBeLessThan(2);
  });

  it('F-024.AC2 Orange Hue +100 moves the Orange centre step to the Yellow centre’s hue; Aqua…Magenta change by < ΔE00 0.5', () => {
    const out = render(RING, { mixer: { orange: { hue: 100 } } });
    expect(Math.abs(hueDiff(okH(out[centreStep(1)]!), RANGE_CENTRES[2]!))).toBeLessThanOrEqual(1);
    for (let k = centreStep(4); k <= centreStep(7); k++) expect(deRgb(out[k]!, RING[k]!)).toBeLessThan(0.5);
  });

  describe('F-024.AC3 R2 greys untouched, smooth weights, lightness kept', () => {
    const configs: [string, ColourTools][] = [];
    for (const r of COLOUR_RANGES)
      for (const name of ['hue', 'saturation', 'lightness'] as const)
        for (const v of [-100, 100]) configs.push([`${r} ${name} ${v}`, { mixer: { [r]: { [name]: v } } }]);
    for (const name of ['hue', 'saturation', 'lightness'] as const) {
      configs.push([`all ${name} +100`, mixerAll(name, () => 100)]);
      configs.push([`all ${name} −100`, mixerAll(name, () => -100)]);
      configs.push([`neighbours opposite ${name}`, mixerAll(name, (i) => (i % 2 ? -100 : 100))]);
    }
    configs.push([
      'all 24 at ±100',
      {
        mixer: Object.fromEntries(
          COLOUR_RANGES.map((r, i) => [r, { hue: i % 2 ? -100 : 100, saturation: 100, lightness: -100 }]),
        ),
      },
    ]);

    it('F-024.AC3 no grey-ramp step changes by ΔE00 0.5 or more at any of the 24 values ±100, all at once, or neighbours opposite', () => {
      for (const [name, tools] of configs) {
        const out = render(GREY_RAMP, tools);
        for (let i = 0; i < 256; i++) expect(deRgb(out[i]!, GREY_RAMP[i]!), `${name} step ${i}`).toBeLessThan(0.5);
      }
    });

    it('F-024.AC3 every range weight changes continuously and by at most 1.5 ÷ (gap in ring steps) per ring step', () => {
      for (let r = 0; r < 8; r++) {
        // A fine walk (0.01°) shows no jump; the 1° ring step stays within the per-step bound of each fade.
        let worstJump = 0;
        for (let h = 0; h < 360; h += 0.01)
          worstJump = Math.max(worstJump, Math.abs(rangeWeight(r, h + 0.01) - rangeWeight(r, h)));
        expect(worstJump).toBeLessThan(1e-3);
        for (let h = 0; h < 360; h++) {
          const d = Math.abs(rangeWeight(r, h + 1) - rangeWeight(r, h));
          const inUpper = hueDiff(h, RANGE_CENTRES[r]!) >= 0;
          const width = inUpper ? gapAfter(r) : gapBefore(r);
          expect(d, `range ${r} step ${h}`).toBeLessThanOrEqual(1.5 / width + 1e-9);
        }
      }
      // The weights of every hue add up to 1.
      for (let h = 0; h < 360; h += 0.5) {
        const sum = [0, 1, 2, 3, 4, 5, 6, 7].reduce((s, r) => s + rangeWeight(r, h), 0);
        expect(sum).toBeCloseTo(1, 12);
      }
    });

    it('F-024.AC3 Hue and Saturation keep lightness on the hue ring (within 0.5 on the 0–100 scale)', () => {
      for (const [name, tools] of configs.filter(([n]) => !n.includes('lightness') && !n.startsWith('all 24'))) {
        const out = render(RING, tools);
        for (let k = 0; k < 360; k++)
          expect(Math.abs(okL(out[k]!) - okL(RING[k]!)), `${name} step ${k}`).toBeLessThan(0.5);
      }
    });
  });

  it('F-024.AC4 every mixer value at 0: the 24-patch chart matches the clip without the mixer (ΔE00 < 0.5)', () => {
    const out = render(
      CHART,
      mixerAll('hue', () => 0),
    );
    for (let i = 0; i < 24; i++) expect(deRgb(out[i]!, CHART[i]!)).toBeLessThan(0.5);
  });

  it('F-024.AC5 with Saturation −100, Red Saturation +100 keeps the picture grey (the mixer applies after Saturation)', () => {
    for (const set of [CHART, RING]) {
      const out = render(set, { mixer: { red: { saturation: 100 } } }, { saturation: -100 });
      for (const c of out) expect(C(c)).toBeLessThan(2);
    }
  });

  it('F-024 edge: Saturation +100 on a saturated colour is limited to what the output can show, keeping hue and lightness', () => {
    const out = render(RING, { mixer: Object.fromEntries(COLOUR_RANGES.map((r) => [r, { saturation: 100 }])) });
    for (let k = 0; k < 360; k += 5) {
      expect(out[k]!.every((x) => x >= 0 && x <= 1)).toBe(true);
      expect(Math.abs(hueDiff(okH(out[k]!), okH(RING[k]!)))).toBeLessThan(1);
      expect(C(out[k]!)).toBeGreaterThan(C(RING[k]!));
    }
  });
});

describe('F-025 colour pop (CPU reference)', () => {
  const red = (range: number, amount: number): ColourTools => ({ pop: { colour: 'red', range, amount } });

  it('F-025.AC2 Red kept, Range 0, Amount 100: the Red centre keeps its colour (ΔE00 1); Yellow…Magenta centres grey; lightness kept', () => {
    const out = render(RING, red(0, 100));
    expect(deRgb(out[centreStep(0)]!, RING[centreStep(0)]!)).toBeLessThanOrEqual(1);
    for (let r = 2; r < 8; r++) expect(C(out[centreStep(r)]!)).toBeLessThan(2);
    for (let k = 0; k < 360; k++) expect(Math.abs(okL(out[k]!) - okL(RING[k]!))).toBeLessThan(0.5);
  });

  it('F-025.AC3 the kept span grows with Range; the keep weight changes by at most 1.5 ÷ (fade width in steps) per ring step', () => {
    let last = 0;
    for (const range of [0, 25, 50, 75, 100]) {
      const out = render(RING, red(range, 100));
      const kept = out.filter((c, k) => deRgb(c, RING[k]!) < 1).length;
      expect(kept).toBeGreaterThan(last);
      last = kept;
    }
    const c = RANGE_CENTRES[0]!;
    for (let range = 0; range <= 100; range += 5) {
      const pop = { range: 0, spread: range, amount: 100 };
      for (const [dir, gap] of [
        [1, gapAfter(0)],
        [-1, gapBefore(0)],
      ] as const) {
        const width = 0.25 * gap;
        let prev = popKeep(pop, c);
        for (let s = 1; s <= Math.ceil(1.5 * gap); s++) {
          const k = popKeep(pop, c + dir * s);
          expect(Math.abs(k - prev), `range ${range} dir ${dir} step ${s}`).toBeLessThanOrEqual(1.5 / width + 1e-9);
          prev = k;
        }
        // Continuous: no jump on a fine walk.
        for (let s = 0; s < 1.5 * gap; s += 0.01)
          expect(Math.abs(popKeep(pop, c + dir * (s + 0.01)) - popKeep(pop, c + dir * s))).toBeLessThanOrEqual(
            (1.5 / width) * 0.01 + 1e-9,
          );
      }
    }
  });

  it('F-025.AC4 Amount 50: steps beyond the kept span and its fade keep half their chroma (10 %) and their lightness', () => {
    const out = render(RING, red(50, 50));
    let checked = 0;
    for (let k = 0; k < 360; k++) {
      if (popKeep({ range: 0, spread: 50, amount: 50 }, k) > 0) continue;
      checked++;
      expect(Math.abs(C(out[k]!) - C(RING[k]!) / 2), `step ${k}`).toBeLessThanOrEqual(0.1 * (C(RING[k]!) / 2));
      expect(Math.abs(okL(out[k]!) - okL(RING[k]!))).toBeLessThan(0.5);
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('F-025.AC5 after Orange Hue −100 in the mixer, the Orange centre step (now at Red’s hue) stays coloured: pop applies after the mixer', () => {
    const k = centreStep(1);
    const mixed = render([RING[k]!], { mixer: { orange: { hue: -100 } } })[0]!;
    const popped = render([RING[k]!], { mixer: { orange: { hue: -100 } }, ...red(0, 100) })[0]!;
    expect(Math.abs(hueDiff(okH(mixed), RANGE_CENTRES[0]!))).toBeLessThanOrEqual(1);
    expect(Math.abs(C(popped) - C(mixed))).toBeLessThanOrEqual(0.1 * C(mixed));
  });

  it('F-025 edge: never changes a grey pixel by ΔE00 0.5 or more (RULE-24 Quality), at any kept colour', () => {
    for (const colour of COLOUR_RANGES) {
      const out = render(GREY_RAMP, { pop: { colour, range: 100, amount: 100 } });
      for (let i = 0; i < 256; i++) expect(deRgb(out[i]!, GREY_RAMP[i]!)).toBeLessThan(0.5);
    }
  });

  it('F-025 edge: a look after colour pop styles the whole picture — Black & White Classic greys the kept colour too', () => {
    const t = lookTable('bw-classic');
    const out = render(RING, red(50, 100), {}, { id: 'bw-classic', intensity: 100 }, t);
    expect(C(out[centreStep(0)]!)).toBeLessThan(2);
  });
});

describe('F-026 split toning (CPU reference)', () => {
  const tintHue = (h: number): number => wheelOkHue(h);

  it('F-026.AC1 render: Shadows strength 60 tints dark tones toward the Shadows hue (210° by default)', () => {
    const out = render(GREY_RAMP, { splitToning: { shadowsStrength: 60 } });
    const k = rampStepAt(30);
    expect(C(out[k]!)).toBeGreaterThan(5);
    expect(Math.abs(hueDiff(okH(out[k]!), tintHue(210)))).toBeLessThanOrEqual(1);
  });

  it('F-026.AC2 Shadows 210° at 100, Highlights 0, Balance 0: lightness 20 tinted (C* ≥ 10, at 210°); above 65 and near black/white untouched; lightness kept', () => {
    const out = render(GREY_RAMP, {
      splitToning: { shadowsHue: 210, shadowsStrength: 100, highlightsStrength: 0, balance: 0 },
    });
    const k = rampStepAt(20);
    expect(C(out[k]!)).toBeGreaterThanOrEqual(10);
    expect(Math.abs(hueDiff(okH(out[k]!), tintHue(210)))).toBeLessThanOrEqual(1);
    for (let i = 0; i < 256; i++) {
      const L = okL(GREY_RAMP[i]!);
      expect(Math.abs(okL(out[i]!) - L), `step ${i}`).toBeLessThan(0.5);
      if (L > 65 || L <= 1 || L >= 99) expect(deRgb(out[i]!, GREY_RAMP[i]!), `step ${i}`).toBeLessThan(0.5);
    }
  });

  it('F-026.AC3 Balance −100…+100 moves the crossover from lightness 80 to 20 (within 2); lightness in order; weights within bounds; no banding', () => {
    const sh = srgbToOklab(oklabToSrgb([0.5, 0, 0])); // grey reference for (a, b) = 0
    const sv = [Math.cos((tintHue(210) * Math.PI) / 180), Math.sin((tintHue(210) * Math.PI) / 180)] as const;
    const hv = [Math.cos((tintHue(35) * Math.PI) / 180), Math.sin((tintHue(35) * Math.PI) / 180)] as const;
    const det = sv[0] * hv[1] - sv[1] * hv[0];
    for (const balance of [-100, -50, 0, 50, 100]) {
      const out = render(GREY_RAMP, { splitToning: { shadowsStrength: 100, highlightsStrength: 100, balance } });
      // The tint of each step as (shadows part, highlights part); the crossover is where they are equal.
      let cross = NaN;
      let prevDiff = NaN;
      let prevL = NaN;
      for (let i = 0; i < 256; i++) {
        const o = srgbToOklab(out[i]!);
        const a = o[1] - sh[1];
        const b = o[2] - sh[2];
        const s = (a * hv[1] - b * hv[0]) / det;
        const h = (sv[0] * b - sv[1] * a) / det;
        const L = o[0] * 100;
        const diff = h - s;
        if (prevDiff < 0 && diff >= 0 && Number.isNaN(cross))
          cross = prevL + ((L - prevL) * -prevDiff) / (diff - prevDiff);
        if (s + h > 1e-4 || Math.abs(diff) > 1e-4) {
          prevDiff = diff;
          prevL = L;
        }
      }
      expect(Math.abs(cross - (50 - (30 * balance) / 100)), `balance ${balance}`).toBeLessThanOrEqual(2);
      for (let i = 1; i < 256; i++) expect(okL(out[i]!)).toBeGreaterThanOrEqual(okL(out[i - 1]!) - 1e-9);
      expect(maxAdjacent(out)).toBeLessThanOrEqual(4 * DEFAULT_MAX_STEP);
      // Tone weights per lightness unit: each fade within 1.5 ÷ its width (crossover 30, black/white 20); the
      // product the tool uses stays within the narrower fade's bound (1.5 ÷ 20) even where the fades overlap.
      const x = 0.5 - (0.3 * balance) / 100;
      for (let L = 0; L < 100; L++) {
        const cross = Math.abs(smoothstep(x - 0.15, x + 0.15, (L + 1) / 100) - smoothstep(x - 0.15, x + 0.15, L / 100));
        expect(cross).toBeLessThanOrEqual(1.5 / 30 + 1e-9);
        const edge = (v: number): number => smoothstep(0, 0.2, v) * (1 - smoothstep(0.8, 1, v));
        expect(Math.abs(edge((L + 1) / 100) - edge(L / 100))).toBeLessThanOrEqual(1.5 / 20 + 1e-9);
        const [s0, h0] = splitWeights(L / 100, x);
        const [s1, h1] = splitWeights((L + 1) / 100, x);
        expect(Math.abs(s1 - s0), `balance ${balance} L ${L}`).toBeLessThanOrEqual(1.5 / 20 + 1e-9);
        expect(Math.abs(h1 - h0), `balance ${balance} L ${L}`).toBeLessThanOrEqual(1.5 / 20 + 1e-9);
      }
    }
  });

  it('F-026.AC4 after Black & White Classic at 100, Highlights strength 60 tints the light tones: split toning applies after the look', () => {
    const t = lookTable('bw-classic');
    const out = render(
      GREY_RAMP,
      { splitToning: { highlightsStrength: 60 } },
      {},
      { id: 'bw-classic', intensity: 100 },
      t,
    );
    const k = rampStepAt(70);
    expect(C(out[k]!)).toBeGreaterThan(5);
    expect(Math.abs(hueDiff(okH(out[k]!), tintHue(35)))).toBeLessThanOrEqual(1);
  });

  it('F-026 edge: a hue set while its strength is 0 changes nothing', () => {
    const out = render(CHART, { splitToning: { shadowsHue: 90, highlightsHue: 300 } });
    const none = render(CHART, {});
    for (let i = 0; i < 24; i++) expect(out[i]).toEqual(none[i]);
  });
});

describe('F-027 duotone (CPU reference)', () => {
  const pairTools = (pair: (typeof DUOTONE_PAIRS)[number], strength = 100): ColourTools => ({
    duotone: { on: true, pair, ...DUOTONE_PAIR_COLOURS[pair], strength },
  });

  it('F-027.AC2 every pair at 100 on the grey ramp: black = shadows colour, white = highlights colour, L* 50 = the midpoint (ΔE00 1); one direction; no banding', () => {
    let mid = 0;
    for (let i = 0; i < 256; i++)
      if (Math.abs(lab(GREY_RAMP[i]!)[0] - 50) < Math.abs(lab(GREY_RAMP[mid]!)[0] - 50)) mid = i;
    for (const pair of DUOTONE_PAIRS) {
      const { shadows, highlights } = DUOTONE_PAIR_COLOURS[pair];
      const out = render(GREY_RAMP, pairTools(pair));
      expect(deRgb(out[0]!, hexRgb(shadows)), pair).toBeLessThanOrEqual(1);
      expect(deRgb(out[255]!, hexRgb(highlights)), pair).toBeLessThanOrEqual(1);
      const m = oklabToSrgb(duotoneLab(srgbToOklab(hexRgb(shadows)), srgbToOklab(hexRgb(highlights)), 0.5));
      expect(deRgb(out[mid]!, m), pair).toBeLessThanOrEqual(1);
      const dir = Math.sign(lab(hexRgb(highlights))[0] - lab(hexRgb(shadows))[0]);
      for (let i = 1; i < 256; i++)
        expect(dir * (lab(out[i]!)[0] - lab(out[i - 1]!)[0]), `${pair} ${i}`).toBeGreaterThanOrEqual(-1e-9);
      expect(maxAdjacent(out), pair).toBeLessThanOrEqual(4 * DEFAULT_MAX_STEP);
    }
  });

  it('F-027.AC3 Strength 0 matches None on the chart (ΔE00 < 0.5); at 50 each patch lies between None and 100', () => {
    for (const pair of DUOTONE_PAIRS) {
      const none = render(CHART, {});
      const zero = render(CHART, pairTools(pair, 0));
      const half = render(CHART, pairTools(pair, 50));
      const full = render(CHART, pairTools(pair, 100));
      for (let i = 0; i < 24; i++) {
        expect(deRgb(zero[i]!, none[i]!)).toBeLessThan(0.5);
        for (let ch = 0; ch < 3; ch++) {
          const lo = Math.min(none[i]![ch]!, full[i]![ch]!);
          const hi = Math.max(none[i]![ch]!, full[i]![ch]!);
          expect(half[i]![ch]!).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(half[i]![ch]!).toBeLessThanOrEqual(hi + 1e-9);
        }
      }
    }
  });

  it('F-027.AC6 with Red Saturation +100 and a colour look, the output still uses only the two colours (duotone applies after them)', () => {
    const t = lookTable('cine-teal-orange');
    const pair = DUOTONE_PAIR_COLOURS['indigo-pink'];
    const [s, h] = [srgbToOklab(hexRgb(pair.shadows)), srgbToOklab(hexRgb(pair.highlights))];
    const gradient = Array.from({ length: 1001 }, (_, i) => lab(oklabToSrgb(duotoneLab(s, h, i / 1000))));
    const out = render(
      [...CHART, ...RING.filter((_, k) => k % 15 === 0)],
      { mixer: { red: { saturation: 100 } }, ...pairTools('indigo-pink') },
      {},
      { id: 'cine-teal-orange', intensity: 100 },
      t,
    );
    for (const c of out) {
      const l = lab(c);
      expect(Math.min(...gradient.map((g) => de00(l, g)))).toBeLessThanOrEqual(1);
    }
  });

  it('F-027 edge: both colours the same make one flat colour; a lighter shadows colour inverts lightness', () => {
    const flat = render(GREY_RAMP, {
      duotone: { on: true, pair: 'custom', shadows: '#3366AA', highlights: '#3366AA', strength: 100 },
    });
    for (const c of flat) expect(deRgb(c, hexRgb('#3366AA'))).toBeLessThan(0.5);
    const inv = render(GREY_RAMP, {
      duotone: { on: true, pair: 'custom', shadows: '#FFD400', highlights: '#1B2A4A', strength: 100 },
    });
    expect(lab(inv[0]!)[0]).toBeGreaterThan(lab(inv[255]!)[0]);
  });
});

describe('RULE-24 order applied (CPU reference)', () => {
  it('RULE-24 the 8-bit output stays within ΔE00 1 of full precision with every colour tool on (chart, ramp, ring)', () => {
    const tools: ColourTools = {
      mixer: Object.fromEntries(
        COLOUR_RANGES.map((r, i) => [r, { hue: i % 2 ? -40 : 60, saturation: 30, lightness: -20 }]),
      ),
      pop: { colour: 'orange', range: 60, amount: 80 },
      splitToning: { shadowsStrength: 50, highlightsStrength: 40, balance: 20 },
      duotone: { on: true, pair: 'teal-cream', ...DUOTONE_PAIR_COLOURS['teal-cream'], strength: 60 },
    };
    for (const set of [CHART, GREY_RAMP, RING]) {
      for (const c of render(set, tools, { contrast: 20, vibrance: 30 })) {
        const q = c.map((x) => Math.round(x * 255) / 255) as unknown as Rgb;
        expect(deRgb(q, c)).toBeLessThanOrEqual(1);
      }
    }
  });
});
