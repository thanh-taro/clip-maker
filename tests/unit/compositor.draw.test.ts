// MOD-Compositor plan → draw list (ADR-0006 §1/§3, outcome rule 2): placement quads (RULE-07),
// background and fades (RULE-04, RULE-10), intermediate sizing, text placement (ADR-0012), compare.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT, PALETTE_HEX, type Placement } from '../../src/core';
import { framePlan } from '../../src/plan';
import {
  backgroundColour,
  drawList,
  hexToRgb,
  intermediateSize,
  mixPixel,
  NEUTRAL,
  placeQuad,
  type SourceSize,
} from '../../src/compositor';
import { photo, proj, S, text, video } from '../support/project';

const HD: SourceSize = { width: 1920, height: 1080, rotation: 0 };
const NO_TEXT = new Map<string, { width: number; height: number; s: number }>();

/** Screen rect of a quad in pixels (from clip-space corners). */
function rect(pos: readonly number[], W: number, H: number): { x0: number; y0: number; x1: number; y1: number } {
  const xs = [pos[0]!, pos[2]!, pos[4]!, pos[6]!].map((x) => ((x + 1) / 2) * W);
  const ys = [pos[1]!, pos[3]!, pos[5]!, pos[7]!].map((y) => ((1 - y) / 2) * H);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Texture coordinate at a screen corner index: 0 TL, 1 TR, 2 BL, 3 BR. */
const texAt = (tex: readonly number[], i: number): [number, number] => [tex[2 * i]!, tex[2 * i + 1]!];

describe('RULE-07 placement quads', () => {
  it('RULE-07 Fit shows the whole clip: 16:9 in a 9:16 frame is letterboxed, centred', () => {
    const q = placeQuad(1080, 1920, HD, DEFAULT_PLACEMENT);
    const r = rect(q.pos, 1080, 1920);
    expect(r.x0).toBeCloseTo(0, 6);
    expect(r.x1).toBeCloseTo(1080, 6);
    expect(r.y1 - r.y0).toBeCloseTo(607.5, 6);
    expect((r.y0 + r.y1) / 2).toBeCloseTo(960, 6);
  });

  it('RULE-07 Fill covers the frame and cuts the edges off', () => {
    const r = rect(placeQuad(1080, 1920, HD, { ...DEFAULT_PLACEMENT, mode: 'fill' }).pos, 1080, 1920);
    expect(r.y0).toBeCloseTo(0, 6);
    expect(r.y1).toBeCloseTo(1920, 6);
    expect(r.x1 - r.x0).toBeCloseTo((1920 * 1920) / 1080, 6);
  });

  it('RULE-07 scale and position: the centre moves by fractions of the frame', () => {
    const p: Placement = { ...DEFAULT_PLACEMENT, scale: 50, offsetX: 0.25, offsetY: -0.1 };
    const r = rect(placeQuad(1920, 1080, HD, p).pos, 1920, 1080);
    expect(r.x1 - r.x0).toBeCloseTo(960, 6);
    expect((r.x0 + r.x1) / 2).toBeCloseTo(960 + 480, 6);
    expect((r.y0 + r.y1) / 2).toBeCloseTo(540 - 108, 6);
  });

  it('RULE-07 a 90° rotation is computed on the rotated clip and turns the picture clockwise', () => {
    const q = placeQuad(1080, 1920, HD, { ...DEFAULT_PLACEMENT, rotation: 90 });
    const r = rect(q.pos, 1080, 1920);
    expect(r.x1 - r.x0).toBeCloseTo(1080, 6); // 1080 × 1920 when turned: fills a 9:16 frame
    expect(r.y1 - r.y0).toBeCloseTo(1920, 6);
    // The picture's top-left lands at the screen's top-right.
    expect(texAt(q.tex, 1)).toEqual([0, 0]);
  });

  it('RULE-07 the container rotation applies before the user’s rotation', () => {
    const stored: SourceSize = { width: 1920, height: 1080, rotation: 90 };
    const q = placeQuad(1080, 1920, stored, DEFAULT_PLACEMENT);
    expect(texAt(q.tex, 1)).toEqual([0, 0]);
    const back = placeQuad(1920, 1080, stored, { ...DEFAULT_PLACEMENT, rotation: 270 });
    expect(texAt(back.tex, 0)).toEqual([0, 0]);
  });

  it('RULE-07 flips mirror the picture as displayed', () => {
    const h = placeQuad(1920, 1080, HD, { ...DEFAULT_PLACEMENT, flipH: true });
    expect(texAt(h.tex, 0)).toEqual([1, 0]);
    const v = placeQuad(1920, 1080, HD, { ...DEFAULT_PLACEMENT, flipV: true });
    expect(texAt(v.tex, 0)).toEqual([0, 1]);
    const turned = placeQuad(1080, 1920, HD, { ...DEFAULT_PLACEMENT, rotation: 90, flipH: true });
    // Rotated then mirrored on screen: the picture's top-left is at the screen's top-left.
    expect(texAt(turned.tex, 0)).toEqual([0, 0]);
  });

  it('RULE-07 property: corners map to the four picture corners and the centre follows the offset', () => {
    fc.assert(
      fc.property(
        fc.record({
          mode: fc.constantFrom('fit' as const, 'fill' as const),
          scale: fc.integer({ min: 50, max: 400 }),
          offsetX: fc.double({ min: -1, max: 1, noNaN: true }),
          offsetY: fc.double({ min: -1, max: 1, noNaN: true }),
          rotation: fc.constantFrom(0 as const, 90 as const, 180 as const, 270 as const),
          flipH: fc.boolean(),
          flipV: fc.boolean(),
        }),
        fc.constantFrom(0 as const, 90 as const, 180 as const, 270 as const),
        (p, stored) => {
          const q = placeQuad(1920, 1080, { width: 1280, height: 720, rotation: stored }, p);
          const corners = [0, 1, 2, 3].map((i) => texAt(q.tex, i).join(',')).sort();
          expect(corners).toEqual(['0,0', '0,1', '1,0', '1,1']);
          const r = rect(q.pos, 1920, 1080);
          expect((r.x0 + r.x1) / 2).toBeCloseTo(960 + p.offsetX * 1920, 6);
          expect((r.y0 + r.y1) / 2).toBeCloseTo(540 + p.offsetY * 1080, 6);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('ADR-0006 outcome rule 2 intermediates', () => {
  it('ADR-0006 the grade intermediate is the placed size on the target, not the source size', () => {
    const it4k = intermediateSize({ width: 3840, height: 2160, rotation: 0 }, [1920, 1080], 1920, 1080);
    expect(it4k).toEqual({ width: 1920, height: 1080, taps: 4 });
    const small = intermediateSize({ width: 640, height: 360, rotation: 0 }, [1920, 1080], 1920, 1080);
    expect(small).toEqual({ width: 640, height: 360, taps: 1 });
    // A 400 % zoom never exceeds the target's longer side.
    const zoom = intermediateSize({ width: 3840, height: 2160, rotation: 0 }, [7680, 4320], 1920, 1080);
    expect(zoom.width).toBe(1920);
  });

  it('RULE-02 a 5K source drawn at 2160 is sampled down with 4 taps', () => {
    const r = intermediateSize({ width: 5120, height: 2880, rotation: 0 }, [3840, 2160], 3840, 2160);
    expect(r.width).toBe(3840);
    expect(r.taps).toBe(1); // 1.33×: bilinear is enough
    expect(intermediateSize({ width: 5120, height: 2880, rotation: 0 }, [1920, 1080], 1920, 1080).taps).toBe(4);
  });
});

describe('RULE-04 / RULE-10 background, fades and cross-fades', () => {
  it('RULE-04 the background is the palette colour, or black under Blur', () => {
    expect(backgroundColour({ aspect: '16:9', frameRate: 30, background: 'white' })).toEqual([1, 1, 1]);
    expect(backgroundColour({ aspect: '16:9', frameRate: 30, background: 'red' })).toEqual(hexToRgb(PALETTE_HEX.red));
    expect(backgroundColour({ aspect: '16:9', frameRate: 30, background: 'blur' })).toEqual([0, 0, 0]);
  });

  it('RULE-04 Blur adds a cover quad per layer; a colour background does not', () => {
    const p = proj({ clips: [video('a', 4)] });
    expect(drawList(framePlan(p, 0), 1920, 1080, [HD], NO_TEXT).layers[0]!.blur).toBeNull();
    const blur = {
      ...proj({ clips: [video('a', 4)] }),
      frame: { aspect: '9:16', frameRate: 30, background: 'blur' },
    } as const;
    const L = drawList(framePlan(blur, 0), 1080, 1920, [HD], NO_TEXT).layers[0]!;
    const r = rect(L.blur!.pos, 1080, 1920);
    expect(r.y0).toBeCloseTo(0, 6);
    expect(r.y1).toBeCloseTo(1920, 6);
  });

  it('RULE-10 a fade mixes the layer toward the background in a straight line', () => {
    const list = { fadeTo: [0, 0, 0] as const, background: [0, 0, 0] as const };
    expect(mixPixel(list, [{ colour: [1, 0.5, 0], weight: 1, opacity: 0.25 }])).toEqual([0.25, 0.125, 0]);
    const white = { fadeTo: [1, 1, 1] as const, background: [1, 1, 1] as const };
    expect(mixPixel(white, [{ colour: [0, 0, 0], weight: 1, opacity: 0.5 }])).toEqual([0.5, 0.5, 0.5]);
  });

  it('RULE-10 a cross-fade blends the two layers linearly by their weights', () => {
    const list = { fadeTo: [0, 0, 0] as const, background: [0, 0, 0] as const };
    const c = mixPixel(list, [
      { colour: [1, 0, 0], weight: 0.25, opacity: 1 },
      { colour: [0, 0, 1], weight: 0.75, opacity: 1 },
    ]);
    expect(c).toEqual([0.25, 0, 0.75]);
    expect(mixPixel(list, [])).toEqual([0, 0, 0]);
  });

  it('F-002.R1 inside a cross-fade the draw list holds both clips with the plan’s weights', () => {
    const p = proj({ clips: [video('a', 4, { crossFadeNext: S }), video('b', 4)] });
    const k = 3 * 30 + 15; // halfway through the 1 s cross-fade
    const plan = framePlan(p, k);
    const list = drawList(plan, 1920, 1080, [HD, HD], NO_TEXT);
    expect(list.layers.map((l) => l.clipId)).toEqual(['a', 'b']);
    expect(list.layers[0]!.weight + list.layers[1]!.weight).toBeCloseTo(1, 9);
    expect(list.layers[1]!.weight).toBeCloseTo(plan.layers[1]!.weight, 12);
  });

  it('INV-07 nothing is drawn at or past the project end', () => {
    const p = proj({ clips: [video('a', 2)], textLayers: [text('t', 0, 5)] });
    const list = drawList(framePlan(p, 60), 1920, 1080, [], new Map([['t', { width: 10, height: 10, s: 1080 }]]));
    expect(list.layers).toEqual([]);
    expect(list.texts).toEqual([]);
  });

  it('F-002.R1 a layer without its frame is left out (its background shows)', () => {
    const p = proj({ clips: [video('a', 4)] });
    expect(drawList(framePlan(p, 0), 1920, 1080, [null], NO_TEXT).layers).toEqual([]);
  });
});

describe('ADR-0012 text and RULE-08 compare in the draw list', () => {
  it('F-010.R5 a text bitmap is centred on the layer’s position and scaled from the s it was made for', () => {
    const p = proj({ clips: [photo('p', 3)], textLayers: [text('t', 0, 2, { x: 0.5, y: 0.8 })] });
    const plan = framePlan(p, 0);
    const at1080 = drawList(
      plan,
      1920,
      1080,
      [{ width: 1200, height: 1600, rotation: 0 }],
      new Map([['t', { width: 400, height: 100, s: 1080 }]]),
    );
    const r = rect(at1080.texts[0]!.quad.pos, 1920, 1080);
    expect([r.x0, r.y0, r.x1, r.y1]).toEqual([760, 814, 1160, 914]);
    const at2160 = drawList(
      plan,
      3840,
      2160,
      [{ width: 1200, height: 1600, rotation: 0 }],
      new Map([['t', { width: 400, height: 100, s: 1080 }]]),
    );
    const r2 = rect(at2160.texts[0]!.quad.pos, 3840, 2160);
    expect(r2.x1 - r2.x0).toBeCloseTo(800, 6);
  });

  it('RULE-08 compare draws the held clip with the neutral grade, others keep theirs', () => {
    const p = proj({
      clips: [video('a', 4, { adjustments: { contrast: 50 }, look: { id: 'cine-moody', intensity: 80 } })],
    });
    const plan = framePlan(p, 0);
    expect(drawList(plan, 1920, 1080, [HD], NO_TEXT, { compare: 'a' }).layers[0]!.grade).toEqual(NEUTRAL);
    const graded = drawList(plan, 1920, 1080, [HD], NO_TEXT).layers[0]!.grade;
    expect(graded.look).toBe('cine-moody');
    expect(graded.lookMix).toBeCloseTo(0.8, 9);
  });

  it('RULE-08 sharpen radius and grain cell are relative to s', () => {
    const p = proj({ clips: [video('a', 4)] });
    const a = drawList(framePlan(p, 0), 1920, 1080, [HD], NO_TEXT);
    const b = drawList(framePlan(p, 0), 3840, 2160, [HD], NO_TEXT);
    expect(b.grainCell).toBe(2 * a.grainCell);
    expect(b.layers[0]!.sharpenStep[0]).toBeCloseTo(a.layers[0]!.sharpenStep[0], 12);
  });
});
