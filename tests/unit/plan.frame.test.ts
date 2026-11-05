// MOD-Plan: the frame and sound recipe at a project time (INV-02, INV-07).
import { describe, expect, it } from 'vitest';
import { frameStart } from '../../src/core';
import { SAMPLE_RATE, audioPlan, framePlan, voiceGain, voiceSourceTime } from '../../src/plan';
import { S, audio, photo, proj, text, video } from '../support/project';

const at = (seconds: number) => Math.round(seconds * 30); // frame index at 30 fps
const sample = (seconds: number) => Math.round(seconds * SAMPLE_RATE);

describe('MOD-Plan frames', () => {
  it('INV-07 nothing is drawn at or past the project end, text included', () => {
    const p = proj({ clips: [video('A', 2)], textLayers: [text('T', 0, 5)] });
    expect(framePlan(p, at(1)).layers).toHaveLength(1);
    expect(framePlan(p, at(1)).texts).toHaveLength(1);
    const past = framePlan(p, at(2));
    expect(past.layers).toEqual([]);
    expect(past.texts).toEqual([]);
  });

  it('F-004.AC7 the first frame of a clip whose in point is source frame 91 maps to source frame 91 (domain)', () => {
    const inPoint = Math.ceil((91 * S) / 30); // 3.0333 s
    const p = proj({ clips: [video('A', 10, { in: inPoint })] });
    const layer = framePlan(p, 0).layers[0]!;
    expect(layer.sourceTime).toBe(inPoint);
    expect(Math.floor((layer.sourceTime * 30) / S)).toBe(91);
  });

  it('RULE-06 source time follows the in point and the speed', () => {
    const p = proj({ clips: [photo('P', 1), video('A', 20, { in: 2 * S, speedPct: 200 })] });
    const layer = framePlan(p, at(3)).layers[0]!;
    expect(layer.clip.id).toBe('A');
    expect(layer.sourceTime).toBe(2 * S + 4 * S);
  });

  it('F-009.AC1 with a 1 s fade in, the picture is at 0 at the start and 50 % at 0.5 s (domain)', () => {
    const p = proj({ clips: [video('A', 5, { fadeIn: S })] });
    expect(framePlan(p, 0).layers[0]!.opacity).toBe(0);
    expect(framePlan(p, at(0.5)).layers[0]!.opacity).toBeCloseTo(0.5, 6);
    const plan = audioPlan(p, 0, sample(1));
    const v = plan.voices[0]!;
    expect(voiceGain(v, 0)).toBe(0);
    expect(voiceGain(v, sample(0.5))).toBeCloseTo(0.5, 6);
  });

  it('F-009.AC2 a 1 s cross-fade blends A into B over the middle second of a 9 s project (domain)', () => {
    const p = proj({ clips: [video('A', 5, { crossFadeNext: S }), video('B', 5)] });
    const mid = framePlan(p, at(4.5));
    expect(mid.layers.map((l) => l.clip.id)).toEqual(['A', 'B']);
    expect(mid.layers.map((l) => l.weight)).toEqual([0.5, 0.5]);
    expect(framePlan(p, at(3.9)).layers.map((l) => l.clip.id)).toEqual(['A']);
    expect(framePlan(p, at(5)).layers.map((l) => l.clip.id)).toEqual(['B']);
    const voices = audioPlan(p, sample(4.5), 1).voices;
    const [ga, gb] = voices.map((v) => voiceGain(v, sample(4.5)));
    expect(ga! ** 2 + gb! ** 2).toBeCloseTo(1, 6); // equal power
    expect(ga).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('F-009.AC7 inside a cross-fade A’s fade out is not applied', () => {
    const p = proj({ clips: [video('A', 5, { crossFadeNext: S, fadeOut: S }), video('B', 5, { fadeIn: S })] });
    const mid = framePlan(p, at(4.5));
    expect(mid.layers.map((l) => l.opacity)).toEqual([1, 1]);
  });

  it('F-010.AC11 a text layer with fade on is transparent at its start and fully visible at 0.3 s', () => {
    const p = proj({ clips: [video('A', 10)], textLayers: [text('T', 2, 5, { fade: true })] });
    expect(framePlan(p, at(2)).texts[0]!.opacity).toBe(0);
    expect(framePlan(p, at(2.3)).texts[0]!.opacity).toBe(1);
    expect(framePlan(p, at(4.9)).texts[0]!.opacity).toBeLessThan(1);
  });

  it('RULE-11 later text layers draw on top', () => {
    const p = proj({ clips: [video('A', 10)], textLayers: [text('T', 0, 5), text('U', 1, 3)] });
    expect(framePlan(p, at(2)).texts.map((t) => t.layer.id)).toEqual(['T', 'U']);
  });
});

describe('MOD-Plan sound', () => {
  it('F-011.AC1 a 3–63 s track in a 20 s project is heard only up to 20 s (domain)', () => {
    const p = proj({ clips: [video('A', 20)], audioClips: [audio('M', 3, 63)] });
    const v = audioPlan(p, 0, sample(60)).voices.find((x) => x.id === 'M')!;
    expect([v.startSample, v.endSample]).toEqual([sample(3), sample(20)]);
    expect(audioPlan(p, sample(20), 1000).voices).toEqual([]);
  });

  it('F-009.AC4 an audio clip’s 2 s fade out falls to silence over its last 2 s', () => {
    const p = proj({ clips: [video('A', 20, { muted: true })], audioClips: [audio('M', 0, 10, { fadeOut: 2 * S })] });
    const v = audioPlan(p, 0, sample(10)).voices.find((x) => x.id === 'M')!;
    expect(voiceGain(v, sample(7.9))).toBe(1);
    expect(voiceGain(v, sample(9))).toBeCloseTo(0.5, 6);
    expect(voiceGain(v, sample(10) - 1)).toBeLessThan(0.001);
  });

  it('F-011.AC10 a muted clip is silent and keeps its volume; RULE-12 volume is linear amplitude', () => {
    const p = proj({ clips: [video('A', 2, { muted: true, volume: 50 }), video('B', 2, { volume: 50 })] });
    const [a, b] = audioPlan(p, 0, sample(4)).voices;
    expect(voiceGain(a!, sample(1))).toBe(0);
    expect(voiceGain(b!, sample(3))).toBe(0.5);
  });

  it('RULE-06 a clip voice reads its source at the clip’s speed', () => {
    const p = proj({ clips: [video('A', 20, { in: S, speedPct: 150 })] });
    const v = audioPlan(p, 0, 10).voices[0]!;
    expect(v.speed).toBe(1.5);
    expect(voiceSourceTime(v, sample(2))).toBe(S + 3 * S);
  });

  it('MOD-Plan photos have no voice; frame times convert to whole samples', () => {
    const p = proj({ rate: 24, clips: [photo('P', 1), video('A', 2)] });
    const v = audioPlan(p, 0, sample(3)).voices;
    expect(v.map((x) => x.id)).toEqual(['A']);
    expect(v[0]!.startSample).toBe(sample(frameStart(24, 24) / S));
  });
});
