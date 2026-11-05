// MOD-Engine pure scheduling rules (ADR-0009 outcome rules 1–6): frame choice by the index's
// presentation time, slow-playback fallback, eviction, restart decision, decoder slot assignment.
import { describe, expect, it } from 'vitest';
import {
  assignSlots,
  evictionIndex,
  isLeadingPicture,
  needsRestart,
  newestAtOrBefore,
  pickFrame,
  wantsFeed,
  type DecoderState,
} from '../../src/engine';

const f = (...ts: number[]) => ts.map((timestamp) => ({ timestamp }));

describe('ADR-0009 frame choice', () => {
  it('MOD-Engine the frame chosen is the one the index presents at the source time (±2 µs)', () => {
    const frames = f(0, 33_333, 66_666, 100_000);
    expect(pickFrame(frames, 66_666)?.timestamp).toBe(66_666);
    expect(pickFrame(frames, 66_668)?.timestamp).toBe(66_666);
    expect(pickFrame(frames, 66_669)).toBeNull();
    expect(pickFrame(frames, 50_000)).toBeNull(); // not a presentation time: never guessed from durations
  });

  it('MOD-Engine a negative wanted time (edit list) gives the first frame at or after 0', () => {
    expect(pickFrame(f(-20_000, 13_333, 46_666), -20_000)?.timestamp).toBe(13_333);
  });

  it('RULE-22 a slow source shows the newest decoded frame at or before the target', () => {
    expect(newestAtOrBefore(f(0, 33_333, 66_666), 90_000)?.timestamp).toBe(66_666);
    expect(newestAtOrBefore(f(100_000), 50_000)?.timestamp).toBe(100_000);
    expect(newestAtOrBefore([], 1)).toBeNull();
  });

  it('MOD-Engine eviction drops a frame wholly behind the target first, else the farthest ahead, never the pinned one', () => {
    const frames = f(0, 10, 20, 30);
    expect(evictionIndex(frames, 25, null)).toBe(0);
    expect(evictionIndex(frames, 5, null)).toBe(3);
    expect(evictionIndex(frames, 25, frames[0]!)).toBe(1);
    expect(evictionIndex(frames, 5, frames[3]!)).toBe(2);
  });

  it('MOD-Engine open-GOP leading pictures are those presented before the restart keyframe', () => {
    expect(isLeadingPicture(990_000, 1_000_000)).toBe(true);
    expect(isLeadingPicture(1_033_333, 1_000_000)).toBe(false);
  });

  it('MOD-Engine the feed keeps 12 frames ahead of the target with a bounded decode queue', () => {
    expect(wantsFeed(0, 0, 33_333, 0)).toBe(true);
    expect(wantsFeed(12 * 33_333, 0, 33_333, 0)).toBe(false);
    expect(wantsFeed(0, 0, 33_333, 16)).toBe(false);
  });
});

describe('ADR-0009 outcome rules 4 and 6: restart or decode forward', () => {
  const ok: DecoderState = {
    configured: true,
    needKey: false,
    lastFedTs: 1_000_000,
    maxOutTs: 900_000,
    hasNext: true,
    nextTs: 1_033_333,
  };

  it('MOD-Engine a fresh or flushed decoder restarts at the keyframe', () => {
    expect(needsRestart({ ...ok, configured: false }, 500_000, 0, 'exact')).toBe(true);
    expect(needsRestart({ ...ok, needKey: true }, 950_000, 0, 'play')).toBe(true);
  });

  it('MOD-Engine going back before what was output restarts', () => {
    expect(needsRestart(ok, 800_000, 0, 'exact')).toBe(true);
    expect(needsRestart(ok, 800_000, 0, 'play')).toBe(true);
  });

  it('MOD-Engine a seek whose keyframe lies past the next packet restarts; within reach it decodes forward', () => {
    expect(needsRestart(ok, 3_000_000, 2_000_000, 'exact')).toBe(true);
    expect(needsRestart(ok, 1_100_000, 0, 'exact')).toBe(false);
    // The next packet is the target's keyframe: decoding on reaches it without a restart.
    expect(needsRestart({ ...ok, nextTs: 2_000_000 }, 2_100_000, 2_000_000, 'exact')).toBe(false);
  });

  it('RULE-22 while playing, a target still ahead of the decoder never restarts at a keyframe', () => {
    expect(needsRestart(ok, 3_000_000, 2_000_000, 'play')).toBe(false);
  });

  it('MOD-Engine past the last packet a seek beyond what was fed restarts', () => {
    expect(needsRestart({ ...ok, hasNext: false }, 1_200_000, 0, 'exact')).toBe(true);
  });
});

describe('ADR-0009 outcome rule 5: decoder slots', () => {
  it('MOD-Engine a slot bound to the source is reused; new slots are made up to the cap', () => {
    expect(assignSlots(['a', 'b'], [1, 2], ['b'], 4)).toEqual([1]);
    expect(assignSlots(['a'], [1], ['a', 'c'], 4)).toEqual([0, 1]);
  });

  it('MOD-Engine at the cap the least recently used slot not needed now is rebound', () => {
    expect(assignSlots(['a', 'b', 'c'], [5, 1, 9], ['d'], 3)).toEqual([1]);
    expect(assignSlots(['a', 'b', 'c'], [5, 1, 9], ['b', 'd'], 3)).toEqual([1, 0]);
  });

  it('MOD-Engine a cross-fade between two clips of one source gets two slots', () => {
    const r = assignSlots(['a'], [1], ['a', 'a'], 3);
    expect(new Set(r).size).toBe(2);
  });
});
