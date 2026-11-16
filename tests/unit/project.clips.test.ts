// MOD-Project main-track operations: add, place, remove, reorder, delete, duplicate, trim, split, speed.
import { describe, expect, it } from 'vitest';
import { invariantViolations, layoutOf, projectEnd, projectFrames, type Project } from '../../src/core';
import {
  addMedia,
  deleteItem,
  duplicateClip,
  moveClip,
  placeSource,
  removeSource,
  setClipIn,
  setClipOut,
  setCrossFade,
  setPhotoDuration,
  setSpeed,
  splitAt,
  trimTo,
} from '../../src/project';
import { S, audio, audioSource, ids, photo, photoSource, proj, text, video, videoSource } from '../support/project';

const counter = () => {
  let n = 0;
  return () => `new-${++n}`;
};
const ok = (p: Project) => expect(invariantViolations(p)).toEqual([]);
const startOf = (p: Project, id: string) => layoutOf(p).spans[p.clips.findIndex((c) => c.id === id)]!.startFrame;

describe('F-001 adding media (domain)', () => {
  it('F-001.AC2 videos and a photo go to the end of the main track in order, an MP3 to the audio track at the playhead', () => {
    const p = proj({ clips: [video('A', 10)] });
    const batch = [videoSource('v1', 4), videoSource('v2', 5), photoSource('ph'), audioSource('mp3', 30)];
    const r = addMedia(p, batch, 4 * S, counter());
    expect(r.project.clips.map((c) => c.sourceId)).toEqual(['src-A', 'v1', 'v2', 'ph']);
    expect(r.project.audioClips).toHaveLength(1);
    expect(r.project.audioClips[0]!.start).toBe(4 * S);
    expect(r.project.sources).toHaveLength(5);
    expect(projectEnd(r.project)).toBe(22 * S);
    ok(r.project);
  });

  it('F-001.AC5 a 30 s video added to a 9 min 50 s project is trimmed to its first 10 s with COPY-notice.length_limited', () => {
    const p = proj({ clips: [video('A', 590)] });
    const r = addMedia(p, [videoSource('v', 30)], 0, counter());
    const added = r.project.clips[1]!;
    expect(added.in).toBe(0);
    expect(added.out).toBe(10 * S);
    expect(projectEnd(r.project)).toBe(600 * S);
    expect(r.notices).toContain('notice.length_limited');
  });

  it('RULE-03 media is refused with COPY-notice.length_full when less than the minimum length fits, but kept as a source', () => {
    const p = proj({ clips: [video('A', 600)] });
    const r = addMedia(p, [videoSource('v', 30)], 0, counter());
    expect(r.project.clips).toHaveLength(1);
    expect(r.project.sources.map((s) => s.id)).toContain('v');
    expect(r.notices).toContain('notice.length_full');
    // 2 frames of room at 30 fps: one frame fits, but the 0.1 s minimum (3 frames) does not.
    const q = proj({ clips: [video('A', 17_998 / 30)] });
    expect(projectFrames(q)).toBe(17_998);
    const s = addMedia(q, [videoSource('w', 30), photoSource('ph')], 0, counter());
    expect(s.project.clips).toHaveLength(1);
    expect(s.notices).toContain('notice.length_full');
    // 3 frames of room: the minimum fits, so the clip is placed with COPY-notice.length_limited.
    const t = addMedia(proj({ clips: [video('A', 17_997 / 30)] }), [videoSource('w', 30)], 0, counter());
    expect(t.project.clips).toHaveLength(2);
    expect(projectFrames(t.project)).toBe(18_000);
    expect(t.notices).toEqual(['notice.length_limited']);
  });

  it('RULE-05 a photo is added with the default 3 s duration', () => {
    const r = addMedia(proj(), [photoSource('ph')], 0, counter());
    expect(r.project.clips[0]!.duration).toBe(3 * S);
  });

  it('F-001.AC11 an MP3 of 2 minutes in an empty project is placed from 0 to 2 min, past the project end', () => {
    const r = addMedia(proj(), [audioSource('mp3', 120)], 0, counter());
    expect(r.project.clips).toHaveLength(0);
    const a = r.project.audioClips[0]!;
    expect([a.start, a.start + a.out - a.in]).toEqual([0, 120 * S]);
  });

  it('F-001.AC14 placing a source again adds a new clip of the whole source at the end', () => {
    const p = proj({ clips: [video('A', 10), video('B', 5)] });
    const r = placeSource(p, 'src-A', 0, counter());
    expect(ids(r.project)).toEqual(['A', 'B', 'new-1']);
    expect(r.project.clips[2]).toMatchObject({ sourceId: 'src-A', in: 0, out: 10 * S });
  });

  it('F-001.AC6 removing a source removes both of its clips and the main track has no gaps', () => {
    const p = proj({ clips: [video('A', 10), video('B', 5), { ...video('A2', 4), sourceId: 'src-A' }] });
    const r = removeSource(p, 'src-A');
    expect(ids(r.project)).toEqual(['B']);
    expect(projectEnd(r.project)).toBe(5 * S);
    expect(r.project.sources.map((s) => s.id)).toEqual(['src-B']);
    ok(r.project);
  });

  it('RULE-02 a source beyond the 100th is refused with COPY-reason.too_many', () => {
    const sources = Array.from({ length: 100 }, (_, i) => photoSource(`p${i}`));
    const r = addMedia(proj({ sources }), [photoSource('extra')], 0, counter());
    expect(r.project.sources).toHaveLength(100);
    expect(r.notices).toContain('reason.too_many');
  });
});

describe('F-003 arrange clips (domain)', () => {
  const abc = () => proj({ clips: [video('A', 4), video('B', 5), video('C', 6)] });

  it('F-003.AC1 moving C to the start gives C, A, B with no gaps', () => {
    const r = moveClip(abc(), 'C', 0);
    expect(ids(r.project)).toEqual(['C', 'A', 'B']);
    expect(layoutOf(r.project).spans.map((s) => s.startFrame)).toEqual([0, 180, 300]);
    ok(r.project);
  });

  it('F-003.AC2 deleting B leaves A and C adjacent and the project shorter by B', () => {
    const p = abc();
    const r = deleteItem(p, 'B');
    expect(ids(r.project)).toEqual(['A', 'C']);
    expect(projectEnd(p) - projectEnd(r.project)).toBe(5 * S);
  });

  it('F-003.AC3 a duplicate keeps the look and speed and follows the original', () => {
    const p = proj({
      clips: [video('A', 10, { speedPct: 200, look: { id: 'film-warm', intensity: 80 } }), video('B', 3)],
    });
    const r = duplicateClip(p, 'A', counter());
    expect(ids(r.project)).toEqual(['A', 'new-1', 'B']);
    expect(r.project.clips[1]).toMatchObject({ speedPct: 200, look: { id: 'film-warm', intensity: 80 } });
  });

  it('F-003.AC4 moving B after C removes the A–B cross-fade', () => {
    const p = proj({ clips: [video('A', 4, { crossFadeNext: 500_000 }), video('B', 5), video('C', 6)] });
    const r = moveClip(p, 'B', 2);
    expect(ids(r.project)).toEqual(['A', 'C', 'B']);
    expect(r.project.clips[0]!.crossFadeNext).toBe(0);
    ok(r.project);
  });

  it('RULE-05 a cross-fade stays when the same two clips stay adjacent in the same order', () => {
    const p = proj({ clips: [video('A', 4, { crossFadeNext: 500_000 }), video('B', 5), video('C', 6)] });
    const r = moveClip(p, 'C', 0);
    expect(ids(r.project)).toEqual(['C', 'A', 'B']);
    expect(r.project.clips[1]!.crossFadeNext).toBe(500_000);
  });

  it('F-003.AC6 deleting B between cross-fades A–B and B–C leaves A and C with no cross-fade', () => {
    const p = proj({
      clips: [video('A', 4, { crossFadeNext: 500_000 }), video('B', 5, { crossFadeNext: 500_000 }), video('C', 6)],
    });
    const r = deleteItem(p, 'B');
    expect(ids(r.project)).toEqual(['A', 'C']);
    expect(r.project.clips[0]!.crossFadeNext).toBe(0);
    ok(r.project);
  });

  it('F-003.AC7 duplicating A (cross-fading into B) gives A, A′, B with only A′ cross-fading into B', () => {
    const p = proj({ clips: [video('A', 4, { crossFadeNext: 500_000 }), video('B', 5)] });
    const r = duplicateClip(p, 'A', counter());
    expect(ids(r.project)).toEqual(['A', 'new-1', 'B']);
    expect(r.project.clips.map((c) => c.crossFadeNext)).toEqual([0, 500_000, 0]);
    ok(r.project);
  });

  it('F-003.AC8 RULE-03 a reorder that would remove the only 1 s cross-fade of a 9 min 59.5 s project is refused with COPY-notice.length_full', () => {
    // 9 min 59.5 s with one 1 s cross-fade: removing it would make 600.5 s.
    const p = proj({ clips: [video('A', 300, { crossFadeNext: S }), video('B', 200), video('C', 100.5)] });
    expect(projectEnd(p)).toBe(599.5 * S);
    const r = moveClip(p, 'B', 0);
    expect(r.project).toBe(p);
    expect(r.notices).toEqual(['notice.length_full']);
  });

  it('RULE-03 a duplicate near the limit is shortened at its end, or refused when nothing fits', () => {
    const p = proj({ clips: [video('A', 590), video('B', 5)] });
    const r = duplicateClip(p, 'B', counter());
    expect(r.project.clips[2]!.out).toBe(5 * S);
    const q = proj({ clips: [video('A', 590), video('B', 8)] });
    const s = duplicateClip(q, 'B', counter());
    expect(projectEnd(s.project)).toBe(600 * S);
    expect(s.project.clips[2]!.out).toBe(2 * S);
    expect(s.notices).toEqual(['notice.length_limited']);
    const full = proj({ clips: [video('A', 595), video('B', 5)] });
    expect(duplicateClip(full, 'B', counter()).notices).toEqual(['notice.length_full']);
  });

  it('RULE-03 a duplicate is refused when less than the minimum length fits', () => {
    // 2 frames of room at 30 fps, below the 3-frame minimum.
    const p = proj({ clips: [video('A', 590), video('B', (17_998 - 17_700) / 30)] });
    expect(projectFrames(p)).toBe(17_998);
    const r = duplicateClip(p, 'B', counter());
    expect(r.project).toBe(p);
    expect(r.notices).toEqual(['notice.length_full']);
  });
});

describe('F-004 trim and split (domain)', () => {
  it('F-004.AC1 trimming a 20 s clip’s start by 5 s makes it 15 s from source 5 s and moves the next clip 5 s earlier', () => {
    const p = proj({ clips: [video('A', 20), video('B', 5)] });
    const r = setClipIn(p, 'A', 5 * S);
    expect(r.project.clips[0]).toMatchObject({ in: 5 * S, out: 20 * S });
    expect(startOf(r.project, 'B')).toBe(15 * 30);
  });

  it('F-004.AC2 a clip at its source end does not grow when its end is dragged further', () => {
    const p = proj({ clips: [video('A', 20), video('B', 5)] });
    const r = setClipOut(p, 'A', 25 * S);
    expect(r.project).toBe(p);
    expect(trimTo(p, 'A', 'end', 22 * S).project).toBe(p);
  });

  it('F-004.AC3 splitting a 10 s clip at 4 s gives 4 s and 6 s halves with the same settings, fades split per RULE-05', () => {
    const look = { id: 'film-warm', intensity: 50 };
    const p = proj({
      clips: [
        video('A', 10, { fadeIn: S, fadeOut: S, crossFadeNext: S, look, adjustments: { brightness: 20 }, volume: 80 }),
        video('B', 10),
      ],
    });
    const r = splitAt(p, 'A', 4 * S, counter());
    expect(ids(r.project)).toEqual(['A', 'new-1', 'B']);
    const [a1, a2] = r.project.clips;
    expect(
      layoutOf(r.project)
        .spans.slice(0, 2)
        .map((s) => s.frames),
    ).toEqual([120, 180]);
    expect(a1).toMatchObject({ fadeIn: S, fadeOut: 0, crossFadeNext: 0, look, volume: 80, in: 0, out: 4 * S });
    expect(a2).toMatchObject({ fadeIn: 0, fadeOut: S, crossFadeNext: S, look, volume: 80, in: 4 * S, out: 10 * S });
    expect(a2!.adjustments).toEqual({ brightness: 20 });
    ok(r.project);
  });

  it('F-004.AC4 a split 2 frames from a clip’s start changes nothing and shows COPY-notice.split_too_close', () => {
    const p = proj({ clips: [video('A', 10)] });
    const r = splitAt(p, 'A', 66_666, counter());
    expect(r.project).toBe(p);
    expect(r.notices).toEqual(['notice.split_too_close']);
  });

  it('RULE-05 a split inside a cross-fade removes that cross-fade', () => {
    const p = proj({ clips: [video('A', 10, { crossFadeNext: S }), video('B', 10)] });
    const r = splitAt(p, 'B', 9.5 * S, counter());
    expect(r.project.clips[0]!.crossFadeNext).toBe(0);
    ok(r.project);
  });

  it('F-004.AC5 trimming an audio clip’s start leaves a gap; splitting a text layer gives two layers', () => {
    const p = proj({ clips: [video('V', 20)], audioClips: [audio('M', 2, 10)], textLayers: [text('T', 1, 5)] });
    const r1 = trimTo(p, 'M', 'start', 4 * S);
    const a = r1.project.audioClips[0]!;
    expect([a.start, a.start + a.out - a.in, a.in]).toEqual([4 * S, 10 * S, 2 * S]);
    const r2 = splitAt(r1.project, 'T', 3 * S, counter());
    expect(r2.project.textLayers.map((t) => [t.start, t.end])).toEqual([
      [1 * S, 3 * S],
      [3 * S, 5 * S],
    ]);
  });

  it('F-004.AC9 a 1.5 s cross-fade shrinks to 1 s when its 4 s clip is trimmed to 2 s, and goes at 5 frames', () => {
    const p = proj({ clips: [video('A', 4, { crossFadeNext: 1.5 * S }), video('B', 10)] });
    const r = setClipOut(p, 'A', 2 * S);
    expect(r.project.clips[0]!.crossFadeNext).toBe(S);
    const r2 = setClipOut(p, 'A', 166_667);
    expect(r2.project.clips[0]!.crossFadeNext).toBe(0);
    ok(r.project);
    ok(r2.project);
  });

  it('RULE-10 fade in and fade out shrink in proportion when the clip gets shorter', () => {
    const p = proj({ clips: [video('A', 6, { fadeIn: 3 * S, fadeOut: S })] });
    const r = setClipOut(p, 'A', 2 * S);
    expect(r.project.clips[0]).toMatchObject({ fadeIn: 1.5 * S, fadeOut: 0.5 * S });
  });

  it('F-004.AC10 trimming A’s start leaves text and audio at their fixed times', () => {
    const p = proj({
      clips: [video('A', 5), video('B', 10)],
      textLayers: [text('T', 6, 8)],
      audioClips: [audio('M', 6, 10)],
    });
    const r = setClipIn(p, 'A', 2 * S);
    expect(r.project.textLayers).toBe(p.textLayers);
    expect(r.project.audioClips).toBe(p.audioClips);
    expect(projectEnd(r.project)).toBe(13 * S);
  });

  it('RULE-05 a trim never takes a clip below 0.1 s and a photo stays within 0.1–60 s', () => {
    const p = proj({ clips: [video('A', 10), photo('P', 3)] });
    expect(projectFrames(setClipOut(p, 'A', 10).project)).toBe(3 + 90);
    expect(setPhotoDuration(p, 'P', 90 * S).project.clips[1]!.duration).toBe(60 * S);
    expect(setPhotoDuration(p, 'P', 0).project.clips[1]!.duration).toBe(0.1 * S);
  });

  it('RULE-03 a trim stops at the 10-minute limit with COPY-notice.length_limited', () => {
    const p = proj({ clips: [video('A', 580), video('B', 30, {}, 20)] });
    const r = setClipIn(p, 'B', 0);
    expect(r.project.clips[1]!.in).toBe(10 * S);
    expect(r.notices).toEqual(['notice.length_limited']);
  });

  it('RULE-05 F-004 edge case: a split inside the clip’s own cross-fade into the next removes that cross-fade', () => {
    const p = proj({ clips: [video('A', 10, { crossFadeNext: S }), video('B', 10)] });
    const r = splitAt(p, 'A', 9.5 * S, counter());
    expect(ids(r.project)).toEqual(['A', 'new-1', 'B']);
    expect(r.project.clips.map((c) => c.crossFadeNext)).toEqual([0, 0, 0]);
    ok(r.project);
  });

  it('F-004.R1 RULE-06 trimming a 2× clip maps timeline time to source time through its speed', () => {
    const p = proj({ clips: [video('A', 20, { speedPct: 200 }), video('B', 5)] });
    expect(layoutOf(p).spans[0]!.frames).toBe(300);
    // 2 s of timeline at its start is 4 s of source.
    const r = trimTo(p, 'A', 'start', 2 * S);
    expect(r.project.clips[0]).toMatchObject({ in: 4 * S, out: 20 * S });
    expect(layoutOf(r.project).spans[0]!.frames).toBe(240);
    // Its end at 6 s of timeline: 12 s of source after the in point.
    const r2 = trimTo(r.project, 'A', 'end', 6 * S);
    expect(r2.project.clips[0]).toMatchObject({ in: 4 * S, out: 16 * S });
    // Dragged back before its start: the head returns, the in point stops at 0.
    expect(trimTo(r2.project, 'A', 'start', -5 * S).project.clips[0]).toMatchObject({ in: 0, out: 16 * S });
  });

  it('RULE-05 F-004 edge case: a photo’s trim keeps its duration within 0.1–60 s, at either edge', () => {
    const p = proj({ clips: [photo('P', 3), video('B', 5)] });
    expect(trimTo(p, 'P', 'end', 100 * S).project.clips[0]!.duration).toBe(60 * S);
    expect(trimTo(p, 'P', 'end', 0).project.clips[0]!.duration).toBe(0.1 * S);
    expect(trimTo(p, 'P', 'start', 2 * S).project.clips[0]!.duration).toBe(1 * S);
    // Its start dragged before itself (and before 0) makes it longer, up to 60 s.
    expect(trimTo(p, 'P', 'start', -2 * S).project.clips[0]!.duration).toBe(5 * S);
    expect(trimTo(p, 'P', 'start', -100 * S).project.clips[0]!.duration).toBe(60 * S);
    expect(trimTo(p, 'P', 'start', 3 * S).project.clips[0]!.duration).toBe(0.1 * S);
  });

  it('RULE-10 F-004 trimming the start of a clip with an incoming cross-fade keeps it while it fits, then shrinks it to half the clip', () => {
    const p = proj({ clips: [video('A', 4, { crossFadeNext: S }), video('B', 4)] });
    expect(startOf(p, 'B')).toBe(90);
    // 1 s off B's start: 3 s left, the 1 s cross-fade still fits (≤ half of 3 s).
    const r = trimTo(p, 'B', 'start', 4 * S);
    expect(r.project.clips[1]).toMatchObject({ in: S });
    expect(r.project.clips[0]!.crossFadeNext).toBe(S);
    expect(startOf(r.project, 'B')).toBe(90);
    // 3.5 s off: B is 15 frames, the cross-fade shrinks to half of it (7 frames).
    const r2 = trimTo(p, 'B', 'start', 6.5 * S);
    expect(layoutOf(r2.project).spans[1]!.frames).toBe(15);
    expect(r2.project.clips[0]!.crossFadeNext).toBe(233_333);
    ok(r.project);
    ok(r2.project);
  });

  it('RULE-05 set start/end here trims the selected clip at the playhead', () => {
    const p = proj({ clips: [video('A', 10), video('B', 5)] });
    const r = trimTo(p, 'A', 'start', 2 * S);
    expect(r.project.clips[0]).toMatchObject({ in: 2 * S, out: 10 * S });
    const r2 = trimTo(r.project, 'A', 'end', 5 * S);
    expect(r2.project.clips[0]).toMatchObject({ in: 2 * S, out: 7 * S });
  });
});

describe('F-005 speed (domain)', () => {
  it('F-005.AC1 a 10 s clip at 2× lasts 5 s and later clips move 5 s earlier', () => {
    const p = proj({ clips: [video('A', 10), video('B', 5)] });
    const r = setSpeed(p, 'A', 200);
    expect(layoutOf(r.project).spans.map((s) => s.startFrame)).toEqual([0, 150]);
  });

  it('F-005.AC3 0.25× on a 60 s clip in a 9 min 30 s project stops at 0.70× (85.7 s, project 9 min 55.7 s) with COPY-notice.length_limited', () => {
    const p = proj({ clips: [video('A', 510), video('B', 60)] });
    const r = setSpeed(p, 'B', 25);
    expect(r.project.clips[1]!.speedPct).toBe(70);
    expect(layoutOf(r.project).spans[1]!.frames).toBe(2571);
    expect(projectFrames(r.project)).toBe(17_871);
    expect(r.notices).toEqual(['notice.length_limited']);
  });

  it('F-005.AC4 RULE-06 4× on a 0.2 s clip stops at 2.40× (3 frames) with COPY-notice.speed_limited', () => {
    // 6 frames of source: round(6 ÷ speed) must stay ≥ 3 frames, so 2.4× is the fastest step.
    const p = proj({ clips: [video('A', 0.2)] });
    const r = setSpeed(p, 'A', 400);
    expect(r.project.clips[0]!.speedPct).toBe(240);
    expect(layoutOf(r.project).spans[0]!.frames).toBe(3);
    expect(r.notices).toEqual(['notice.speed_limited']);
  });

  it('RULE-06 a speed increase already at the fastest allowed step changes nothing but still says why', () => {
    const p = proj({ clips: [video('A', 0.2, { speedPct: 240 })] });
    const r = setSpeed(p, 'A', 300);
    expect(r.project).toBe(p);
    expect(r.notices).toEqual(['notice.speed_limited']);
  });

  it('RULE-06 a speed increase within the minimum shows no notice', () => {
    const r = setSpeed(proj({ clips: [video('A', 10)] }), 'A', 200);
    expect(r.notices).toEqual([]);
  });

  it('RULE-06 speed snaps to 0.05× steps within 0.25×–4×', () => {
    const p = proj({ clips: [video('A', 10)] });
    expect(setSpeed(p, 'A', 133).project.clips[0]!.speedPct).toBe(135);
    expect(setSpeed(p, 'A', 900).project.clips[0]!.speedPct).toBe(400);
  });

  it('RULE-10 a faster clip’s cross-fade shrinks to half its new length', () => {
    const p = proj({ clips: [video('A', 4, { crossFadeNext: 2 * S }), video('B', 10)] });
    const r = setSpeed(p, 'A', 200);
    expect(r.project.clips[0]!.crossFadeNext).toBe(S);
  });

  it('F-005 edge case RULE-10 a faster clip’s fade in and fade out shrink in proportion to fit its new length', () => {
    const p = proj({ clips: [video('A', 4, { fadeIn: 3 * S, fadeOut: S })] });
    const r = setSpeed(p, 'A', 400);
    // 1 s = 30 frames; the fades (90 + 30 frames) shrink 3 : 1 to 22 + 7 frames.
    expect(r.project.clips[0]).toMatchObject({ fadeIn: Math.floor((22 * S) / 30), fadeOut: Math.floor((7 * S) / 30) });
  });

  it('F-005 edge case RULE-10 a cross-fade into a faster clip shrinks to half of it as well', () => {
    const p = proj({ clips: [video('A', 10, { crossFadeNext: 2 * S }), video('B', 4)] });
    const r = setSpeed(p, 'B', 400);
    expect(r.project.clips[0]!.crossFadeNext).toBe(0.5 * S);
  });

  it('RULE-10 cross-fades cannot be shortened past the limit either', () => {
    const p = proj({ clips: [video('A', 300, { crossFadeNext: S }), video('B', 300.8)] });
    expect(setCrossFade(p, 'A', 5).notices).toEqual(['notice.length_full']);
  });
});
