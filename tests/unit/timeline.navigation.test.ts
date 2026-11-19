// MOD-Timeline navigation maths (F-013, pure): RULE-14's zoom range (from the whole project to one frame
// being at least 12 screen pixels), the zoom steps, the scroll that keeps a time under a point (zoom anchors,
// the touch pinch), following the playhead during playback, the ruler at frame zoom and windowed to the
// view, and RULE-14 snapping of a moved item's start or end and of the scrubbed playhead.
import { describe, expect, it } from 'vitest';
import { RULE_14 } from '../../src/core';
import {
  anchoredScroll,
  centredFit,
  clampScale,
  fitScale,
  followScroll,
  framePx,
  maxScale,
  moveSnap,
  playheadSnapTargets,
  rulerTicks,
  scrollTimeAt,
  zoomRange,
  zoomedScale,
} from '../../src/timeline/geometry';
import { S, audio, photo, proj } from '../support/project';

const MIN = 60 * S;

describe('RULE-14 zoom range', () => {
  it('RULE-14 F-013.AC1 zoomed in fully, one frame of a 5-minute project is at least 12 screen pixels wide', () => {
    for (const rate of [24, 25, 30, 60] as const) {
      const fit = fitScale(1200, 5 * MIN);
      const range = zoomRange(fit, rate);
      expect(range.min).toBe(fit);
      expect(framePx(range.max, rate)).toBeGreaterThanOrEqual(RULE_14.minFramePx);
      expect(framePx(range.max, rate)).toBeCloseTo(RULE_14.minFramePx, 6);
      // F-013.AC1 fit: the whole project in the view.
      expect(range.min * 5 * MIN).toBeCloseTo(1200, 6);
    }
  });

  it('RULE-14 a project whose fit already shows frames 12 px wide has no room to zoom in', () => {
    const fit = fitScale(1200, 1 * S);
    const range = zoomRange(fit, 30);
    expect(range.max).toBe(fit);
    expect(zoomedScale(fit, 1, range)).toBe(fit);
  });

  it('RULE-14 zoom steps double or halve the scale and stop at the range ends', () => {
    const range = zoomRange(fitScale(1000, 5 * MIN), 30);
    const twice = zoomedScale(range.min, 1, range);
    expect(twice).toBeCloseTo(range.min * 2, 12);
    expect(zoomedScale(twice, -1, range)).toBeCloseTo(range.min, 12);
    expect(zoomedScale(range.min, -1, range)).toBe(range.min);
    let s = range.min;
    for (let i = 0; i < 20; i++) s = zoomedScale(s, 1, range);
    expect(s).toBe(range.max);
    expect(clampScale(range.max * 3, range)).toBe(range.max);
    expect(clampScale(range.min / 3, range)).toBe(range.min);
    // A step that lands within a hair of an end goes to it (no 0.99999 × fit left over).
    expect(zoomedScale(range.min * 2.0000001, -1, range)).toBe(range.min);
  });

  it('RULE-14 D-013 on touch fit puts the whole project in half the view, so it shows wherever the playhead is', () => {
    expect(centredFit(400, 10 * S) * 10 * S).toBeCloseTo(200, 9);
    expect(centredFit(400, 0)).toBeGreaterThan(0);
  });
});

describe('F-013 scrolling', () => {
  it('F-013.R1 F-013.AC4 a zoom anchored at a view point keeps the time under it in place', () => {
    const pad = 2;
    const before = 0.0001; // px/µs
    const scroll = 500;
    const x = 300; // view x of the anchor
    const t = scrollTimeAt(x, scroll, pad, before);
    expect(pad + t * before - scroll).toBeCloseTo(x, 6);
    const after = before * 3;
    const next = anchoredScroll(t, x, pad, after);
    expect(pad + t * after - next).toBeCloseTo(x, 6);
  });

  it('F-013.R2 F-013.AC2 while following, the view turns a page when the playhead reaches its edge; inside it does nothing', () => {
    const view = 1000;
    // Playhead well inside: no change.
    expect(followScroll(500, 0, view)).toBeNull();
    // At the right edge: the view scrolls so the playhead is back near its left side, still visible.
    const next = followScroll(995, 0, view)!;
    expect(next).toBeGreaterThan(0);
    expect(995 - next).toBeGreaterThanOrEqual(0);
    expect(995 - next).toBeLessThan(view / 2);
    // Behind the view (a jump back): shown again.
    const back = followScroll(100, 2000, view)!;
    expect(100 - back).toBeGreaterThanOrEqual(0);
    expect(100 - back).toBeLessThan(view);
  });
});

describe('F-013 ruler at zoom', () => {
  it('CMP-Timeline "frames" at frame zoom the ruler labels each second and numbers frames between', () => {
    const scale = (RULE_14.minFramePx * 30) / S; // 12 px per frame at 30 fps
    const ticks = rulerTicks(10 * S, scale, 56, { from: 2 * S, to: 4 * S, rate: 30 });
    expect(ticks.step).toBe(S);
    expect(ticks.labels).toEqual([2 * S, 3 * S, 4 * S]);
    expect(ticks.frames.length).toBeGreaterThan(0);
    // Frame numbers sit between seconds and are at least two characters apart.
    for (const f of ticks.frames) {
      expect(f.n % 30).not.toBe(0);
      expect(f.n).toBeGreaterThan(0);
    }
    const gaps = ticks.frames.slice(1).map((f, i) => (f.at - ticks.frames[i]!.at) * scale);
    expect(Math.min(...gaps.filter((g) => g > 0))).toBeGreaterThanOrEqual(20);
  });

  it('NFR-03 the ruler only makes ticks near the view: a 10-minute project at frame zoom stays small', () => {
    const scale = (RULE_14.minFramePx * 60) / S;
    const ticks = rulerTicks(10 * MIN, scale, 56, { from: 300 * S, to: 304 * S, rate: 60 });
    expect(ticks.labels.length + ticks.minor.length + ticks.frames.length).toBeLessThan(1000);
    expect(ticks.labels[0]).toBe(300 * S);
  });

  it('CMP-Timeline at the fit zoom no frame numbers show', () => {
    const ticks = rulerTicks(60 * S, fitScale(600, 60 * S), 56, { from: 0, to: 60 * S, rate: 30 });
    expect(ticks.frames).toEqual([]);
  });
});

describe('RULE-14 snapping of moves and the playhead', () => {
  it('RULE-14 F-013.R3 a moved item snaps by its start or its end, whichever target is nearer', () => {
    const scale = 100 / S; // 100 px per second
    const targets = [0, 5 * S, 9 * S];
    // Start 5.05 s (5 px from 5 s): snaps by the start.
    expect(moveSnap(5_050_000, 7_050_000, targets, scale)).toEqual({ delta: -50_000, at: 5 * S });
    // End 8.94 s (6 px from 9 s), start 6.94 s (nothing near): snaps by the end.
    const byEnd = moveSnap(6_940_000, 8_940_000, targets, scale)!;
    expect(byEnd.at).toBe(9 * S);
    expect(byEnd.delta).toBe(60_000);
    // Nothing within 8 px: no snap.
    expect(moveSnap(6 * S, 7 * S, targets, scale)).toBeNull();
  });

  it('RULE-14 the scrubbed playhead snaps to 0, the project end and the items’ starts and ends', () => {
    const p = proj({
      clips: [photo('a', 4), photo('b', 6)],
      audioClips: [audio('m', 1, 3.5)],
    });
    const targets = playheadSnapTargets(p);
    expect(targets).toEqual(expect.arrayContaining([0, 4 * S, 10 * S, 1 * S, 3.5 * S]));
    expect(targets).toEqual([...new Set(targets)].sort((a, b) => a - b));
  });
});
