// MOD-Timeline geometry for trimming (F-004): an item's span, the time under a trim drag, and RULE-14
// snapping of the trimmed edge (within 8 screen pixels of time 0, the playhead, the project end and the
// other items' edges, leaving out what moves with the edge).
import { describe, expect, it } from 'vitest';
import { itemSpan, pointerTime, snapTime, trimSnapTargets } from '../../src/timeline/geometry';
import { S, audio, proj, text, video } from '../support/project';

const p = proj({
  clips: [video('A', 4), video('B', 6), video('C', 2)],
  textLayers: [text('T', 1, 3)],
  audioClips: [audio('M', 5, 9)],
});

describe('MOD-Timeline trim geometry', () => {
  it('F-004.R3 an item’s span on the timeline: a clip, a text layer or an audio clip', () => {
    expect(itemSpan(p, 'B')).toEqual({ kind: 'clip', start: 4 * S, end: 10 * S });
    expect(itemSpan(p, 'T')).toEqual({ kind: 'text', start: 1 * S, end: 3 * S });
    expect(itemSpan(p, 'M')).toEqual({ kind: 'audio', start: 5 * S, end: 9 * S });
    expect(itemSpan(p, 'nope')).toBeNull();
  });

  it('F-004.R4 the time under a trim drag may pass the project end, never before 0', () => {
    expect(pointerTime(1500, 100 / S)).toBe(15 * S);
    expect(pointerTime(-20, 100 / S)).toBe(0);
    expect(pointerTime(10, 0)).toBe(0);
  });

  it('RULE-14 a main-track clip’s edge snaps to 0, the playhead, earlier clips and the other lanes, not to what moves with it', () => {
    const targets = trimSnapTargets(p, 'B', 7.5 * S);
    expect(targets).toEqual([0, 1 * S, 3 * S, 4 * S, 5 * S, 7.5 * S, 9 * S]);
    // Later clips and the project end move with B's end (INV-03).
    expect(targets).not.toContain(10 * S);
    expect(targets).not.toContain(12 * S);
  });

  it('RULE-14 an audio clip’s edge snaps to the project end and every clip edge, not to its own edges', () => {
    const targets = trimSnapTargets(p, 'M', 0);
    expect(targets).toEqual([0, 1 * S, 3 * S, 4 * S, 10 * S, 12 * S]);
  });

  it('F-004.AC6 RULE-14 an edge within 8 screen pixels of the playhead snaps to it; farther away it does not', () => {
    const scale = 100 / S; // 100 px per second: 8 px = 0.08 s
    const targets = trimSnapTargets(p, 'A', 2 * S);
    expect(snapTime(2.07 * S, targets, scale)).toBe(2 * S);
    expect(snapTime(1.93 * S, targets, scale)).toBe(2 * S);
    expect(snapTime(2.09 * S, targets, scale)).toBeNull();
    // The nearest target wins.
    expect(snapTime(1_050_000, [1 * S, 1_100_000], scale)).toBe(1 * S);
    expect(snapTime(1_060_000, [1 * S, 1_100_000], scale)).toBe(1_100_000);
  });
});
