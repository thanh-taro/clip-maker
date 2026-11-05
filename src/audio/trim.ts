// MOD-Audio — the verify-and-trim strategy for lossy exports (ADR-0008 outcome rule 2). Pure: MOD-Export
// (the export-audio worker) supplies `pass`, which applies a global gain to the limited mix, encodes it,
// decodes the result and returns its true peak (BS.1770-4 meter, `truePeak`).
// Implements: RULE-12 Mix / F-011.R5 on decoded lossy files (codec overshoot of 2–3 dB, SP-audio).

/** Stop when the decoded true peak is at or below this (the RULE-12 / F-011.AC5 limit). */
export const TRIM_LIMIT_DB = -1.0;
/** Each trim aims the decoded true peak here. */
export const TRIM_TARGET_DB = -1.5;
/** At most this many encode passes, the first one included. */
export const TRIM_MAX_PASSES = 3;
/** The first step's extra margin over the excess. */
export const TRIM_FIRST_MARGIN_DB = 0.2;
/** The fixed trim taken when the passes do not get below the limit. */
export const TRIM_FALLBACK_DB = -3;

export interface TrimResult {
  /** The final global gain (dB, ≤ 0) — shared by a project's video and audio-only exports (NFR-08). */
  readonly gainDb: number;
  /** The decoded true peak at that gain (null after the fixed fallback, which is not measured). */
  readonly peakDb: number | null;
  /** Encode passes run, the fallback encode included. */
  readonly passes: number;
  /** The fixed −3 dB fallback was taken (to be recorded). */
  readonly fallback: boolean;
}

/** One encode → decode → measure pass at a global gain; returns the decoded true peak in dBTP. */
export type TrimPass = (gainDb: number) => number | Promise<number>;

/**
 * Pass 1 encodes at 0 dB. While the decoded true peak is above −1.0 dBTP and passes remain, the next
 * gain aims at −1.5 dBTP: the first step is the excess over −1.5 dB plus 0.2 dB; later steps use the
 * gain→peak slope measured between the last two passes (secant). A non-positive or unusable slope
 * falls back to 1 dB per dB. If the last pass is still above −1.0, one more encode at the last gain
 * −3 dB is taken unmeasured (`fallback`).
 */
export async function verifyAndTrim(pass: TrimPass): Promise<TrimResult> {
  let gain = 0;
  let peak = await pass(gain);
  let passes = 1;
  let prev: { gain: number; peak: number } | null = null;
  while (peak > TRIM_LIMIT_DB && passes < TRIM_MAX_PASSES) {
    let step: number;
    if (!prev) step = -(peak - TRIM_TARGET_DB + TRIM_FIRST_MARGIN_DB);
    else {
      const slope = (peak - prev.peak) / (gain - prev.gain);
      step = (TRIM_TARGET_DB - peak) / (Number.isFinite(slope) && slope > 0 ? slope : 1);
    }
    prev = { gain, peak };
    gain = Math.min(0, gain + step);
    peak = await pass(gain);
    passes++;
  }
  if (peak <= TRIM_LIMIT_DB) return { gainDb: gain, peakDb: peak, passes, fallback: false };
  gain += TRIM_FALLBACK_DB;
  await pass(gain);
  return { gainDb: gain, peakDb: null, passes: passes + 1, fallback: true };
}
