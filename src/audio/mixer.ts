// MOD-Audio — the one deterministic mixer for preview and every export (ADR-0008 §1–§3).
// Promoted from spike/audio (spikes/audio/public/dsp.js `Mixer`), driven by MOD-Plan's voices.
// Implements: F-011.R5 (preview and export play the same mix and it never clips), RULE-12 Volume
// (linear amplitude, mute) and Mix (sum, then the true-peak limiter), RULE-10 sound (straight-line
// fades, equal-power cross-fades — MOD-Plan's voiceGain), RULE-06 / F-005.R3 (speed with pitch kept),
// INV-02 / NFR-08 (block-size independent: any block split renders the same samples).
import { voiceGain, type Voice, SAMPLE_RATE } from '../plan';
import { Limiter, type LimiterOptions } from './limiter';
import type { SoundSource, SourceBank } from './source';
import { createStretcher, type Stretcher } from './wsola';

/** Limiter pre-roll after a seek (ADR-0008 §5: 1 s, so its state matches a continuous render). */
export const LIMITER_PREROLL = SAMPLE_RATE;

/** The voice's in point as a source sample index (48 kHz). */
export const originOf = (v: Voice): number => Math.round((v.sourceIn * SAMPLE_RATE) / 1_000_000);

export interface MixerOptions extends LimiterOptions {
  /** false = the raw sum, no limiter (tests and measurements only). */
  readonly limiter?: boolean;
}

/**
 * A streaming renderer over all of a project's voices (MOD-Plan `voices(project)`, in that order).
 * Output sample i of `process` is project sample `position + i`; the limiter latency is compensated.
 * Samples at or past `endSample` (the project end, INV-07) are silent.
 */
export class Mixer {
  private readonly lim: Limiter;
  private readonly useLimiter: boolean;
  private readonly stretchers = new Map<string, Stretcher>();
  private inPos = 0;
  private outPos = 0;
  private readonly tmp = new Float64Array(3);
  // Raw-mix scratch (float64 sums in voice order, so any block split gives the same values).
  private sumL = new Float64Array(0);
  private sumR = new Float64Array(0);
  private vL = new Float32Array(0);
  private vR = new Float32Array(0);

  constructor(
    private readonly voices: readonly Voice[],
    private readonly sources: SourceBank,
    private readonly endSample: number,
    o: MixerOptions = {},
  ) {
    this.lim = new Limiter(o);
    this.useLimiter = o.limiter ?? true;
  }

  /** The next output sample's project position. */
  get position(): number {
    return this.outPos;
  }

  /** Lowest limiter gain since the last seek. */
  get minGain(): number {
    return this.lim.minGain;
  }

  /** Positions the output at project sample `pos`, pre-rolling the limiter by `preroll` samples. */
  seek(pos: number, preroll: number = LIMITER_PREROLL): void {
    this.outPos = pos;
    if (!this.useLimiter) return;
    this.lim.reset();
    const latency = this.lim.latency;
    const start = Math.max(-latency, pos - preroll);
    this.inPos = start;
    const need = pos + latency - start;
    const CH = 4096;
    for (let done = 0; done < need; done += CH) {
      const n = Math.min(CH, need - done);
      this.mixRaw(this.inPos, n);
      for (let i = 0; i < n; i++) this.lim.push(this.sumL[i]!, this.sumR[i]!, this.tmp);
      this.inPos += n;
    }
    this.lim.minGain = 1;
  }

  /** Renders outL.length samples into outL/outR. */
  process(outL: Float32Array, outR: Float32Array): void {
    const n = outL.length;
    if (!this.useLimiter) {
      this.mixRaw(this.outPos, n);
      for (let i = 0; i < n; i++) {
        outL[i] = this.sumL[i]!;
        outR[i] = this.sumR[i]!;
      }
      this.outPos += n;
      return;
    }
    this.mixRaw(this.inPos, n);
    const t = this.tmp;
    for (let i = 0; i < n; i++) {
      this.lim.push(this.sumL[i]!, this.sumR[i]!, t);
      outL[i] = t[0]!;
      outR[i] = t[1]!;
    }
    this.inPos += n;
    this.outPos += n;
  }

  /** The raw (pre-limiter) sum of project samples [from, from + n) into sumL/sumR. */
  private mixRaw(from: number, n: number): void {
    if (this.sumL.length < n) {
      this.sumL = new Float64Array(n);
      this.sumR = new Float64Array(n);
      this.vL = new Float32Array(n);
      this.vR = new Float32Array(n);
    }
    const sL = this.sumL;
    const sR = this.sumR;
    sL.fill(0, 0, n);
    sR.fill(0, 0, n);
    const to = Math.min(from + n, this.endSample);
    for (const v of this.voices) {
      const a = Math.max(from, v.startSample);
      const b = Math.min(to, v.endSample);
      if (b <= a || v.gain === 0) continue; // mute = exact silence (RULE-12)
      const src = this.sources(v.sourceId);
      if (!src) continue;
      const vL = this.vL.subarray(0, b - a);
      const vR = this.vR.subarray(0, b - a);
      this.stretcherFor(v, src).render(a - v.startSample, vL, vR);
      for (let m = a; m < b; m++) {
        const g = voiceGain(v, m);
        if (g === 0) continue;
        const i = m - from;
        sL[i] = sL[i]! + g * vL[m - a]!;
        sR[i] = sR[i]! + g * vR[m - a]!;
      }
    }
  }

  private stretcherFor(v: Voice, src: SoundSource): Stretcher {
    const key = `${v.kind}:${v.id}:${v.sourceId}:${v.sourceIn}:${v.speed}`;
    let s = this.stretchers.get(key);
    if (!s) {
      s = createStretcher(src, originOf(v), v.speed);
      this.stretchers.set(key, s);
    }
    return s;
  }
}

/**
 * The mix of project samples [fromSample, fromSample + count) — pure over the decoded sources:
 * a fresh mixer seeked with the 1 s limiter pre-roll (ADR-0008 §5), as preview does after a seek.
 */
export function render(
  voices: readonly Voice[],
  sources: SourceBank,
  endSample: number,
  fromSample: number,
  count: number,
  o: MixerOptions = {},
): [Float32Array, Float32Array] {
  const mixer = new Mixer(voices, sources, endSample, o);
  mixer.seek(fromSample);
  const L = new Float32Array(count);
  const R = new Float32Array(count);
  mixer.process(L, R);
  return [L, R];
}

/**
 * Offline render for export (ADR-0008 §1, used by MOD-Export): the whole project from sample 0 in
 * blocks of `block` samples (or sizes from a function), each handed to `onBlock`. Block-size
 * independent; the same samples the preview plays.
 */
export function renderOffline(
  voices: readonly Voice[],
  sources: SourceBank,
  endSample: number,
  onBlock: (L: Float32Array, R: Float32Array, at: number) => void,
  block: number | ((index: number) => number) = 4800,
  o: MixerOptions = {},
): void {
  const mixer = new Mixer(voices, sources, endSample, o);
  mixer.seek(0, 0);
  for (let at = 0, b = 0; at < endSample; b++) {
    const size = Math.max(1, Math.min(endSample - at, typeof block === 'function' ? block(b) : block));
    const L = new Float32Array(size);
    const R = new Float32Array(size);
    mixer.process(L, R);
    onBlock(L, R, at);
    at += size;
  }
}
