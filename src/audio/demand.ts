// MOD-Audio — which source sound a range of the mix reads (ADR-0008 §6 and outcome item 5). Pure.
// The windowed decoder keeps exactly these ranges decoded: the mix of project samples [from, to) reads,
// per unmuted voice, its source from the voice's in point at 1×; with time-stretch from the previous
// sync point's source position minus 32 ms (window half + search, `seekDecodeFrom`) up to the last
// frame's window and search. A small margin covers the coarse search's decimated grid.
// Implements: ADR-0008 §6 (windowed decoding, ≈ 2 s ahead per active voice), ADR-0008 outcome item 5.
import type { Voice } from '../plan';
import { originOf } from './mixer';
import { seekDecodeFrom, WSOLA_DECIMATION, WSOLA_HOP, WSOLA_TOLERANCE } from './wsola';

/** Source samples [from, to) of a source (48 kHz) that a range of the mix reads. */
export interface Demand {
  readonly sourceId: string;
  readonly from: number;
  readonly to: number;
}

const MARGIN = 4 * WSOLA_DECIMATION;

/** More than the limiter's latency: the raw mix runs this far ahead of the output. */
export const MIX_LATENCY_MARGIN = 1024;

/** What rendering project samples [from, to) (raw mix, before the limiter) reads from each source. */
export function soundDemand(voices: readonly Voice[], from: number, to: number): Demand[] {
  const out: Demand[] = [];
  for (const v of voices) {
    if (v.gain === 0) continue; // muted voices are never read (RULE-12: mute is exact silence)
    const a = Math.max(from, v.startSample) - v.startSample;
    const b = Math.min(to, v.endSample) - v.startSample;
    if (b <= a) continue;
    const o = originOf(v);
    if (v.speed === 1) out.push({ sourceId: v.sourceId, from: o + a, to: o + b });
    else {
      const last = Math.floor((b - 1) / WSOLA_HOP) + 1;
      out.push({
        sourceId: v.sourceId,
        from: o + seekDecodeFrom(v.speed, a) - MARGIN,
        to: o + Math.round(last * WSOLA_HOP * v.speed) + WSOLA_HOP + WSOLA_TOLERANCE + MARGIN,
      });
    }
  }
  return out;
}
