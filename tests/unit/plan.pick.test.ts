// MOD-Plan pick mode (RULE-25 *Pick mode*, F-028.R2/R8; ADR-0017 §7 Amendment): the frame pick mode starts on, and
// the plan it paints — the selected clip's source picture alone, without grade, look, fades, the other clip of a
// cross-fade or text. The UI half (playback pauses, no undo step) is in tests/e2e/colour-replace.spec.ts.
import { describe, expect, it } from 'vitest';
import { drawList } from '../../src/compositor';
import { frameIndexAt, layoutOf, pickStartFrame } from '../../src/core';
import { framePlan, pickPlan } from '../../src/plan';
import { photo, proj, text, video } from '../support/project';

const S = 1_000_000;

describe('MOD-Plan pick mode (RULE-25)', () => {
  it('F-028.AC5 (plan) the playhead on the clip stays; outside it, the clip’s first frame after a 0.5 s fade in; a fade in and an incoming cross-fade covering the whole clip give its last frame', () => {
    const p = proj({ clips: [photo('A', 2), video('B', 3, { fadeIn: S / 2 })] });
    const spans = layoutOf(p).spans;
    const inB = spans[1]!.startFrame + 10;
    expect(pickStartFrame(p, 'B', inB)).toBe(inB);
    // Playhead on clip A: B starts after its fade in (0.5 s at 30 fps = 15 frames).
    expect(pickStartFrame(p, 'B', 3)).toBe(spans[1]!.startFrame + 15);
    expect(framePlan(p, spans[1]!.startFrame + 15).layers[0]!.opacity).toBe(1);
    expect(framePlan(p, spans[1]!.startFrame + 14).layers[0]!.opacity).toBeLessThan(1);
    // B (1 s) with a fade in and A's cross-fade into it covering all of it: B's last frame.
    const q = proj({
      clips: [photo('A', 2, { crossFadeNext: S }), video('B', 1, { fadeIn: S / 2 })],
    });
    const span = layoutOf(q).spans[1]!;
    expect(span.endFrame - span.startFrame).toBe(layoutOf(q).spans[0]!.crossFadeFrames);
    expect(pickStartFrame(q, 'B', 0)).toBe(span.endFrame - 1);
    expect(pickStartFrame(q, 'missing', 0)).toBeNull();
  });

  it('F-028.R8 RULE-25 the pick plan holds only the selected clip, ungraded, fully shown, without text', () => {
    const tools = { replace: [{ from: '#C8281E', to: '#0050FF', range: 30, softness: 50 }] };
    const p = proj({
      clips: [
        photo('A', 2, { crossFadeNext: S, adjustments: { brightness: 40 }, look: { id: 'cine-moody', intensity: 80 } }),
        photo('B', 3, { colourTools: tools, adjustments: { contrast: 30 }, fadeOut: S }),
      ],
      textLayers: [text('T', 0, 5)],
    });
    const k = frameIndexAt(Math.round(1.5 * S), 30); // inside the cross-fade
    expect(framePlan(p, k).layers).toHaveLength(2);
    const plan = pickPlan(p, 'B', k)!;
    expect(plan.layers).toHaveLength(1);
    const [layer] = plan.layers;
    expect(layer!.clip.id).toBe('B');
    expect([layer!.weight, layer!.opacity]).toEqual([1, 1]);
    expect(layer!.clip.adjustments).toEqual({});
    expect(layer!.clip.look).toBeNull();
    expect(layer!.clip.colourTools).toBeUndefined();
    expect(plan.texts).toEqual([]);
    // Drawn with no colour stage at all.
    const list = drawList(plan, 640, 360, [{ width: 1200, height: 1600, rotation: 0 }], new Map());
    const g = list.layers[0]!.grade;
    expect([g.replace, g.hue, g.split, g.duotone, g.look, g.wbOn]).toEqual([null, null, null, null, null, false]);
    expect(pickPlan(p, 'B', 0)).toBeNull();
  });
});
