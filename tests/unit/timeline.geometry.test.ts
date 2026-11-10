// MOD-Timeline geometry (pure): the fit scale, clip boxes with cross-fade overlaps (INV-03), the ruler
// ticks, and where a dragged clip lands (RULE-05 reorder: the nearest clip boundary).
import { describe, expect, it } from 'vitest';
import type { Clip, Project } from '../../src/core';
import {
  EMPTY_SPAN,
  boundaryAt,
  clipBoxes,
  fitScale,
  labelFits,
  moveTarget,
  rulerTicks,
  timeAt,
} from '../../src/timeline/geometry';
import { S, photo as still, proj } from '../support/project';

const photo = (id: string, seconds: number, crossFadeNext = 0): Clip =>
  still(id, seconds, { crossFadeNext: crossFadeNext * S });
const projectOf = (...clips: Clip[]): Project => proj({ clips });

describe('MOD-Timeline geometry', () => {
  it('CMP-Timeline clip widths equal duration × the ruler scale, so content ends at the project end', () => {
    const p = projectOf(photo('a', 4), photo('b', 6));
    const scale = fitScale(1000, 10 * S);
    expect(scale * 10 * S).toBeCloseTo(1000);
    const boxes = clipBoxes(p, scale);
    expect(boxes.map((b) => [b.id, b.x, b.width])).toEqual([
      ['a', 0, 400],
      ['b', 400, 600],
    ]);
    expect(boxes[1]!.end).toBe(10 * S);
  });

  it('INV-03 a cross-fade overlaps the two neighbours by its duration', () => {
    const p = projectOf(photo('a', 4, 1), photo('b', 6));
    const boxes = clipBoxes(p, fitScale(900, 9 * S));
    expect(boxes[0]!.crossFadeOut).toBe(1 * S);
    expect(boxes[1]!.crossFadeIn).toBe(1 * S);
    expect(boxes[1]!.start).toBe(3 * S);
    expect(boxes[1]!.x).toBeCloseTo(300);
  });

  it('CMP-Timeline an empty project shows a ruler of EMPTY_SPAN', () => {
    expect(fitScale(600, 0) * EMPTY_SPAN).toBeCloseTo(600);
  });

  it('CMP-Timeline ruler labels are at least the minimum gap apart, on round m:ss steps', () => {
    const ticks = rulerTicks(60 * S, fitScale(600, 60 * S), 56);
    expect(ticks.step).toBe(10 * S);
    expect(ticks.labels).toEqual([0, 10, 20, 30, 40, 50, 60].map((s) => s * S));
    expect(ticks.minor.length).toBeGreaterThan(ticks.labels.length);
    expect(rulerTicks(2 * S, fitScale(600, 2 * S), 56).step).toBe(1 * S);
  });

  it('RULE-05 a dragged clip goes to the clip boundary nearest the drop point', () => {
    const p = projectOf(photo('a', 2), photo('b', 2), photo('c', 2));
    const boxes = clipBoxes(p, fitScale(600, 6 * S));
    expect(boundaryAt(boxes, 10)).toBe(0);
    expect(boundaryAt(boxes, 190)).toBe(1);
    expect(boundaryAt(boxes, 590)).toBe(3);
    // F-003.AC1: C (index 2) dropped at the start goes to index 0 of the resulting order.
    expect(moveTarget(2, 0)).toBe(0);
    // A at the end: boundary 3 → index 2 of the result.
    expect(moveTarget(0, 3)).toBe(2);
    // Dropped next to itself: no move.
    expect(moveTarget(1, 1)).toBeNull();
    expect(moveTarget(1, 2)).toBeNull();
  });

  it('F-002.R3 the ruler maps a pointer position to a time within the project', () => {
    const scale = fitScale(1000, 10 * S);
    expect(timeAt(250, scale, 10 * S)).toBe(2.5 * S);
    expect(timeAt(-20, scale, 10 * S)).toBe(0);
    expect(timeAt(5000, scale, 10 * S)).toBe(10 * S);
  });

  it('CMP-Timeline under 48 px of width a clip shows its duration only', () => {
    expect(labelFits(47)).toBe(false);
    expect(labelFits(48)).toBe(true);
  });
});
