// MOD-Plan — the RULE-09 look thumbnail recipe (F-008.R1): the selected clip alone, at the playhead frame
// when the playhead is inside it, otherwise its first frame; with its adjustments and the look at 100.
import { describe, expect, it } from 'vitest';
import { framePlan, thumbnailPlan } from '../../src/plan';
import { S, photo, proj, text, video } from '../support/project';

const at = (seconds: number) => Math.round(seconds * S);

describe('MOD-Plan look thumbnails', () => {
  it('RULE-09 F-008.R1 the thumbnail shows the playhead frame when the playhead is inside the selected clip', () => {
    const p = proj({ clips: [video('A', 4), video('B', 6, {}, 1)] });
    // B starts at 4 s on the timeline and at 1 s in its source; the playhead at 5 s is 1 s into B.
    const plan = thumbnailPlan(p, 'B', at(5))!;
    expect(plan.layers).toHaveLength(1);
    expect(plan.layers[0]!.clip.id).toBe('B');
    expect(plan.layers[0]!.sourceTime).toBe(framePlan(p, 150).layers[0]!.sourceTime);
    expect(plan.frameIndex).toBe(150);
  });

  it("RULE-09 F-008.R1 otherwise the thumbnail shows the clip's first frame", () => {
    const p = proj({ clips: [video('A', 4), video('B', 6, {}, 1)] });
    const plan = thumbnailPlan(p, 'B', at(1))!;
    expect(plan.frameIndex).toBe(120);
    expect(plan.layers[0]!.sourceTime).toBe(1 * S);
    // At the project end (the playhead past every clip) the first frame too.
    expect(thumbnailPlan(p, 'B', at(9))!.frameIndex).toBe(120);
  });

  it('RULE-09 the thumbnail includes the adjustments, with the look at intensity 100, and only that clip', () => {
    const p = proj({
      clips: [
        video('A', 4, {
          crossFadeNext: S,
          fadeIn: S,
          adjustments: { brightness: 30 },
          look: { id: 'film-faded', intensity: 40 },
        }),
        video('B', 4),
      ],
      textLayers: [text('T', 0, 8)],
    });
    // Inside the cross-fade and the fade: the thumbnail is the clip on its own, fully shown.
    const plan = thumbnailPlan(p, 'A', at(3.5), 'bw-classic')!;
    expect(plan.layers).toHaveLength(1);
    const layer = plan.layers[0]!;
    expect(layer.weight).toBe(1);
    expect(layer.opacity).toBe(1);
    expect(layer.clip.adjustments).toEqual({ brightness: 30 });
    expect(layer.clip.look).toEqual({ id: 'bw-classic', intensity: 100 });
    expect(plan.texts).toEqual([]);
    // The fade-in's first frame is drawn fully too.
    expect(thumbnailPlan(p, 'A', at(0), 'bw-classic')!.layers[0]!.opacity).toBe(1);
    // None: the clip without a look; no look given: the clip's own.
    expect(thumbnailPlan(p, 'A', at(0), null)!.layers[0]!.clip.look).toBeNull();
    expect(thumbnailPlan(p, 'A', at(0))!.layers[0]!.clip.look).toEqual({ id: 'film-faded', intensity: 40 });
  });

  it('RULE-09 a photo clip and an unknown clip', () => {
    const p = proj({ clips: [photo('P', 3)] });
    expect(thumbnailPlan(p, 'P', at(1), 'natural-warm')!.layers[0]!.sourceTime).toBe(0);
    expect(thumbnailPlan(p, 'nope', 0, 'natural-warm')).toBeNull();
  });
});
