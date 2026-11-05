// MOD-Codec — the start-up capability probe (RULE-22, ADR-0004 outcome items 1–3, 9) and the lazy
// export grid, the output format choice of RULE-15 / RULE-16 (ADR-0004 §3–4). Promoted from SP-codec.
import {
  audioEncoderConfig,
  decodeProbeConfigs,
  encodeProbeConfigs,
  GRID_RATES,
  GRID_SIZES,
  videoEncoderConfig,
  type AudioCodecId,
  type DecodeFamily,
  type VideoCodecId,
} from './configs';
import { pool, PROBE_CONCURRENCY } from './util';

interface ConfigChecker<C> {
  isConfigSupported(config: C): Promise<{ supported?: boolean }>;
}

/** The codec interfaces the probe asks; `globalThis` by default, fakes in tests. */
export interface CodecApi {
  readonly VideoDecoder?: ConfigChecker<VideoDecoderConfig>;
  readonly VideoEncoder?: ConfigChecker<VideoEncoderConfig>;
  readonly AudioDecoder?: ConfigChecker<AudioDecoderConfig>;
  readonly AudioEncoder?: ConfigChecker<AudioEncoderConfig>;
}

export const browserCodecApi = (): CodecApi => globalThis as unknown as CodecApi;

/** `isConfigSupported` as a boolean: a missing interface or a thrown error counts as "no". */
export async function supports<C>(checker: ConfigChecker<C> | undefined, config: C): Promise<boolean> {
  if (!checker || typeof checker.isConfigSupported !== 'function') return false;
  try {
    return (await checker.isConfigSupported(config)).supported === true;
  } catch {
    return false;
  }
}

/**
 * The effects check: can the device draw the effect chain, and how fast (ms per frame, null if not
 * timed). MOD-Compositor provides the real check (E3: full RULE-08 chain + a look + Blur at 1080p,
 * 5 warm-up + 30 timed frames); until then `webgl2EffectsCheck` only creates a context.
 */
export interface EffectsResult {
  readonly ok: boolean;
  readonly msPerFrame: number | null;
}
export type EffectsCheck = () => Promise<EffectsResult>;

/** Stand-in effects check (hook for MOD-Compositor): a WebGL2 context can be created. */
export const webgl2EffectsCheck: EffectsCheck = async () => {
  try {
    const ok = typeof OffscreenCanvas === 'function' && new OffscreenCanvas(1, 1).getContext('webgl2') !== null;
    return { ok, msPerFrame: null };
  } catch {
    return { ok: false, msPerFrame: null };
  }
};

/** Below 30 fps in the effects check (> 33 ms per frame) → COPY-notice.slow_device (ADR-0004 item 9). */
export const SLOW_MS_PER_FRAME = 1000 / 30;

/** The capability record of the start-up probe, used everywhere (MOD-Codec public surface). */
export interface Capabilities {
  /** Families with a passing 1080p decode config. */
  readonly decode: readonly DecodeFamily[];
  /** Encoders passing at 1080p30. */
  readonly encode: Readonly<Record<VideoCodecId, boolean>>;
  readonly audioEncode: Readonly<Record<AudioCodecId, boolean>>;
  readonly effects: EffectsResult;
  /** RULE-22: effects draw below the speed threshold. */
  readonly slowDevice: boolean;
  /** Wall time of the probe, ms (budget ≤ 300 ms, ADR-0004 item 1). */
  readonly ms: number;
}

/**
 * Implements: F-023.R1/R4, RULE-22 — the minimal start-up set: decode at 1080p (H.264, HEVC, VP8,
 * VP9, AV1), one encode per candidate codec at 1080p30, AAC-LC and Opus encode, and the effects
 * check, with at most 4 `isConfigSupported` calls at once. Makes no request.
 */
export async function probeCapabilities(
  api: CodecApi = browserCodecApi(),
  effectsCheck: EffectsCheck = webgl2EffectsCheck,
): Promise<Capabilities> {
  const t0 = performance.now();
  const dec = decodeProbeConfigs();
  const enc = encodeProbeConfigs();
  const aud = (['aac', 'opus'] as const).map((codec) => ({ codec, config: audioEncoderConfig(codec) }));
  type Job = () => Promise<boolean>;
  const jobs: Job[] = [
    ...dec.map((d) => () => supports(api.VideoDecoder, d.config)),
    ...enc.map((e) => () => supports(api.VideoEncoder, e.config)),
    ...aud.map((a) => () => supports(api.AudioEncoder, a.config)),
  ];
  const [results, effects] = await Promise.all([pool(jobs, PROBE_CONCURRENCY, (j) => j()), effectsCheck()]);
  const decodeOk = results.slice(0, dec.length);
  const encodeOk = results.slice(dec.length, dec.length + enc.length);
  const audioOk = results.slice(dec.length + enc.length);
  const decode = [...new Set(dec.filter((_, i) => decodeOk[i]).map((d) => d.family))];
  const encode = Object.fromEntries(enc.map((e, i) => [e.codec, encodeOk[i] === true])) as Record<
    VideoCodecId,
    boolean
  >;
  const audioEncode = Object.fromEntries(aud.map((a, i) => [a.codec, audioOk[i] === true])) as Record<
    AudioCodecId,
    boolean
  >;
  return {
    decode,
    encode,
    audioEncode,
    effects,
    slowDevice: effects.ok && effects.msPerFrame !== null && effects.msPerFrame > SLOW_MS_PER_FRAME,
    ms: performance.now() - t0,
  };
}

/** A RULE-22 check that failed; each maps to its COPY-unsupported.missing_* text. */
export type Missing = 'decode' | 'encode' | 'effects';

/**
 * Implements: RULE-22, F-023.R1 — every failed start-up check, in the order of the rule. Encoding
 * passes when at least one complete video output format (video and sound encoder) passes
 * (ADR-0004 §2). Slow effects never block (they give COPY-notice.slow_device).
 */
export function deviceCheck(caps: Capabilities): Missing[] {
  const missing: Missing[] = [];
  if (caps.decode.length === 0) missing.push('decode');
  if (chooseVideoFormat(caps, true) === null) missing.push('encode');
  if (!caps.effects.ok) missing.push('effects');
  return missing;
}

/** A video output format of RULE-15. */
export interface VideoFormat {
  readonly id: 'mp4-h264-aac' | 'mp4-h264-opus' | 'webm-vp9-opus' | 'webm-vp8-opus';
  readonly container: 'mp4' | 'webm';
  readonly video: VideoCodecId;
  /** null: a project without sound writes no audio track. */
  readonly audio: AudioCodecId | null;
  /** Not the first of the order: the export panel names it (COPY-export.format_note). */
  readonly fallback: boolean;
}

const VIDEO_ORDER: readonly Omit<VideoFormat, 'fallback'>[] = [
  { id: 'mp4-h264-aac', container: 'mp4', video: 'h264', audio: 'aac' },
  { id: 'mp4-h264-opus', container: 'mp4', video: 'h264', audio: 'opus' },
  { id: 'webm-vp9-opus', container: 'webm', video: 'vp9', audio: 'opus' },
  { id: 'webm-vp8-opus', container: 'webm', video: 'vp8', audio: 'opus' },
];

type EncodeSet = Pick<Capabilities, 'encode' | 'audioEncode'>;

/**
 * Implements: RULE-15, ADR-0004 §3 — the first format whose video and (with sound) audio encoders
 * both pass; without sound, the first whose video encoder passes, with no audio track. Formats
 * dropped for the session after a failed trial encode are passed in `dropped`.
 */
export function chooseVideoFormat(
  caps: EncodeSet,
  hasSound: boolean,
  dropped: ReadonlySet<VideoFormat['id']> = new Set(),
): VideoFormat | null {
  for (const [i, f] of VIDEO_ORDER.entries()) {
    if (dropped.has(f.id) || !caps.encode[f.video]) continue;
    if (hasSound && f.audio && !caps.audioEncode[f.audio]) continue;
    return { ...f, audio: hasSound ? f.audio : null, fallback: i > 0 };
  }
  return null;
}

/** An audio-only output of RULE-16. */
export interface AudioFormat {
  readonly id: 'm4a-aac' | 'ogg-opus' | 'wav';
  readonly fallback: boolean;
}

/** Implements: RULE-16, ADR-0004 §4 — AAC-LC in M4A, else Opus in Ogg; WAV (own writer) always. */
export function chooseAudioFormat(caps: Pick<Capabilities, 'audioEncode'>): AudioFormat {
  if (caps.audioEncode.aac) return { id: 'm4a-aac', fallback: false };
  if (caps.audioEncode.opus) return { id: 'ogg-opus', fallback: true };
  return { id: 'wav', fallback: true };
}

/** One cell of the export grid. */
export interface GridCell {
  readonly short: number;
  readonly rate: number;
  readonly supported: boolean;
}

/**
 * Implements: RULE-15 resolutions offered, ADR-0004 outcome item 2 — the size × rate grid for the
 * chosen codec only, probed when the export panel opens (≈ 20 calls, at most 4 at once).
 */
export async function probeExportGrid(codec: VideoCodecId, api: CodecApi = browserCodecApi()): Promise<GridCell[]> {
  const cells = GRID_SIZES.flatMap((s) => GRID_RATES.map((rate) => ({ s, rate })));
  return pool(cells, PROBE_CONCURRENCY, async ({ s, rate }) => ({
    short: s.short,
    rate,
    supported: await supports(api.VideoEncoder, videoEncoderConfig(codec, s.w, s.h, rate)),
  }));
}
