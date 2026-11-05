// MOD-Project: fades, text layers, audio clips, sound, frame, placement and grade operations.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLACEMENT,
  frameStart,
  invariantViolations,
  projectEnd,
  projectFrames,
  type Project,
} from '../../src/core';
import {
  addMedia,
  addMusic,
  addText,
  allOriginalMuted,
  applyToAll,
  deleteItem,
  duplicateAudio,
  duplicateText,
  editText,
  finishText,
  gradeOf,
  moveAudio,
  moveItemTime,
  muteOriginal,
  pasteGrade,
  resetAdjustment,
  resetAdjustments,
  resetPlacement,
  restackText,
  setAdjustments,
  setCrossFade,
  setFade,
  setFrameRate,
  setLook,
  setMuted,
  setPlacement,
  setTextTimes,
  setVolume,
} from '../../src/project';
import { S, TRACKS, audio, photo, proj, text, video, videoSource } from '../support/project';

const counter = () => {
  let n = 0;
  return () => `new-${++n}`;
};
const ok = (p: Project) => expect(invariantViolations(p, TRACKS)).toEqual([]);
const span = (a: { start: number; in: number; out: number }) => [a.start, a.start + a.out - a.in];

describe('F-009 fades and cross-fades (domain)', () => {
  const ab = () => proj({ clips: [video('A', 5), video('B', 5)] });

  it('F-009.AC2 a 1 s cross-fade between two 5 s clips makes the project 9 s', () => {
    const r = setCrossFade(ab(), 'A', 10);
    expect(r.project.clips[0]!.crossFadeNext).toBe(S);
    expect(projectEnd(r.project)).toBe(9 * S);
  });

  it('F-009.AC3 removing the cross-fade makes the project 10 s again', () => {
    const r = setCrossFade(setCrossFade(ab(), 'A', 10).project, 'A', 0);
    expect(projectEnd(r.project)).toBe(10 * S);
  });

  it('F-009.AC5 a 2 s cross-fade between 1 s and 5 s clips becomes 0.5 s', () => {
    const p = proj({ clips: [video('A', 1), video('B', 5)] });
    expect(setCrossFade(p, 'A', 20).project.clips[0]!.crossFadeNext).toBe(0.5 * S);
  });

  it('F-009.AC6 removing a 1 s cross-fade from a 9 min 59.5 s project is refused with COPY-notice.length_full', () => {
    const p = proj({ clips: [video('A', 300, { crossFadeNext: S }), video('B', 300.5)] });
    expect(projectEnd(p)).toBe(599.5 * S);
    const r = setCrossFade(p, 'A', 0);
    expect(r.project).toBe(p);
    expect(r.notices).toEqual(['notice.length_full']);
  });

  it('F-009.AC8 a cross-fade set to 0.3 s at 25 fps lasts 8 frames', () => {
    const p = proj({ clips: [video('A', 5), video('B', 5)], rate: 25 });
    expect(setCrossFade(p, 'A', 3).project.clips[0]!.crossFadeNext).toBe(frameStart(8, 25));
    expect(setCrossFade(p, 'A', 10).project.clips[0]!.crossFadeNext).toBe(frameStart(25, 25));
  });

  it('RULE-10 fades are 0–3 s and fade in plus fade out never exceed the clip', () => {
    const p = proj({ clips: [video('A', 4)] });
    const r = setFade(p, 'A', 'in', 50);
    expect(r.project.clips[0]!.fadeIn).toBe(3 * S);
    const r2 = setFade(r.project, 'A', 'out', 30);
    expect(r2.project.clips[0]!.fadeOut).toBe(S);
  });

  it('RULE-10 audio clip fades are 0–5 s and together never exceed the clip', () => {
    const p = proj({ clips: [video('V', 20)], audioClips: [audio('M', 0, 8)] });
    const r = setFade(p, 'M', 'out', 60);
    expect(r.project.audioClips[0]!.fadeOut).toBe(5 * S);
    expect(setFade(r.project, 'M', 'in', 50).project.audioClips[0]!.fadeIn).toBe(3 * S);
  });
});

describe('F-010 text (domain)', () => {
  it('F-010.AC1 text added at 2 s in a 10 s project runs 2–5 s, centred at 80 % height, Sans, white, outline', () => {
    const p = proj({ clips: [video('V', 10)] });
    const r = addText(p, 2 * S, counter());
    const r2 = editText(r.project, 'new-1', 'Đà Lạt 2026');
    expect(r2.project.textLayers[0]).toMatchObject({
      start: 2 * S,
      end: 5 * S,
      content: 'Đà Lạt 2026',
      x: 0.5,
      y: 0.8,
      typeface: 'sans',
      colour: 'white',
      style: 'outline',
      align: 'centre',
    });
  });

  it('F-010.AC9 text added in an empty project runs from 0 to 3 s', () => {
    const r = addText(proj(), 0, counter());
    expect(r.project.textLayers[0]).toMatchObject({ start: 0, end: 3 * S });
  });

  it('RULE-11 a 51st text layer is refused with COPY-notice.text_limit', () => {
    const p = proj({ textLayers: Array.from({ length: 50 }, (_, i) => text(`t${i}`, 0, 1)) });
    const r = addText(p, 0, counter());
    expect(r.project).toBe(p);
    expect(r.notices).toEqual(['notice.text_limit']);
  });

  it('F-010.AC4 dragging a 2–5 s layer’s end to 8 s ends it at 8 s', () => {
    const p = proj({ clips: [video('V', 10)], textLayers: [text('T', 2, 5)] });
    expect(setTextTimes(p, 'T', 2 * S, 8 * S).project.textLayers[0]).toMatchObject({ start: 2 * S, end: 8 * S });
  });

  it('F-010.AC7 sending the top of two overlapping layers back puts the other on top', () => {
    const p = proj({ textLayers: [text('A', 0, 3), text('B', 1, 4)] });
    expect(restackText(p, 'B', 'back').project.textLayers.map((t) => t.id)).toEqual(['B', 'A']);
    expect(restackText(p, 'A', 'forward').project.textLayers.map((t) => t.id)).toEqual(['B', 'A']);
  });

  it('F-010.AC8 a layer of only spaces is removed when editing finishes', () => {
    const p = proj({ textLayers: [text('T', 0, 3, { content: '   ' })] });
    expect(finishText(p, 'T').project.textLayers).toEqual([]);
  });

  it('F-010.AC10 COPY-action.time_later moves a selected text layer one frame later', () => {
    const p = proj({ clips: [video('V', 10)], textLayers: [text('T', 2, 5)] });
    const t = moveItemTime(p, 'T', 1).project.textLayers[0]!;
    expect([t.start, t.end]).toEqual([frameStart(61, 30), frameStart(151, 30)]);
  });

  it('F-010.AC12 duplicating a layer and deleting the original leaves one with the same content and times', () => {
    const p = proj({ textLayers: [text('T', 2, 5, { content: 'Hello' }), text('U', 0, 1)] });
    const r = duplicateText(p, 'T', counter());
    expect(r.project.textLayers.map((t) => t.id)).toEqual(['T', 'U', 'new-1']);
    const r2 = deleteItem(r.project, 'T');
    expect(r2.project.textLayers.filter((t) => t.content === 'Hello')).toMatchObject([
      { id: 'new-1', start: 2 * S, end: 5 * S },
    ]);
  });

  it('RULE-11 editing keeps text in NFC within 500 characters', () => {
    const p = proj({ textLayers: [text('T', 0, 3)] });
    const r = editText(p, 'T', 'é'.repeat(600));
    expect(r.project.textLayers[0]!.content).toBe('é'.repeat(500));
  });
});

describe('F-011 music and sound (domain)', () => {
  it('F-011.AC1 a 60 s track added at 3 s in a 20 s project runs from 3 s to 63 s', () => {
    const p = proj({ clips: [video('V', 20)] });
    const r = addMusic(p, 'music-1', 3 * S, counter(), TRACKS);
    expect(span(r.project.audioClips[0]!)).toEqual([3 * S, 63 * S]);
    expect(r.project.audioClips[0]!.sourceId).toBe('music-1');
    expect(r.project.sources).toBe(p.sources);
  });

  it('F-011.AC11 with the playhead at the project end, a new track starts at 0', () => {
    const p = proj({ clips: [video('V', 20)] });
    const r = addMusic(p, 'music-1', 20 * S, counter(), TRACKS);
    expect(r.project.audioClips[0]!.start).toBe(0);
  });

  it('RULE-12 a new audio clip inside another starts at its end and is cut where the next one starts', () => {
    const p = proj({ clips: [video('V', 30)], audioClips: [audio('A', 2, 6), audio('B', 10, 12)] });
    const r = addMusic(p, 'm', 3 * S, counter(), TRACKS);
    expect(span(r.project.audioClips.find((a) => a.id === 'new-1')!)).toEqual([6 * S, 10 * S]);
    ok(r.project);
  });

  it('RULE-12 with no room from the start point a new audio clip is refused with COPY-notice.no_audio_room', () => {
    const p = proj({ clips: [video('V', 30)], audioClips: [audio('A', 2, 6), audio('B', 6.05, 12)] });
    const r = addMusic(p, 'm', 3 * S, counter(), TRACKS);
    expect(r.project.audioClips).toBe(p.audioClips);
    expect(r.notices).toEqual(['notice.no_audio_room']);
  });

  it('F-011.AC2 a 0–5 s clip dragged to 6 s is placed at 3–8 s, the nearest free time where it fits whole', () => {
    const p = proj({ clips: [video('V', 30)], audioClips: [audio('A', 0, 5), audio('B', 8, 12)] });
    const r = moveAudio(p, 'A', 6 * S);
    expect(span(r.project.audioClips.find((a) => a.id === 'A')!)).toEqual([3 * S, 8 * S]);
    ok(r.project);
  });

  it('F-011.AC9 moving 0–5 s to 10 s when 5–30 s is taken in a 30 s project changes nothing', () => {
    const p = proj({ clips: [video('V', 30)], audioClips: [audio('A', 0, 5), audio('B', 5, 30)] });
    const r = moveAudio(p, 'A', 10 * S);
    expect(r.project).toBe(p);
  });

  it('F-011.AC8 COPY-action.time_later moves a lone 4–8 s audio clip one frame later', () => {
    const p = proj({ clips: [video('V', 30)], audioClips: [audio('A', 4, 8)] });
    const a = moveItemTime(p, 'A', 1).project.audioClips[0]!;
    expect(a.start).toBe(frameStart(121, 30));
  });

  it('RULE-12 a duplicated audio clip goes to the nearest free time from the original’s end', () => {
    const p = proj({ clips: [video('V', 30)], audioClips: [audio('A', 0, 5), audio('B', 6, 12)] });
    const r = duplicateAudio(p, 'A', counter());
    expect(span(r.project.audioClips.find((a) => a.id === 'new-1')!)).toEqual([12 * S, 17 * S]);
    ok(r.project);
  });

  it('F-011.AC4 mute original sound mutes every main-track video clip; when all are muted the control unmutes them', () => {
    const p = proj({ clips: [video('A', 2), video('B', 2), photo('P', 2), video('C', 2, { muted: true })] });
    expect(allOriginalMuted(p)).toBe(false);
    const r = muteOriginal(p);
    expect(r.project.clips.filter((c) => c.kind === 'video').every((c) => c.muted)).toBe(true);
    expect(allOriginalMuted(r.project)).toBe(true);
    const r2 = muteOriginal(r.project);
    expect(r2.project.clips.filter((c) => c.kind === 'video').some((c) => c.muted)).toBe(false);
  });

  it('F-011.AC10 muting keeps the volume value and unmuting restores it', () => {
    const p = proj({ clips: [video('A', 2)] });
    const r = setMuted(setVolume(p, 'A', 50).project, 'A', true);
    expect(r.project.clips[0]).toMatchObject({ muted: true, volume: 50 });
    expect(setMuted(r.project, 'A', false).project.clips[0]).toMatchObject({ muted: false, volume: 50 });
  });

  it('RULE-12 volume is 0–200 %', () => {
    const p = proj({ clips: [video('A', 2)], audioClips: [audio('M', 0, 1)] });
    expect(setVolume(p, 'A', 250).project.clips[0]!.volume).toBe(200);
    expect(setVolume(p, 'M', -5).project.audioClips[0]!.volume).toBe(0);
  });
});

describe('F-012 frame (domain)', () => {
  it('F-012.AC2 the first video at 60 fps sets 60 fps while no rate was chosen', () => {
    const r = addMedia(proj(), [videoSource('v', 10, { frameRate: 59.94 })], 0, counter());
    expect(r.project.frame.frameRate).toBe(60);
    const chosen = { ...proj(), frame: { ...proj().frame, frameRateChosen: true } };
    expect(addMedia(chosen, [videoSource('v', 10, { frameRate: 60 })], 0, counter()).project.frame.frameRate).toBe(30);
  });

  it('F-012.AC5 25→24 fps keeps a 3-frame photo at 3 frames and shortens the last clip to stay at 600 s', () => {
    const p = proj({
      rate: 25,
      clips: [photo('P', 0.12), video('V', 599.897)],
    });
    expect(projectFrames(p)).toBe(15_000);
    const r = setFrameRate(p, 24);
    expect(r.project.frame).toMatchObject({ frameRate: 24, frameRateChosen: true });
    expect(r.project.clips[0]!.duration).toBe(125_000);
    expect(projectFrames(r.project)).toBe(14_400);
    expect(projectEnd(r.project)).toBe(600 * S);
    expect(r.notices).toEqual(['notice.length_limited']);
    ok(r.project);
  });

  it('RULE-04 a frame-rate change moves text and audio times to frame starts at the new rate', () => {
    const p = proj({ clips: [video('V', 10)], textLayers: [text('T', 0.1, 1)], audioClips: [audio('M', 0.1, 2)] });
    const r = setFrameRate(p, 24);
    expect(r.project.textLayers[0]).toMatchObject({ start: 83_333, end: S });
    expect(r.project.audioClips[0]!.start).toBe(83_333);
    ok(r.project);
  });
});

describe('F-006 F-007 F-008 placement, adjustments and looks (domain)', () => {
  it('F-006.AC4 reset placement returns Fit, 100 % and centred', () => {
    const p = proj({ clips: [photo('P', 3, { placement: { ...DEFAULT_PLACEMENT, scale: 200, offsetX: 0.2 } })] });
    expect(resetPlacement(p, 'P').project.clips[0]!.placement).toEqual(DEFAULT_PLACEMENT);
  });

  it('F-006.AC5 scale 150 % and two nudges right put the centre 2 % of the width right of centre', () => {
    let p = proj({ clips: [photo('P', 3)] });
    p = setPlacement(p, 'P', { scale: 150 }).project;
    p = setPlacement(p, 'P', { offsetX: p.clips[0]!.placement.offsetX + 0.01 }).project;
    p = setPlacement(p, 'P', { offsetX: p.clips[0]!.placement.offsetX + 0.01 }).project;
    expect(p.clips[0]!.placement.scale).toBe(150);
    expect(p.clips[0]!.placement.offsetX).toBeCloseTo(0.02, 10);
  });

  it('F-007.AC3 resetting Temperature resets only it; Reset all returns every adjustment to default', () => {
    const all = { brightness: 10, contrast: 10, temperature: 30, grain: 5 };
    const p = proj({ clips: [photo('P', 3, { adjustments: all })] });
    const r = resetAdjustment(p, 'P', 'temperature');
    expect(r.project.clips[0]!.adjustments).toEqual({ brightness: 10, contrast: 10, grain: 5 });
    expect(resetAdjustments(r.project, 'P').project.clips[0]!.adjustments).toEqual({});
  });

  it('F-007.AC4 Apply to all copies clip 1’s adjustments and look to clips 2 and 3', () => {
    const look = { id: 'film-warm', intensity: 70 };
    const p = proj({ clips: [photo('A', 3, { adjustments: { brightness: 40 }, look }), video('B', 3), photo('C', 3)] });
    const r = applyToAll(p, 'A');
    for (const c of r.project.clips) expect(gradeOf(c)).toEqual({ adjustments: { brightness: 40 }, look });
    expect(r.changed).toEqual(['B', 'C']);
  });

  it('F-007.AC5 pasting clip 1’s copied adjustments onto clip 3 makes them match', () => {
    const look = { id: 'bw-classic', intensity: 100 };
    const p = proj({
      clips: [photo('A', 3, { adjustments: { saturation: -20 }, look }), video('B', 3), photo('C', 3)],
    });
    const r = pasteGrade(p, 'C', gradeOf(p.clips[0]!));
    expect(gradeOf(r.project.clips[2]!)).toEqual(gradeOf(p.clips[0]!));
  });

  it('RULE-08 adjustments stay within their ranges', () => {
    const p = proj({ clips: [photo('A', 3)] });
    expect(setAdjustments(p, 'A', { brightness: 140, grain: -3, tint: -20.4 }).project.clips[0]!.adjustments).toEqual({
      brightness: 100,
      tint: -20,
    });
  });

  it('F-008.AC4 choosing a look keeps Brightness +30', () => {
    const p = proj({ clips: [photo('A', 3, { adjustments: { brightness: 30 } })] });
    const r = setLook(p, 'A', { id: 'film-warm', intensity: 100 });
    expect(r.project.clips[0]).toMatchObject({
      adjustments: { brightness: 30 },
      look: { id: 'film-warm', intensity: 100 },
    });
  });

  it('F-008.AC5 picking None removes the look', () => {
    const p = proj({ clips: [photo('A', 3, { look: { id: 'film-warm', intensity: 100 } })] });
    expect(setLook(p, 'A', null).project.clips[0]!.look).toBeNull();
  });
});
