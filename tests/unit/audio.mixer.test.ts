// MOD-Audio mixer driven by MOD-Plan voices (ADR-0008 §1–§3): volume, mute, fades, cross-fades, the
// music track, the limiter, block-size independence and seeks.
import { describe, expect, it } from 'vitest';
import {
  bankOf,
  BS1770_METER,
  endSampleOf,
  pcmSource,
  render,
  renderOffline,
  truePeak,
  type SoundSource,
} from '../../src/audio';
import type { Project } from '../../src/core';
import { voices } from '../../src/plan';
import { audio, proj, S, video } from '../support/project';
import { constant, db, hash, material, rms, rng, sine, SR } from '../support/audio';

function mixOf(project: Project, sources: Record<string, SoundSource>, limiter = true) {
  const end = endSampleOf(project);
  const L = new Float32Array(end);
  const R = new Float32Array(end);
  renderOffline(
    voices(project),
    bankOf(new Map(Object.entries(sources))),
    end,
    (l, r, at) => {
      L.set(l, at);
      R.set(r, at);
    },
    4800,
    { limiter },
  );
  return { L, R, end };
}

describe('MOD-Audio mixer', () => {
  const tone = sine(440, 12, 0.25);

  it('F-011.AC3 RULE-12 a video clip at 50 % volume is 6.0 dB ± 0.5 dB quieter in the shared mix', () => {
    const at = (volume: number) => mixOf(proj({ clips: [video('a', 10, { volume })] }), { 'src-a': pcmSource(tone) });
    const full = at(100);
    const half = at(50);
    const change = db(rms(half.L, SR, 9 * SR) / rms(full.L, SR, 9 * SR));
    expect(Math.abs(change + 6.0)).toBeLessThan(0.5);
    expect(change).toBeCloseTo(-6.02, 2); // linear amplitude: 20·log10(0.5)
    // 200 % doubles the amplitude (+6 dB) while under the limiter's ceiling.
    const loud = at(200);
    expect(db(rms(loud.L, SR, 9 * SR) / rms(full.L, SR, 9 * SR))).toBeCloseTo(6.02, 2);
  });

  it('RULE-12 a muted clip is exactly silent while the music track still plays', () => {
    const p = proj({ clips: [video('a', 4, { muted: true })], audioClips: [audio('m', 0, 4)] });
    const onlyClip = mixOf(p, { 'src-a': pcmSource(tone) });
    expect(onlyClip.L.every((v) => v === 0)).toBe(true);
    const withMusic = mixOf(p, { 'src-a': pcmSource(tone), 'src-m': pcmSource(constant(0.2, 5)) });
    expect(withMusic.L[SR]).toBeCloseTo(0.2, 6);
  });

  it('RULE-12 the sound of every unmuted clip and audio clip is added together', () => {
    const p = proj({ clips: [video('a', 4)], audioClips: [audio('m', 1, 3, { volume: 50 })] });
    const mix = mixOf(p, { 'src-a': pcmSource(constant(0.1, 5)), 'src-m': pcmSource(constant(0.4, 5)) });
    expect(mix.L[SR / 2]).toBeCloseTo(0.1, 6);
    expect(mix.L[2 * SR]).toBeCloseTo(0.1 + 0.2, 6);
    expect(mix.L[3 * SR + 10]).toBeCloseTo(0.1, 6);
  });

  it('RULE-10 a cross-fade uses equal-power curves: the two gains’ squares sum to 1', () => {
    // A on the left channel only, B on the right only, both constant.
    const p = proj({ clips: [video('a', 4, { crossFadeNext: 1 * S }), video('b', 4)] });
    const vs = voices(p);
    const b = vs.find((v) => v.id === 'b')!;
    const mix = mixOf(p, {
      'src-a': pcmSource(constant(0.3, 5), new Float32Array(5 * SR)),
      'src-b': pcmSource(new Float32Array(5 * SR), constant(0.3, 5)),
    });
    const from = b.startSample;
    const to = from + b.crossInSamples;
    expect(b.crossInSamples).toBe(SR);
    for (let i = from; i < to; i += 480) {
      const power = (mix.L[i]! / 0.3) ** 2 + (mix.R[i]! / 0.3) ** 2;
      expect(power).toBeCloseTo(1, 5);
    }
    // At the midpoint each gain is cos(π/4) ≈ 0.707, not the 0.5 of a straight line.
    expect(mix.L[from + SR / 2]! / 0.3).toBeCloseTo(Math.SQRT1_2, 4);
  });

  it('RULE-10 a clip fade-in is a straight line from silence', () => {
    const p = proj({ clips: [video('a', 4, { fadeIn: 1 * S, fadeOut: 1 * S })] });
    const mix = mixOf(p, { 'src-a': pcmSource(constant(0.5, 5)) });
    for (const k of [0, 4800, 12_000, 24_000, 36_000, 47_999]) expect(mix.L[k]).toBeCloseTo((0.5 * k) / SR, 6);
    expect(mix.L[2 * SR]).toBeCloseTo(0.5, 6);
    expect(mix.L[3 * SR + 24_000]).toBeCloseTo(0.25, 6);
  });

  it('INV-07 nothing sounds past the project end, even from an audio clip that runs past it', () => {
    const p = proj({ clips: [video('a', 2)], audioClips: [audio('m', 0, 4)] });
    const end = endSampleOf(p);
    expect(end).toBe(2 * SR);
    const [L] = render(voices(p), bankOf(new Map([['src-m', pcmSource(constant(0.2, 5))]])), end, end - 100, 400);
    expect(L[50]).toBeCloseTo(0.2, 6);
    expect(L.subarray(100).every((v) => v === 0)).toBe(true);
  });

  it('RULE-12 music at 200 % over loud video sound stays ≤ −1.35 dBTP after the limiter', () => {
    const p = proj({ clips: [video('a', 4, { volume: 200 })], audioClips: [audio('m', 0, 4, { volume: 200 })] });
    const loud = material(5, 1).map((v) => v * 2);
    const mix = mixOf(p, { 'src-a': pcmSource(loud), 'src-m': pcmSource(material(5, 2)) });
    const raw = mixOf(p, { 'src-a': pcmSource(loud), 'src-m': pcmSource(material(5, 2)) }, false);
    expect(truePeak([raw.L, raw.R], BS1770_METER).dB).toBeGreaterThan(6);
    expect(truePeak([mix.L, mix.R], BS1770_METER).dB).toBeLessThanOrEqual(-1.35);
  });

  it('INV-02 NFR-08 the mix is identical whatever the block sizes (preview blocks vs export blocks)', () => {
    const p = proj({
      clips: [video('a', 6, { speedPct: 200, crossFadeNext: 0.5 * S, volume: 150 }), video('b', 5, { speedPct: 50 })],
      audioClips: [audio('m', 0.5, 4, { volume: 180, fadeIn: 1 * S })],
    });
    const sources = new Map<string, SoundSource>([
      ['src-a', pcmSource(material(7, 1), material(7, 2))],
      ['src-b', pcmSource(material(6, 3), material(6, 4))],
      ['src-m', pcmSource(material(5, 5), material(5, 6))],
    ]);
    const vs = voices(p);
    const end = endSampleOf(p);
    const run = (block: number | ((i: number) => number)) => {
      const L = new Float32Array(end);
      const R = new Float32Array(end);
      renderOffline(vs, bankOf(sources), end, (l, r, at) => (L.set(l, at), R.set(r, at)), block);
      return hash(L, R);
    };
    const r = rng(9);
    expect(run(1024)).toBe(run(1600));
    expect(run(() => 1 + Math.floor(r() * 3000))).toBe(run(4800));
  });

  it('MOD-Audio a seek with the 1 s limiter pre-roll matches the continuous render (≤ 1e-6)', () => {
    const p = proj({ clips: [video('a', 8, { volume: 200, speedPct: 150 })] });
    const src = new Map([['src-a', pcmSource(material(13, 8).map((v) => v * 2))]]);
    const vs = voices(p);
    const end = endSampleOf(p);
    const [all] = render(vs, bankOf(src), end, 0, end);
    for (const from of [SR + 123, 3 * SR, 4 * SR + 4799]) {
      const [part] = render(vs, bankOf(src), end, from, 9600);
      let diff = 0;
      for (let i = 0; i < part.length; i++) diff = Math.max(diff, Math.abs(part[i]! - all[from + i]!));
      expect(diff, `from ${from}`).toBeLessThanOrEqual(1e-6);
    }
  });
});
