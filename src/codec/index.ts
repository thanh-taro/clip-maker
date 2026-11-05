// MOD-Codec — capability probe, decoder and encoder setup, output format choice
// (specs/40-technical/modules/MOD-Codec.md, ADR-0004 and its outcome). The probe, the export grid,
// the trial encodes, the first-packet decode check and the format choice are built (E2); creating
// the playback and export coders came with MOD-Engine (E3) and MOD-Export (E5).
import { withNormalisedDescription } from './util';
import { browserCodecApi, supports, type CodecApi, type Missing } from './probe';

export * from './configs';
export * from './probe';
export * from './trial';
export * from './util';
export * from './verify';

/** Which platform interfaces this device exposes: the synchronous gate before the probe runs. */
export interface DeviceFeatures {
  readonly videoDecoder: boolean;
  readonly videoEncoder: boolean;
  readonly webgl2: boolean;
}

/**
 * RULE-22 presence gate: an interface the probe needs is missing entirely (e.g. the Gecko Android
 * browser), in the order of the rule. The full check is `deviceCheck(await probeCapabilities())`.
 * Implements: F-023.R1 (presence part).
 */
export function missingCapabilities(f: DeviceFeatures): Missing[] {
  const missing: Missing[] = [];
  if (!f.videoDecoder) missing.push('decode');
  if (!f.videoEncoder) missing.push('encode');
  if (!f.webgl2) missing.push('effects');
  return missing;
}

/** Reads the features from this browser (main thread or worker). Makes no request (F-023.R4). */
export function detectFeatures(): DeviceFeatures {
  const g = globalThis as Record<string, unknown>;
  let webgl2 = false;
  try {
    if (typeof g['OffscreenCanvas'] === 'function') {
      webgl2 = new OffscreenCanvas(1, 1).getContext('webgl2') !== null;
    }
  } catch {
    webgl2 = false;
  }
  return {
    videoDecoder: typeof g['VideoDecoder'] === 'function',
    videoEncoder: typeof g['VideoEncoder'] === 'function',
    webgl2,
  };
}

/**
 * The decoder configuration to use for a track: as given when supported, otherwise with software
 * decoding preferred (the hardware/software retry), or null when neither is supported. The container's
 * rotation and flip are removed so frames come out as stored; MOD-Compositor applies the rotation
 * (RULE-07 "computed on the rotated clip"). Implements: F-001.R2 (decode), RULE-22 (per-source refusal).
 */
export async function resolveVideoDecoderConfig(
  config: VideoDecoderConfig,
  api: Pick<CodecApi, 'VideoDecoder'> = browserCodecApi(),
): Promise<VideoDecoderConfig | null> {
  const { rotation: _r, flip: _f, ...plain } = config as VideoDecoderConfig & { rotation?: number; flip?: boolean };
  if (await supports(api.VideoDecoder, plain)) return plain;
  const soft: VideoDecoderConfig = { ...plain, hardwareAcceleration: 'prefer-software' };
  return (await supports(api.VideoDecoder, soft)) ? soft : null;
}

/** A configured `VideoDecoder` (MOD-Engine preview, MOD-Export reader). Use a resolved configuration. */
export function createVideoDecoder(
  config: VideoDecoderConfig,
  output: (frame: VideoFrame) => void,
  error: (e: Error) => void,
): VideoDecoder {
  const d = new VideoDecoder({ output, error: (e) => error(e) });
  d.configure(config);
  return d;
}

/**
 * A configured `VideoEncoder` for an export (MOD-Export). The configuration already carries the
 * session's working `latencyMode` and acceleration from the trial encode (ADR-0004 outcome item 6), so
 * the hardware/software retry happened there.
 */
export function createVideoEncoder(
  config: VideoEncoderConfig,
  output: EncodedVideoChunkOutputCallback,
  error: (e: Error) => void,
): VideoEncoder {
  const e = new VideoEncoder({ output, error: (x) => error(x) });
  e.configure(config);
  return e;
}

/** A configured `AudioEncoder` (export-audio worker). */
export function createAudioEncoder(
  config: AudioEncoderConfig,
  output: EncodedAudioChunkOutputCallback,
  error: (e: Error) => void,
): AudioEncoder {
  const e = new AudioEncoder({ output, error: (x) => error(x) });
  e.configure(config);
  return e;
}

/** A configured `AudioDecoder`; AAC descriptions are normalised first (ADR-0004 outcome item 4). */
export function createAudioDecoder(
  config: AudioDecoderConfig,
  output: (data: AudioData) => void,
  error: (e: Error) => void,
): AudioDecoder {
  const d = new AudioDecoder({ output, error: (x) => error(x) });
  d.configure(withNormalisedDescription(config));
  return d;
}
