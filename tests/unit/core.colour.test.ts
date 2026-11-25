// MOD-Core colour-tool maths (RULE-24, ADR-0017 §2–§4): the working space, the range centres, the grey gate
// over the sRGB cube, the hue table as the GPU reads it, the hue-wheel names, and the settings' normalisation.
import { describe, expect, it } from 'vitest';
import {
  cieChroma,
  COLOUR_RANGES,
  DUOTONE_PAIR_COLOURS,
  DUOTONE_PAIRS,
  GREY_GATE,
  greyGate,
  hexRgb,
  HUE_TABLE_SIZE,
  hueTable,
  hueWheelRgb,
  linearToOklab,
  mixerAt,
  mixPopLab,
  nearestRange,
  normaliseColourTools,
  okLch,
  oklabToLinear,
  popSettings,
  RANGE_CENTRES,
  sampleHueTable,
  splitCrossover,
  splitSettings,
  srgbToLinear,
  srgbToOklab,
} from '../../src/core';
import { chroma, lab, rgbOfLab } from '../support/colour';

describe('RULE-24 working space and ranges (ADR-0017 §2, §3)', () => {
  it('ADR-0017 §2 OKLab round-trips linear sRGB', () => {
    for (const c of [
      [0, 0, 0],
      [1, 1, 1],
      [0.2, 0.5, 0.9],
      [1, 0, 0],
    ] as const) {
      const back = oklabToLinear(linearToOklab(c));
      for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(c[i]!, 6);
    }
    expect(srgbToOklab([1, 1, 1])[0]).toBeCloseTo(1, 4);
  });

  it('RULE-24 the eight range centres are the reference colours’ working-space hues, in hue order', () => {
    expect(COLOUR_RANGES).toEqual(['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta']);
    for (let i = 1; i < 8; i++) expect(RANGE_CENTRES[i]!).toBeGreaterThan(RANGE_CENTRES[i - 1]!);
    expect(RANGE_CENTRES[0]).toBeCloseTo(okLch(srgbToOklab(hexRgb('#FF0000')))[2], 9);
  });

  it('RULE-24 the hue wheel names a hue by HSL at full saturation and half lightness (0° red, 120° green, 240° blue)', () => {
    expect(hueWheelRgb(0)).toEqual([1, 0, 0]);
    expect(hueWheelRgb(120)).toEqual([0, 1, 0]);
    expect(hueWheelRgb(240)).toEqual([0, 0, 1]);
    expect(hueWheelRgb(30)).toEqual([1, 0.5, 0]);
  });

  it('RULE-24 a hue slider names the nearest range; exactly halfway names the later one (210° Blue, 36° Orange, 330° Red)', () => {
    expect(nearestRange(210)).toBe('blue');
    expect(nearestRange(36)).toBe('orange');
    expect(nearestRange(35)).toBe('orange');
    expect(nearestRange(330)).toBe('red');
    expect(nearestRange(359)).toBe('red');
    expect(nearestRange(90)).toBe('green');
    expect(nearestRange(285)).toBe('magenta');
  });

  it('ADR-0017 §2 RULE-24 the grey gate is 0 for every sRGB colour with C* < 2 and 1 for every one with C* ≥ 12 (the sRGB cube in steps of 5, and the dark corner in steps of 1)', () => {
    let low = 0;
    let high = 0;
    const check = (r: number, g: number, b: number): void => {
      const c = [r / 255, g / 255, b / 255] as const;
      const Cs = chroma(lab(c));
      const w = greyGate([srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])]);
      if (Cs < 2) {
        low++;
        expect(w, `${r},${g},${b}`).toBe(0);
      } else if (Cs >= 12) {
        high++;
        expect(w, `${r},${g},${b}`).toBe(1);
      }
    };
    for (let r = 0; r <= 255; r += 5)
      for (let g = 0; g <= 255; g += 5) for (let b = 0; b <= 255; b += 5) check(r, g, b);
    // Below L* 10, where the OK-chroma stand-in of ADR-0017 §2 failed (#050003: C* 1.85, OK C 0.034).
    for (let r = 0; r <= 12; r++) for (let g = 0; g <= 12; g++) for (let b = 0; b <= 12; b++) check(r, g, b);
    expect(low).toBeGreaterThan(200);
    expect(high).toBeGreaterThan(100_000);
    expect(okLch(srgbToOklab([5 / 255, 0, 3 / 255]))[1]).toBeGreaterThan(0.029); // why the gate is not on OK C
  });

  it('RULE-24 the grey fade changes continuously, by at most 1.5 ÷ its width (C* 2 → 12) per chroma unit', () => {
    const width = GREY_GATE[1] - GREY_GATE[0];
    expect(width).toBe(10);
    // Along a line of growing chroma at L* 50, measured per CIELAB C* unit.
    let prev = { w: 0, c: 0 };
    for (let k = 1; k <= 2000; k++) {
      const rgb = rgbOfLab([50, k * 0.01, 0]);
      const lin = [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])] as const;
      const w = greyGate(lin);
      const c = cieChroma(lin);
      if (k > 1) expect(Math.abs(w - prev.w) / (c - prev.c)).toBeLessThanOrEqual(1.5 / width + 1e-6);
      prev = { w, c };
    }
  });

  it('ADR-0017 §3 the hue table is read like the GPU’s linear filter, wrapping in hue; at entries it is the mixer exactly', () => {
    const mixer = COLOUR_RANGES.map((_, i) => ({ hue: (i - 4) * 20, saturation: i * 10, lightness: -i * 5 }));
    const t = hueTable(mixer, { range: 3, spread: 40, amount: 70 });
    expect(t.length).toBe(HUE_TABLE_SIZE * 4);
    for (const e of [0, 100, 511, 1023]) {
      const h = (e * 360) / HUE_TABLE_SIZE;
      const [s, f, m] = mixerAt(mixer, h);
      const got = sampleHueTable(t, h);
      expect(got[0]).toBeCloseTo(s / 360, 6);
      expect(got[1]).toBeCloseTo(f, 6);
      expect(got[2]).toBeCloseTo(m, 6);
    }
    // Between entry 1023 and entry 0 the read wraps around.
    const mid = sampleHueTable(t, 359.9);
    expect(mid[1]).toBeGreaterThanOrEqual(Math.min(t[1023 * 4 + 1]!, t[1]!) - 1e-6);
    expect(mid[1]).toBeLessThanOrEqual(Math.max(t[1023 * 4 + 1]!, t[1]!) + 1e-6);
  });

  it('RULE-24 *Quality* D-053 review M1 the mixer and colour pop leave pure black and near-black greys exactly as they are (gate 0: no hue is taken), with every value at its extreme', () => {
    const mixer = COLOUR_RANGES.map(() => ({ hue: 100, saturation: 100, lightness: 100 }));
    const t = hueTable(mixer, { range: 0, spread: 0, amount: 100 });
    for (const rgb of [
      [0, 0, 0],
      [1 / 255, 1 / 255, 1 / 255],
      [3 / 255, 2 / 255, 3 / 255],
      [12 / 255, 12 / 255, 12 / 255],
    ] as const) {
      const lab = srgbToOklab(rgb);
      for (const [mix, pop] of [
        [true, false],
        [false, true],
        [true, true],
      ] as const) {
        const out = mixPopLab(lab, t, mix, pop);
        expect(out.every(Number.isFinite)).toBe(true);
        expect(out).toEqual(lab);
      }
    }
  });

  it('RULE-24 split toning crosses over at lightness 50 at Balance 0, 80 at −100 and 20 at +100', () => {
    expect(splitCrossover(0)).toBeCloseTo(0.5, 12);
    expect(splitCrossover(-100)).toBeCloseTo(0.8, 12);
    expect(splitCrossover(100)).toBeCloseTo(0.2, 12);
  });
});

describe('RULE-24 settings (MOD-Core normalisation)', () => {
  it('RULE-24 values at default are dropped and all-default is absent, so a clip without colour tools is unchanged', () => {
    expect(
      normaliseColourTools({
        mixer: { red: { hue: 0 }, blue: { saturation: 0, lightness: 0 } },
        pop: { colour: null, range: 50, amount: 100 },
        splitToning: { shadowsHue: 210, highlightsHue: 35, shadowsStrength: 0, highlightsStrength: 0, balance: 0 },
      }),
    ).toBeUndefined();
    expect(normaliseColourTools(undefined)).toBeUndefined();
    expect(normaliseColourTools({ duotone: null })).toBeUndefined();
  });

  it('RULE-24 ranges: whole steps, mixer and Balance −100…+100, Range/Amount/strengths 0…100, hues 0…359', () => {
    expect(
      normaliseColourTools({
        mixer: { red: { hue: 140, saturation: -20.4 } },
        pop: { colour: 'red', range: -5, amount: 140 },
        splitToning: { shadowsHue: 400, balance: -130, highlightsStrength: 33.6 },
      }),
    ).toEqual({
      mixer: { red: { hue: 100, saturation: -20 } },
      pop: { colour: 'red', range: 0 },
      splitToning: { shadowsHue: 359, highlightsStrength: 34, balance: -100 },
    });
  });

  it('RULE-24 None keeps Range and Amount; the duotone object is kept while off; built-in pairs carry their own colours', () => {
    expect(normaliseColourTools({ pop: { colour: null, range: 70 } })).toEqual({ pop: { range: 70 } });
    const d = normaliseColourTools({
      duotone: { on: false, pair: 'plum-gold', shadows: '#000000', highlights: '#ffffff', strength: 100 },
    });
    expect(d).toEqual({
      duotone: { on: false, pair: 'plum-gold', ...pick(DUOTONE_PAIR_COLOURS['plum-gold']), strength: 100 },
    });
    const c = normaliseColourTools({
      duotone: { on: true, pair: 'custom', shadows: '#ffd400', highlights: 'bad', strength: 40 },
    });
    expect(c?.duotone).toEqual({
      on: true,
      pair: 'custom',
      shadows: '#FFD400',
      highlights: DUOTONE_PAIR_COLOURS['midnight-peach'].highlights,
      strength: 40,
    });
  });

  it('RULE-24 settings as shown fill in the defaults (Range 50, Amount 100, hues 210° and 35°)', () => {
    expect(popSettings(undefined)).toEqual({ colour: null, range: 50, amount: 100 });
    expect(splitSettings({ splitToning: { balance: 30 } })).toEqual({
      shadowsHue: 210,
      shadowsStrength: 0,
      highlightsHue: 35,
      highlightsStrength: 0,
      balance: 30,
    });
  });

  it('F-027 looks.md lists the six built-in duotone pairs in order, each as two #RRGGBB colours', () => {
    expect(DUOTONE_PAIRS).toEqual([
      'midnight-peach',
      'plum-gold',
      'teal-cream',
      'indigo-pink',
      'forest-lime',
      'ink-coral',
    ]);
    for (const p of DUOTONE_PAIRS) {
      expect(DUOTONE_PAIR_COLOURS[p].shadows).toMatch(/^#[0-9A-F]{6}$/);
      expect(DUOTONE_PAIR_COLOURS[p].highlights).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

function pick(p: { shadows: string; highlights: string }): { shadows: string; highlights: string } {
  return { shadows: p.shadows, highlights: p.highlights };
}
