// Regression tests for the E1 review (.build-my-app/reports/review-E1.md).
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MIN_SOURCE_DURATION,
  frameStart,
  invariantViolations,
  projectEnd,
  retimeClip,
  type Project,
} from '../../src/core';
import {
  addMedia,
  addMusic,
  addText,
  beginGesture,
  canUndo,
  edit,
  endGesture,
  finishText,
  markExported,
  newProject,
  project,
  setAdjustments,
  setClipOut,
  setFrameRate,
  trimTo,
  unexported,
} from '../../src/project';
import { S, TRACKS, audio, audioSource, proj, video, videoSource } from '../support/project';

let n = 0;
const nextId = () => `id-${++n}`;
const load = (p: Project) => {
  newProject();
  edit(() => ({ project: p, notices: [], changed: [] }));
};
beforeEach(() => {
  newProject();
  n = 0;
});

describe('review E1 fixes', () => {
  it('RULE-03 a shortening trim that would pass the limit by removing a cross-fade is refused with COPY-notice.length_full', () => {
    // A is 6 frames with a 0.1 s cross-fade into B; the project is exactly 600 s.
    const p = proj({ clips: [video('A', 0.2, { crossFadeNext: 0.1 * S }), video('B', 599.9)] });
    expect(projectEnd(p)).toBe(600 * S);
    const r = setClipOut(p, 'A', frameStart(5, 30));
    expect(r.project).toBe(p);
    expect(r.notices).toEqual(['notice.length_full']);
  });

  it('RULE-12 an audio clip of a bundled track never extends past the track’s end', () => {
    const p = proj({ clips: [video('V', 60)] });
    const placed = addMusic(p, 'short', 0, nextId, TRACKS).project;
    const id = placed.audioClips[0]!.id;
    for (const r of [trimTo(placed, id, 'end', 30 * S), trimTo(placed, id, 'end', 30 * S, TRACKS)]) {
      const a = r.project.audioClips[0]!;
      expect(a.out).toBeLessThanOrEqual(5 * S);
      expect(invariantViolations(r.project, TRACKS)).toEqual([]);
    }
    expect(addMusic(p, 'unknown', 0, nextId, TRACKS).project).toBe(p);
  });

  it('RULE-02 a video or audio source shorter than the 0.1 s minimum is refused with COPY-reason.too_short', () => {
    expect(MIN_SOURCE_DURATION).toBe(125_000);
    const r = addMedia(proj(), [videoSource('v', 0.06), audioSource('a', 0.1), videoSource('ok', 0.2)], 0, nextId);
    expect(r.notices).toEqual(['reason.too_short']);
    expect(r.project.sources.map((s) => s.id)).toEqual(['ok']);
    expect(invariantViolations(r.project)).toEqual([]);
  });

  it('RULE-19 an editing session that leaves no undo step does not mark the project unexported', () => {
    load(proj({ clips: [video('A', 10)] }));
    markExported('video');
    beginGesture();
    edit((p) => addText(p, 0, nextId));
    edit((p) => finishText(p, p.textLayers[0]!.id));
    endGesture();
    expect(unexported.value).toBe(false);
  });

  it('RULE-13 a slider dragged away and back to its start value records no step', () => {
    load(proj({ clips: [video('A', 10, { adjustments: { brightness: 10 } })] }));
    const before = project.value;
    beginGesture();
    edit((p) => setAdjustments(p, 'A', { brightness: 30 }));
    edit((p) => setAdjustments(p, 'A', { brightness: 10 }));
    endGesture();
    expect(project.value).toBe(before);
    expect(canUndo.value).toBe(true); // only the load step
  });

  it('RULE-04 RULE-10 a frame-rate change moves audio clip fades to whole frames at the new rate', () => {
    const p = proj({ rate: 25, clips: [video('V', 20)], audioClips: [audio('M', 0, 10, { fadeIn: 120_000 })] });
    const a = setFrameRate(p, 30).project.audioClips[0]!;
    expect(a.fadeIn).toBe(frameStart(4, 30));
  });

  it('RULE-03 RULE-05 RULE-04 a 0.1 s music clip at 60 fps grows to the 0.125 s minimum at 24 fps, or the change is refused when its end is unknown', () => {
    // Property seed 1096329829: add music, 60 fps, trim the music clip's end to 6 frames (0.1 s, the
    // minimum at 60 fps), then 24 fps, whose minimum is 3 frames (0.125 s).
    let p = proj({ rate: 24, clips: [video('V', 3.4)] });
    p = addMusic(p, 'music-1', 7 * S, nextId, TRACKS).project;
    p = setFrameRate(p, 60, TRACKS).project;
    const id = p.audioClips[0]!.id;
    p = trimTo(p, id, 'end', 0, TRACKS).project;
    expect(p.audioClips[0]!.out - p.audioClips[0]!.in).toBe(100_000);
    expect(invariantViolations(p, TRACKS)).toEqual([]);
    // With the catalog the clip grows within its track to the minimum.
    const known = setFrameRate(p, 24, TRACKS).project;
    expect(known.audioClips[0]!.out - known.audioClips[0]!.in).toBe(125_000);
    expect(invariantViolations(known, TRACKS)).toEqual([]);
    // Without it the track's end is unknown, so the clip may not grow: the change is refused.
    const unknown = setFrameRate(p, 24);
    expect(unknown.project).toBe(p);
  });

  it('RULE-04 a clip that cannot reach its minimum within its source at the new rate slows to the fastest step that does', () => {
    // 0.125 s of source at 2.4× is 1.25 frames at 24 fps; 1.2× gives round(2.5) = 3 frames.
    const c = video('A', 0.125, { speedPct: 240 });
    const r = retimeClip(c, 24, 125_000);
    expect(r).toMatchObject({ in: 0, out: 125_000, speedPct: 120 });
  });

  it('INV-03 INV-06 RULE-05 the checker flags a clip past its source, overlapping audio and a negative start', () => {
    const p = proj({ clips: [video('A', 5)], audioClips: [audio('M', 0, 4), audio('N', 3, 6)] });
    const broken: Project = { ...p, clips: [{ ...p.clips[0]!, out: 6 * S }] };
    const v = invariantViolations(broken);
    expect(v).toContain('RULE-05 clip A extends beyond its source');
    expect(v).toContain('INV-06 audio clips overlap');
    const neg: Project = { ...p, textLayers: [{ ...p.audioClips[0]!, content: 'x', end: 1, start: -33_333 } as never] };
    expect(invariantViolations(neg).some((m) => m.startsWith('frame times: text'))).toBe(true);
  });
});
