// MOD-Compositor colour replace on the CPU reference (RULE-25, F-028; ADR-0017 §5 and its 2026-11-26 Amendment, §8:
// the oracle the GPU must match). F-028's test pictures: the hue ring (RULE-24), the ball fixture (a disc of hue
// within 3° of #C8281E's, lightness 40–75, chroma at least ¾ of #C8281E's, on a grey floor) and flat patches. The
// GPU and export halves are in tests/e2e/colour-tools.spec.ts; the UI halves in tests/e2e/colour-replace.spec.ts.
import { describe, expect, it } from 'vitest';
import { discMean, discSide, gradeUniforms, NEUTRAL, reference } from '../../src/compositor';
import {
  fromLch,
  fromStatus,
  greyGate,
  hexRgb,
  oklabToLinear,
  okLch,
  replaceFade,
  replaceFull,
  replaceParams,
  replaceWeights,
  smoothstep,
  srgbToLinear,
  srgbToOklab,
  type ColourTools,
  type ReplaceParams,
  type Vec3,
} from '../../src/core';
import { CHART_24, chroma, deRgb, GREY_RAMP, lab, rgbOfLab, type Rgb } from '../support/colour';
import { hueDiff, hueRing } from '../support/hue-ring';

const RING = hueRing();
const byte = (x: number): string =>
  Math.round(Math.min(1, Math.max(0, x)) * 255)
    .toString(16)
    .padStart(2, '0');
/** sRGB values → #RRGGBB, rounded as a pick is (RULE-25 *Picking*). */
const rgbHex = ([r, g, b]: Rgb): string => `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();
const CHART: readonly Rgb[] = CHART_24.map(([r, g, b]) => [r / 255, g / 255, b / 255] as const);
const ok = (c: Rgb): Vec3 => okLch(srgbToOklab(c));
const okL = (c: Rgb): number => ok(c)[0] * 100;
const okH = (c: Rgb): number => ok(c)[2];
const Cs = (c: Rgb): number => chroma(lab(c));
const linear = (c: Rgb): Vec3 => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])];
const render = (input: readonly Rgb[], tools: ColourTools, a = {}): Rgb[] =>
  input.map((c) => reference.grade(c, a, null, null, tools) as Rgb);
/** The hex of ring step k (what a pick or the colour picker stores). */
const ringHex = (k: number): string => rgbHex(RING[((k % 360) + 360) % 360]!);
const one = (from: string, to: string, range = 30, softness = 50): ColourTools => ({
  replace: [{ from, to, range, softness }],
});
const params = (t: ColourTools): ReplaceParams[] =>
  (t.replace ?? []).map(replaceParams).filter((p): p is ReplaceParams => p !== null);
const weightsOf = (c: Rgb, t: ColourTools): number[] => replaceWeights(srgbToOklab(c), params(t));
const total = (c: Rgb, t: ColourTools): number => weightsOf(c, t).reduce((a, b) => a + b, 0);

const FROM = '#C8281E';
const BLUE = '#0050FF';

/** F-028 test pictures: the ball fixture's pixels, on its grey floor. */
function ballFixture(): { ball: Rgb[]; floor: Rgb[] } {
  const [, cFrom, hFrom] = okLch(srgbToOklab(hexRgb(FROM)));
  const ball: Rgb[] = [];
  for (let dh = -3; dh <= 3; dh += 1)
    for (let L = 40; L <= 75; L += 2.5)
      for (const k of [0.75, 0.85, 1, 1.15]) {
        const lin = oklabToLinear(fromLch(L / 100, cFrom * k, hFrom + dh));
        if (lin.some((x) => x < 0 || x > 1)) continue; // outside sRGB: the fixture holds only showable colours
        const rgb = lin.map((x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)) as unknown as Rgb;
        ball.push(rgb);
      }
  const floor: Rgb[] = [...GREY_RAMP];
  // Slightly tinted greys, still C* below 2.
  for (let L = 10; L <= 95; L += 5)
    for (const a of [-1.2, 0, 1.2])
      floor.push(rgbOfLab([L, a, 1.2 - Math.abs(a)]).map((x) => Math.min(1, Math.max(0, x))) as unknown as Rgb);
  return { ball, floor: floor.filter((c) => Cs(c) < 2) };
}

describe('RULE-25 colour replace — settings and identity (CPU reference)', () => {
  it('RULE-25 Range and Softness map linearly: full 5° + 0.55° × Range, fade 2° + (full − 2°) × Softness ÷ 100', () => {
    expect(replaceFull(0)).toBe(5);
    expect(replaceFull(30)).toBeCloseTo(21.5, 10);
    expect(replaceFull(100)).toBeCloseTo(60, 10);
    expect(replaceFade(30, 50)).toBeCloseTo(11.75, 10);
    expect(replaceFade(100, 0)).toBe(2);
    expect(replaceFade(100, 100)).toBeCloseTo(60, 10);
  });

  it('RULE-25 F-028.R1 no replacement, or one whose To equals From, leaves the picture exactly as it was', () => {
    expect(gradeUniforms({}, null, {}).replace).toBeNull();
    expect(NEUTRAL.replace).toBeNull();
    const same = one(FROM, FROM);
    expect(gradeUniforms({}, null, same).replace).toBeNull();
    for (const set of [CHART, GREY_RAMP, RING])
      for (const c of set)
        expect(reference.grade(c, { contrast: 20 }, null, null, same)).toEqual(reference.grade(c, { contrast: 20 }));
  });

  it('RULE-25 grey and faint From colours: C* below 2 is grey (refused), 2 to 12 faint, else ok', () => {
    expect(fromStatus('#808080')).toBe('grey');
    expect(fromStatus('#7F8080')).toBe('grey');
    expect(fromStatus(FROM)).toBe('ok');
    const faint = rgbHex(rgbOfLab([55, 8, 0]));
    expect(fromStatus(faint)).toBe('faint');
    // A stored grey From (a file may hold one) changes nothing.
    expect(replaceParams({ from: '#808080', to: BLUE, range: 30, softness: 50 })).toBeNull();
  });

  it('RULE-24 *Quality* RULE-25 colour replace never changes a grey pixel by ΔE00 0.5 or more, at any setting', () => {
    const { floor } = ballFixture();
    for (const range of [0, 30, 100])
      for (const softness of [0, 50, 100])
        for (const to of [BLUE, '#808080', '#00FF00', FROM.replace('C8', 'C9')]) {
          const t: ColourTools = {
            replace: [
              { from: FROM, to, range, softness },
              { from: ringHex(200), to: '#FFD400', range, softness },
              { from: ringHex(100), to: '#FF00FF', range, softness },
            ],
          };
          const out = render(floor, t);
          floor.forEach((c, i) => expect(deRgb(out[i]!, c)).toBeLessThan(0.5));
        }
  });
});

describe('F-028 colour replace — rendering (CPU reference)', () => {
  it('F-028.AC1 render: a new replacement (To set to From) changes nothing — the graded picture returns unchanged', () => {
    const hex = ringHex(20);
    const out = render(RING, one(hex, hex));
    RING.forEach((c, i) => expect(out[i]).toEqual(reference.grade(c, {})));
  });

  it('F-028.AC6 the ball turns blue in lit and shaded parts alike (hue reached, lightness kept), the floor changes by less than ΔE00 0.5', () => {
    const { ball, floor } = ballFixture();
    expect(ball.length).toBeGreaterThan(100);
    const t = one(FROM, BLUE);
    const toH = okH(hexRgb(BLUE));
    const out = render(ball, t);
    ball.forEach((c, i) => {
      expect(Math.abs(hueDiff(okH(out[i]!), toH))).toBeLessThanOrEqual(1);
      expect(Math.abs(okL(out[i]!) - okL(c))).toBeLessThanOrEqual(0.5);
    });
    const outFloor = render(floor, t);
    floor.forEach((c, i) => expect(deRgb(outFloor[i]!, c)).toBeLessThan(0.5));
  });

  describe('F-028.AC7 Range and Softness from 0 to 100 grow the full span and the fade as RULE-25 states; weights are smooth', () => {
    const from = ringHex(30);
    const fromH = okH(hexRgb(from));
    for (let range = 0; range <= 100; range += 10)
      for (let softness = 0; softness <= 100; softness += 10)
        it(`Range ${range} Softness ${softness}`, () => {
          const t = one(from, ringHex(210), range, softness);
          const w = RING.map((c) => total(c, t));
          const full = replaceFull(range);
          const fade = replaceFade(range, softness);
          // The full span: the furthest steps with weight 1 either side of From's hue.
          let fullUp = 0;
          let fullDown = 0;
          let reachUp = 0;
          let reachDown = 0;
          RING.forEach((c, k) => {
            const d = hueDiff(k, fromH);
            if (w[k]! >= 1 - 1e-9) {
              if (d >= 0) fullUp = Math.max(fullUp, d);
              else fullDown = Math.max(fullDown, -d);
            }
            if (w[k]! > 0) {
              if (d >= 0) reachUp = Math.max(reachUp, d);
              else reachDown = Math.max(reachDown, -d);
            }
          });
          for (const f of [fullUp, fullDown]) expect(Math.abs(f - full)).toBeLessThanOrEqual(1);
          for (const r of [reachUp, reachDown]) expect(Math.abs(r - (full + fade))).toBeLessThanOrEqual(1);
          // Continuous, and per hue-ring step at most 1.5 ÷ (the fade distance in steps).
          const bound = 1.5 / fade + 1e-9;
          for (let k = 0; k < 360; k++) expect(Math.abs(w[(k + 1) % 360]! - w[k]!)).toBeLessThanOrEqual(bound);
        });
  });

  it('F-028.AC9 colour replace applies first: with Temperature +50 every pixel is matched as without it', () => {
    const t = one('#E01010', '#1030E0');
    for (const c of [...RING, ...CHART]) {
      // Replace on the source, then Temperature: the same as replacing first and warming the result.
      const replaced = reference.grade(c, {}, null, null, t) as Rgb;
      const warm = reference.grade(c, { temperature: 50 }, null, null, t);
      const expected = reference.grade(replaced, { temperature: 50 });
      warm.forEach((x, i) => expect(x).toBeCloseTo(expected[i]!, 12));
    }
  });

  it('F-028.AC13 partial matches turn the one way From → To; chroma never sags; From 30° → To 185° has no hard edge', () => {
    const from = ringHex(30);
    // To 250° (the shorter way is decreasing hue).
    const down = one(from, ringHex(250), 0, 100);
    const outDown = render(RING, down);
    const [pDown] = params(down);
    /** A step's full-match C*: its own chroma × the ratio, at To's hue, its lightness kept. */
    const fullMatchC = (c: Rgb): number => {
      const [L, C] = ok(c);
      const lin = oklabToLinear(fromLch(L, C * pDown!.ratio, pDown!.fromH + pDown!.delta));
      return Cs(
        lin.map((x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.max(0, x) ** (1 / 2.4) - 0.055)) as unknown as Rgb,
      );
    };
    RING.forEach((c, k) => {
      const fullC = fullMatchC(c);
      const w = total(c, down);
      if (w <= 0) return;
      if (w < 1 - 1e-9) expect(hueDiff(okH(outDown[k]!), okH(c))).toBeLessThan(0);
      else expect(Math.abs(hueDiff(okH(outDown[k]!), okH(hexRgb(ringHex(250)))))).toBeLessThanOrEqual(1);
      expect(Cs(outDown[k]!)).toBeGreaterThanOrEqual(Math.min(Cs(c), fullC) - 2);
    });
    // To 210°, exactly opposite: every matched step turns by increasing hue, full matches land on 210°.
    const opposite = one(from, ringHex(210), 0, 100);
    const outOpp = render(RING, opposite);
    RING.forEach((c, k) => {
      const w = total(c, opposite);
      if (w <= 0) return;
      if (w < 1 - 1e-9) expect(hueDiff(okH(outOpp[k]!), okH(c))).toBeGreaterThan(0);
      else expect(Math.abs(hueDiff(okH(outOpp[k]!), okH(hexRgb(ringHex(210)))))).toBeLessThanOrEqual(1);
    });
    // To 185° at Range 30 and Softness 50: no two adjacent ring steps differ in output hue by more than 25°.
    const out185 = render(RING, one(from, ringHex(185), 30, 50));
    for (let k = 0; k < 360; k++)
      expect(Math.abs(hueDiff(okH(out185[(k + 1) % 360]!), okH(out185[k]!)))).toBeLessThanOrEqual(25);
  });

  it('F-028.AC14 overlapping replacements: the first wins where it matches in full, shares never exceed 1, swapping changes only steps both match', () => {
    const r1 = { from: ringHex(30), to: ringHex(210), range: 100, softness: 50 };
    const r2 = { from: ringHex(50), to: ringHex(150), range: 100, softness: 50 };
    const both: ColourTools = { replace: [r1, r2] };
    const swapped: ColourTools = { replace: [r2, r1] };
    const out = render(RING, both);
    const single = render(RING, { replace: [r1] });
    expect(Math.abs(hueDiff(okH(out[30]!), okH(hexRgb(ringHex(210)))))).toBeLessThanOrEqual(1);
    expect(Math.abs(Cs(out[30]!) - Cs(single[30]!))).toBeLessThanOrEqual(2);
    const outSwapped = render(RING, swapped);
    const p1 = params({ replace: [r1] });
    const p2 = params({ replace: [r2] });
    RING.forEach((c, k) => {
      expect(total(c, both)).toBeLessThanOrEqual(1 + 1e-12);
      expect(total(c, swapped)).toBeLessThanOrEqual(1 + 1e-12);
      const bothMatch = replaceWeights(srgbToOklab(c), p1)[0]! > 0 && replaceWeights(srgbToOklab(c), p2)[0]! > 0;
      if (!bothMatch) expect(outSwapped[k]).toEqual(out[k]);
    });
  });

  it('F-028.AC15 render: a faint flat patch (C* 8) as From turns only part of the way to To, by the grey fade’s weight', () => {
    const patch = rgbOfLab([55, 8, 0]).map((x) => Math.min(1, Math.max(0, x))) as unknown as Rgb;
    const hex = rgbHex(patch);
    const c = hexRgb(hex);
    expect(fromStatus(hex)).toBe('faint');
    const g = greyGate(linear(c));
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(1);
    const [out] = render([c], one(hex, BLUE));
    const [, , hFrom] = ok(c);
    const toH = okH(hexRgb(BLUE));
    // The patch matches its own hue in full except for the grey fade: it turns g of the way.
    expect(Math.abs(hueDiff(okH(out!), hFrom) - g * hueDiff(toH, hFrom))).toBeLessThanOrEqual(1);
    expect(smoothstep(2, 12, Cs(c))).toBeCloseTo(g, 6);
  });

  it('RULE-25 *Picking* the disc is averaged in linear light and counts only the clip’s own picture (a pick near its edge)', () => {
    const side = discSide(3.6);
    expect(side).toBe(9);
    // Left half black (the background), right half the clip: white and red columns.
    const rgba = new Uint8Array(side * side * 4);
    for (let j = 0; j < side; j++)
      for (let i = 0; i < side; i++)
        rgba.set(i < 4 ? [0, 0, 0, 255] : i % 2 ? [255, 255, 255, 255] : [255, 0, 0, 255], (j * side + i) * 4);
    const rect = { x0: 104, y0: 0, x1: 200, y1: 200 };
    const mean = discMean(rgba, side, 100, 100, 104.5, 104.5, 3.6, rect)!;
    // Only clip pixels count; red and white mix in linear light (G and B at ~0.5 linear, not 0.5 encoded).
    expect(mean[0]).toBeCloseTo(1, 6);
    expect(mean[1]).toBeGreaterThan(0.6);
    expect(mean[1]).toBeLessThan(0.8);
    expect(discMean(rgba, side, 100, 100, 104.5, 104.5, 3.6, { x0: 300, y0: 0, x1: 400, y1: 10 })).toBeNull();
  });

  it('RULE-25 a grey To colour makes full matches grey and does not move the hue', () => {
    const t = one(FROM, '#808080');
    const [out] = render([hexRgb(FROM)], t);
    expect(Cs(out!)).toBeLessThan(2);
  });
});
