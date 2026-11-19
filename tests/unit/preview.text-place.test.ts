// MOD-Preview — the text move geometry (F-010.R3, RULE-11 *Position* and snapping, RULE-21 preview gestures).
import { describe, expect, it } from 'vitest';
import { RULE_11 } from '../../src/core';
import { clampTextSize, moveText, pinchTextSize, textSizeFrom } from '../../src/preview';

const frame = { width: 360, height: 640 };
const block = { width: 100, height: 40 };

describe('F-010 moving a text layer in the preview', () => {
  it('F-010.AC3 with snapping on, a left edge brought within 8 screen pixels of the left safe margin snaps to it', () => {
    // Centre at 0.5: left edge at 130 px. Move it to 7 px right of the margin (18 + 7 = 25 → dx = −105).
    const margin = RULE_11.safeMargin * frame.width;
    const m = moveText({ x: 0.5, y: 0.8 }, margin + 7 - 130, 0, frame, block, true);
    expect(m.snapX).toBe(RULE_11.safeMargin);
    expect(m.x * frame.width - block.width / 2).toBeCloseTo(margin, 2);
    // 9 px away: no snap.
    const far = moveText({ x: 0.5, y: 0.8 }, margin + 9 - 130, 0, frame, block, true);
    expect(far.snapX).toBeNull();
  });

  it('RULE-11 the centre snaps to the centre lines; the right and bottom edges to their margins', () => {
    const c = moveText({ x: 0.3, y: 0.3 }, 0.2 * 360 - 5, 0.2 * 640 + 6, frame, block, true);
    expect([c.x, c.y, c.snapX, c.snapY]).toEqual([0.5, 0.5, 0.5, 0.5]);
    const right = moveText({ x: 0.5, y: 0.5 }, 360 * 0.95 - 50 - 180 - 3, 640 * 0.95 - 20 - 320 + 4, frame, block, true);
    expect(right.snapX).toBe(1 - RULE_11.safeMargin);
    expect(right.snapY).toBe(1 - RULE_11.safeMargin);
  });

  it('RULE-14 with snapping off nothing snaps; a drag back to its start is exactly its start (Q104)', () => {
    const off = moveText({ x: 0.3, y: 0.3 }, 0.2 * 360 - 5, 0, frame, block, false);
    expect(off.snapX).toBeNull();
    expect(off.x).toBeCloseTo((0.3 * 360 + 0.2 * 360 - 5) / 360, 4);
    expect(moveText({ x: 0.1234, y: 0.8 }, 0, 0, frame, block, true)).toEqual({ x: 0.1234, y: 0.8, snapX: null, snapY: null });
  });

  it('RULE-11 the block’s centre stays within the frame', () => {
    const m = moveText({ x: 0.5, y: 0.5 }, -1000, 2000, frame, block, true);
    expect([m.x, m.y]).toEqual([0, 1]);
  });

  it('RULE-11 RULE-21 a handle drag or a pinch scales the size within 2–20 %', () => {
    expect(textSizeFrom(6, [0, 0], [10, 0], [20, 0])).toBe(12);
    expect(textSizeFrom(6, [0, 0], [10, 0], [100, 0])).toBe(20);
    expect(pinchTextSize(6, 100, 10)).toBe(2);
    expect(pinchTextSize(6, 100, 150)).toBe(9);
    expect(clampTextSize(6.4)).toBe(6);
  });
});
