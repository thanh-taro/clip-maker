// MOD-Codec — the configs the capability probe asks about (ADR-0004 §2 and outcome items 1–3,
// platform-mapping "Start-up check"). Promoted from SP-codec `configs.js`. Pure.

/** Video codec families the decode probe checks (ADR-0004 §2). */
export type DecodeFamily = 'h264' | 'hevc' | 'vp8' | 'vp9' | 'av1';
/** Video encoders of the RULE-15 fallback order. */
export type VideoCodecId = 'h264' | 'vp9' | 'vp8';
export type AudioCodecId = 'aac' | 'opus';

// H.264 levels: [level_idc, MaxMBPS, MaxFS].
const H264_LEVELS: readonly (readonly [number, number, number])[] = [
  [30, 40_500, 1620],
  [31, 108_000, 3600],
  [32, 216_000, 5120],
  [40, 245_760, 8192],
  [42, 522_240, 8704],
  [50, 589_824, 22_080],
  [51, 983_040, 36_864],
  [52, 2_073_600, 36_864],
  [60, 4_177_920, 139_264],
];

/** The H.264 codec string for a profile at the smallest level that fits the size and rate. */
export function h264Codec(profile: 'baseline' | 'main' | 'high', w: number, h: number, fps: number): string {
  const fs = Math.ceil(w / 16) * Math.ceil(h / 16);
  const level = (H264_LEVELS.find(([, mbps, mfs]) => fs <= mfs && fs * fps <= mbps) ?? [60])[0];
  const prof = { baseline: '42E0', main: '4D40', high: '6400' }[profile];
  return `avc1.${prof}${level.toString(16).toUpperCase().padStart(2, '0')}`;
}

// VP9 levels: [level, MaxLumaSampleRate, MaxLumaPictureSize].
const VP9_LEVELS: readonly (readonly [number, number, number])[] = [
  [30, 20_736_000, 552_960],
  [31, 36_864_000, 983_040],
  [40, 83_558_400, 2_228_224],
  [41, 160_432_128, 2_228_224],
  [50, 311_951_360, 8_912_896],
  [51, 588_251_136, 8_912_896],
  [52, 1_176_502_272, 8_912_896],
  [60, 1_176_502_272, 35_651_584],
];

/** The VP9 profile-0 8-bit codec string at the smallest level that fits. */
export function vp9Codec(w: number, h: number, fps: number): string {
  const ps = w * h;
  const level = (VP9_LEVELS.find(([, r, s]) => ps <= s && ps * fps <= r) ?? [60])[0];
  return `vp09.00.${level}.08`;
}

/** The codec string of an encoder at a size and rate. */
export function videoCodecString(codec: VideoCodecId, w: number, h: number, fps: number): string {
  if (codec === 'h264') return h264Codec('high', Math.max(w, h), Math.min(w, h), fps);
  if (codec === 'vp9') return vp9Codec(w, h, fps);
  return 'vp8';
}

/** RULE-15 output sizes as landscape frames: even, long side a multiple of 16 (480p = 848 × 480). */
export const GRID_SIZES: readonly { readonly short: number; readonly w: number; readonly h: number }[] = [
  { short: 480, w: 848, h: 480 },
  { short: 720, w: 1280, h: 720 },
  { short: 1080, w: 1920, h: 1080 },
  { short: 1440, w: 2560, h: 1440 },
  { short: 2160, w: 3840, h: 2160 },
];
export const GRID_RATES: readonly number[] = [24, 25, 30, 60];

/** A probe-sized bitrate (only `isConfigSupported` sees it; export rates are MOD-Core's tables). */
const probeBitrate = (short: number, fps: number): number =>
  Math.round(((short * short * 16) / 9) * 2.9 * (fps >= 50 ? 1.5 : fps < 30 ? 0.85 : 1));

/** The encoder settings of ADR-0004 §5 for a size and rate. */
export function videoEncoderConfig(codec: VideoCodecId, w: number, h: number, fps: number): VideoEncoderConfig {
  const cfg: VideoEncoderConfig = {
    codec: videoCodecString(codec, w, h, fps),
    width: w,
    height: h,
    framerate: fps,
    bitrate: probeBitrate(Math.min(w, h), fps),
    bitrateMode: 'variable',
    latencyMode: 'quality',
    hardwareAcceleration: 'no-preference',
  };
  if (codec === 'h264') cfg.avc = { format: 'avc' };
  return cfg;
}

/** Decode probes at 1080p (ADR-0004 outcome item 1: the minimal set). */
export function decodeProbeConfigs(): readonly {
  readonly family: DecodeFamily;
  readonly config: VideoDecoderConfig;
}[] {
  const [w, h] = [1920, 1080];
  const at = (family: DecodeFamily, codec: string) => ({ family, config: { codec, codedWidth: w, codedHeight: h } });
  return [
    at('h264', h264Codec('baseline', w, h, 30)),
    at('h264', h264Codec('main', w, h, 30)),
    at('h264', h264Codec('high', w, h, 30)),
    at('hevc', 'hvc1.1.6.L123.B0'),
    at('vp8', 'vp8'),
    at('vp9', vp9Codec(w, h, 30)),
    at('av1', 'av01.0.08M.08'),
  ];
}

/** One encode probe per candidate codec at 1080p30 (ADR-0004 outcome item 1). */
export function encodeProbeConfigs(): readonly { readonly codec: VideoCodecId; readonly config: VideoEncoderConfig }[] {
  return (['h264', 'vp9', 'vp8'] as const).map((codec) => ({
    codec,
    config: videoEncoderConfig(codec, 1920, 1080, 30),
  }));
}

/** AAC-LC and Opus at 48 kHz stereo, 128 kbps (ADR-0004 §2, §5). */
export function audioEncoderConfig(codec: AudioCodecId, bitrate = 128_000): AudioEncoderConfig {
  return codec === 'aac'
    ? { codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2, bitrate }
    : { codec: 'opus', sampleRate: 48_000, numberOfChannels: 2, bitrate };
}
