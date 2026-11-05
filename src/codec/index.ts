// MOD-Codec — capability probe, decoder and encoder setup, output format choice
// (specs/40-technical/modules/MOD-Codec.md, ADR-0004 and its outcome). The probe, the export grid,
// the trial encodes, the first-packet decode check and the format choice are built (E2); creating
// the playback and export coders comes with MOD-Engine (E3) and MOD-Export (E5).
import { notImplemented } from '../core';
import type { Missing } from './probe';

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

// Coder creation with the hardware/software retry — built with MOD-Engine (E3) and MOD-Export (E5).
export const createVideoDecoder = (_config: VideoDecoderConfig): never =>
  notImplemented('MOD-Codec createVideoDecoder');
export const createVideoEncoder = (_config: VideoEncoderConfig): never =>
  notImplemented('MOD-Codec createVideoEncoder');
export const createAudioDecoder = (_config: AudioDecoderConfig): never =>
  notImplemented('MOD-Codec createAudioDecoder');
export const createAudioEncoder = (_config: AudioEncoderConfig): never =>
  notImplemented('MOD-Codec createAudioEncoder');
