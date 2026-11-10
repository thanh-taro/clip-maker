// MOD-Core — the export tables and rate-control maths of RULE-15/RULE-16 (architecture.md "Export
// tables", ADR-0010 §4–§6 and its outcome items 7–9), file names, GIF frame delays. Pure.
// Implements: F-015.R1/R2 tables, RULE-15 (resolutions, bitrates, floors, size-target feasibility,
// file name), RULE-16 (GIF timing), D-020.
import { frameStart, type FrameRate, type Micros } from './time';

export type ExportQuality = 'smaller' | 'balanced' | 'best';
export type VideoResolution = 480 | 720 | 1080 | 1440 | 2160;

/** architecture.md "Export tables": kbps at 30 fps (floor = the size-target minimum). */
export const EXPORT_TABLE: Readonly<
  Record<VideoResolution, Readonly<{ floor: number } & Record<ExportQuality, number>>>
> = /* @__PURE__ */ Object.freeze({
  480: { floor: 300, smaller: 900, balanced: 1500, best: 2500 },
  720: { floor: 600, smaller: 1800, balanced: 3000, best: 5000 },
  1080: { floor: 1000, smaller: 3500, balanced: 6000, best: 10000 },
  1440: { floor: 2000, smaller: 7000, balanced: 12000, best: 18000 },
  2160: { floor: 4000, smaller: 14000, balanced: 24000, best: 36000 },
});

/** ADR-0010 §4: × 1.5 at 60 fps, × 0.85 at 24 and 25 fps. */
export const rateFactor = (rate: FrameRate): number => (rate === 60 ? 1.5 : rate < 30 ? 0.85 : 1);

/** Video bitrate of a quality level, bits per second. */
export const bitrateFor = (resolution: VideoResolution, quality: ExportQuality, rate: FrameRate): number =>
  Math.round(EXPORT_TABLE[resolution][quality] * 1000 * rateFactor(rate));

/** The size-target floor of a resolution, bits per second (RULE-15 "Meeting a size target"). */
export const floorFor = (resolution: VideoResolution, rate: FrameRate): number =>
  Math.round(EXPORT_TABLE[resolution].floor * 1000 * rateFactor(rate));

/** Audio in video files: AAC-LC or Opus 128 kbps (architecture.md). */
export const VIDEO_AUDIO_BPS = 128_000;
/** Audio-only: AAC 192 kbps or Opus 160 kbps (architecture.md). */
export const AUDIO_ONLY_BPS = { aac: 192_000, opus: 160_000 } as const;
/** One keyframe every 2 s: one GOP per calibration range (ADR-0010 outcome item 8). */
export const GOP_SECONDS = 2;
export const gopFrames = (rate: FrameRate): number => rate * GOP_SECONDS;
/** 1 MB = 1,000,000 bytes (architecture.md A4). */
export const MB = 1_000_000;

/** Output size of a video export: the shorter side is the resolution, both sides even, the long side a
 * multiple of 16 (ADR-0010 outcome item 9: 480p = 848 × 480). A square frame stays square. */
export function videoOutputSize(aspect: number, resolution: number): { width: number; height: number } {
  const short = resolution - (resolution % 2);
  const ratio = aspect >= 1 ? aspect : 1 / aspect;
  const long = ratio === 1 ? short : Math.max(short, Math.round((short * ratio) / 16) * 16);
  return aspect >= 1 ? { width: long, height: short } : { width: short, height: long };
}

/** GIF size: the longer side is `size`; the shorter even (RULE-16). */
export function gifOutputSize(aspect: number, size: number): { width: number; height: number } {
  const ratio = aspect >= 1 ? aspect : 1 / aspect;
  const short = Math.max(2, Math.round(size / ratio / 2) * 2);
  return aspect >= 1 ? { width: size, height: short } : { width: short, height: size };
}

/**
 * ADR-0010 §5 / outcome item 7: the video bitrate a size target allows, bits per second —
 * (X × 8,000,000 × 0.95 − audio bits − headroom) ÷ seconds, headroom = 1 % + 512 kbit.
 */
export function targetVideoBps(targetMB: number, seconds: number, audioBps: number): number {
  const bits = targetMB * 8 * MB;
  return (bits * 0.95 - audioBps * seconds - (0.01 * bits + 512_000)) / Math.max(seconds, 1e-6);
}

/** Calibration of an encoder on this project: bytes of key and other frames (ADR-0010 outcome item 8). */
export interface Calibration {
  readonly keyBytes: number;
  readonly keyCount: number;
  readonly deltaBytes: number;
  readonly deltaCount: number;
}

/** Measured container overhead: 4 KB + 0.35 KB/s (ADR-0010 outcome). */
export const overheadBytes = (seconds: number): number => 4000 + 350 * seconds;

/** The encoder's delivered rate on the calibration (bits per second). */
export function deliveredBps(cal: Calibration, rate: FrameRate): number {
  const frames = cal.keyCount + cal.deltaCount;
  return frames ? ((cal.keyBytes + cal.deltaBytes) * 8 * rate) / frames : 0;
}

/** key-mean × keyframes + delta-mean × other frames (uncapped). */
export function modelVideoBytes(cal: Calibration, frames: number, rate: FrameRate): number {
  const keys = Math.ceil(frames / gopFrames(rate));
  const keyMean = cal.keyCount ? cal.keyBytes / cal.keyCount : 0;
  const deltaMean = cal.deltaCount ? cal.deltaBytes / cal.deltaCount : keyMean;
  return keyMean * keys + deltaMean * Math.max(0, frames - keys);
}

/**
 * Implements: F-015.R2 estimate (ADR-0010 §6, outcome item 8) — the calibrated video size capped at
 * the nominal bitrate, sound at the delivered rate, and the measured overhead.
 */
export function estimateBytes(o: {
  readonly cal: Calibration | null;
  readonly frames: number;
  readonly rate: FrameRate;
  readonly videoBps: number;
  readonly audioBps: number;
}): number {
  const seconds = o.frames / o.rate;
  const nominal = (o.videoBps * seconds) / 8;
  const video = o.cal ? Math.min(nominal, modelVideoBytes(o.cal, o.frames, o.rate)) : nominal;
  return Math.round(video + (o.audioBps * seconds) / 8 + overheadBytes(seconds));
}

/** The target-rate pre-check's predicted file (uncapped model, ADR-0010 outcome item 7). */
export function predictedTargetBytes(cal: Calibration, frames: number, rate: FrameRate, audioBps: number): number {
  const seconds = frames / rate;
  return Math.round(modelVideoBytes(cal, frames, rate) + (audioBps * seconds) / 8 + overheadBytes(seconds));
}

/** The 3 × 2 s calibration ranges at 10/50/90 % of the project, as frame ranges [from, to). */
export function calibrationRanges(frames: number, rate: FrameRate): [number, number][] {
  const seg = gopFrames(rate);
  if (frames <= 3 * seg) return [[0, frames]];
  return [0.1, 0.5, 0.9].map((f) => {
    const a = Math.min(frames - seg, Math.round(frames * f));
    return [a, a + seg];
  });
}

/** The single corrective pass's bitrate: bitrate × budget ÷ actual × 0.97 (ADR-0010 outcome item 7). */
export const correctiveBps = (bitrate: number, budgetBytes: number, actualBytes: number): number =>
  Math.floor(((bitrate * budgetBytes) / Math.max(1, actualBytes)) * 0.97);

/** What the panel can offer for a size target (RULE-15, D-020). */
export interface SizeTargetPlan {
  /** Video bitrate the target allows (bits per second). */
  readonly videoBps: number;
  /** The chosen resolution can meet it. */
  readonly reachable: boolean;
  /** The largest offered resolution that can, when the chosen one can't. */
  readonly suggestedResolution: VideoResolution | null;
  /** When no resolution can: the smallest whole-MB target 480 can meet. */
  readonly smallestTargetMB: number | null;
}

/**
 * Implements: RULE-15 "Meeting a size target", D-020, ADR-0010 outcome item 7 — reachable at a
 * resolution when the target's bitrate is at least its effective floor (max of the table floor and the
 * encoder's delivered rate on this project, when measured). `offered` lists the encodable resolutions.
 */
export function sizeTargetPlan(o: {
  readonly targetMB: number;
  readonly seconds: number;
  readonly rate: FrameRate;
  readonly audioBps: number;
  readonly resolution: VideoResolution;
  readonly offered: readonly VideoResolution[];
  readonly delivered?: Partial<Record<VideoResolution, number>>;
}): SizeTargetPlan {
  const floor = (r: VideoResolution): number => Math.max(floorFor(r, o.rate), o.delivered?.[r] ?? 0);
  const videoBps = targetVideoBps(o.targetMB, o.seconds, o.audioBps);
  if (videoBps >= floor(o.resolution)) {
    return { videoBps, reachable: true, suggestedResolution: null, smallestTargetMB: null };
  }
  const lower = [...o.offered].filter((r) => r < o.resolution && videoBps >= floor(r)).sort((a, b) => b - a);
  if (lower[0] !== undefined) {
    return { videoBps, reachable: false, suggestedResolution: lower[0], smallestTargetMB: null };
  }
  let x = Math.max(1, Math.ceil(o.targetMB));
  while (x < 4000 && targetVideoBps(x, o.seconds, o.audioBps) < floor(480)) x++;
  return { videoBps, reachable: false, suggestedResolution: null, smallestTargetMB: x };
}

/** One output frame of the export schedule (integer µs, RULE-04 frame times). */
export interface ScheduledFrame {
  readonly k: number;
  readonly timestamp: Micros;
  readonly duration: Micros;
  readonly key: boolean;
}

/** Implements: ADR-0010 §1 — frame k at frameStart(k), lasting to the next start; a keyframe every 2 s. */
export function scheduledFrame(k: number, rate: FrameRate, gop = gopFrames(rate)): ScheduledFrame {
  const timestamp = frameStart(k, rate);
  return { k, timestamp, duration: frameStart(k + 1, rate) - timestamp, key: k % gop === 0 };
}

/**
 * Implements: RULE-16 GIF timing, NFR-08 (GIF), ADR-0010 §10 — delays in hundredths of a second
 * whose running sum starts frame i at ceil(i × 100 ÷ rate) (e.g. 7, 7, 6 at 15 fps).
 */
export function gifDelays(rate: number, count: number): number[] {
  const at = (i: number): number => Math.ceil((i * 100) / rate - 1e-9);
  return Array.from({ length: count }, (_, i) => at(i + 1) - at(i));
}

const two = (n: number): string => String(n).padStart(2, '0');

/** Implements: RULE-15 / F-015.AC5 — `clip-<YYYYMMDD-HHMMSS>.<ext>` in local time. */
export function exportFileName(date: Date, ext: string): string {
  const d = `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}`;
  const t = `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
  return `clip-${d}-${t}.${ext}`;
}
