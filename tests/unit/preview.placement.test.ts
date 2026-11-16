// MOD-Preview — on-preview placement geometry (F-006.R2, RULE-07, RULE-21): where the selected clip and
// its eight handles sit over the preview, a move measured from where the drag began with the RULE-07
// centre snap within 8 screen pixels, and scaling from a corner or edge handle or a pinch. The rule maths
// (placedRect, clampPlacement) is MOD-Core's; the compositor's quad is tested in compositor.draw.test.ts.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT, RULE_07, type Placement } from '../../src/core';
import { handlePoints, moveFrom, pinchScale, scaleFrom, screenRect } from '../../src/preview/placement';

const P = (extra: Partial<Placement> = {}): Placement => ({ ...DEFAULT_PLACEMENT, ...extra });
/** A 9:16 frame shown at 270 × 480 CSS pixels, and a 1920 × 1080 (16:9) picture. */
const FRAME = { width: 270, height: 480 };
const HD = { width: 1920, height: 1080 };

describe('MOD-Preview placement geometry', () => {
  it('F-006.AC1 RULE-07 a 16:9 clip in a 9:16 frame: Fit spans the width with room above and below, Fill covers the height and its sides are cut off', () => {
    const fit = screenRect(FRAME, HD, P());
    expect(fit).toEqual({ cx: 135, cy: 240, width: 270, height: 151.875 });
    const fill = screenRect(FRAME, HD, P({ mode: 'fill' }));
    expect(fill.height).toBe(480);
    expect(fill.width).toBeCloseTo(853.33, 2);
    expect(fill.cx - fill.width / 2).toBeLessThan(0);
  });

  it('RULE-07 a 90° rotation is placed on the rotated clip (a sideways 16:9 clip fits a 9:16 frame exactly)', () => {
    expect(screenRect(FRAME, HD, P({ rotation: 90 }))).toEqual({ cx: 135, cy: 240, width: 270, height: 480 });
  });

  it('CMP-Preview "clip selected" eight handles: the corners and the middle of each edge of the clip', () => {
    const h = handlePoints({ cx: 100, cy: 50, width: 40, height: 20 });
    expect(h).toEqual({
      nw: [80, 40],
      n: [100, 40],
      ne: [120, 40],
      e: [120, 50],
      se: [120, 60],
      s: [100, 60],
      sw: [80, 60],
      w: [80, 50],
    });
  });

  it('F-006.AC2 RULE-07 a drag that brings the centre within 8 screen pixels of the frame centre snaps it to both centre lines', () => {
    // Centre starts 54 px right and 48 px below the frame centre; the drag ends 5 px right, 7 px below.
    const start = P({ offsetX: 0.2, offsetY: 0.1 });
    const m = moveFrom(start, -49, -41, FRAME, true);
    expect(m).toEqual({ offsetX: 0, offsetY: 0, snapX: true, snapY: true });
  });

  it('RULE-07 snapping: 8 px snaps, 9 px does not, and with snapping off nothing snaps', () => {
    const start = P();
    expect(moveFrom(start, 8, 0, FRAME, true)).toMatchObject({ offsetX: 0, snapX: true });
    expect(moveFrom(start, 9, 0, FRAME, true)).toMatchObject({ offsetX: 0.0333, snapX: false });
    expect(moveFrom(start, 5, 0, FRAME, false)).toMatchObject({ offsetX: 0.0185, snapX: false });
    expect(RULE_07.snapPx).toBe(8);
  });

  it('F-006.R2 a move is measured from where the drag began: back where it began is exactly the starting offset (no snap)', () => {
    const start = P({ offsetX: 0.0123, offsetY: -0.004 });
    expect(moveFrom(start, 0, 0, FRAME, true)).toEqual({
      offsetX: 0.0123,
      offsetY: -0.004,
      snapX: false,
      snapY: false,
    });
    // A move is in fractions of the frame's width and height (RULE-07 position), the clip may leave the frame.
    expect(moveFrom(P(), 540, -960, FRAME, true)).toMatchObject({ offsetX: 2, offsetY: -2 });
  });

  it('F-006.R2 corner handles scale by the distance from the clip centre, edge handles along their axis; 50–400 % in 1 % steps', () => {
    const c: [number, number] = [135, 240];
    // Corner: twice as far from the centre → 200 %.
    expect(scaleFrom(100, 'se', c, [270, 315], [405, 390])).toBe(200);
    // East edge: only the horizontal distance counts.
    expect(scaleFrom(100, 'e', c, [270, 240], [337.5, 400])).toBe(150);
    // North edge: only the vertical distance counts.
    expect(scaleFrom(150, 'n', c, [135, 140], [135, 190])).toBe(75);
    // Clamped to RULE-07's range, rounded to whole percent.
    expect(scaleFrom(100, 'nw', c, [35, 140], [134, 239])).toBe(50);
    expect(scaleFrom(200, 'sw', c, [35, 340], [-765, 1140])).toBe(400);
    expect(scaleFrom(100, 'e', c, [270, 240], [271, 240])).toBe(101);
    // Not moved: the starting scale.
    expect(scaleFrom(137, 'ne', c, [200, 200], [200, 200])).toBe(137);
  });

  it('RULE-21 F-006.R2 pinching scales by the change in finger distance', () => {
    expect(pinchScale(100, 80, 120)).toBe(150);
    expect(pinchScale(100, 80, 10)).toBe(50);
    expect(pinchScale(300, 50, 100)).toBe(400);
    expect(pinchScale(120, 0, 100)).toBe(120);
  });
});
