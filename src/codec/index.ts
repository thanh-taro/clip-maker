// MOD-Codec — capability probe, decoder and encoder setup, output format choice
// (specs/40-technical/modules/MOD-Codec.md, ADR-0004). Phase 3.3 scaffold: the device-support check
// is a presence check of the APIs RULE-22 needs; the real probe (decode/encode configs at 1080p, the
// timed effects check in the engine worker, ≤ 300 ms) is built with F-023.
import { notImplemented } from '../core';

/** A RULE-22 check that failed; each maps to its COPY-unsupported.missing_* text. */
export type Missing = 'decode' | 'encode' | 'effects';

/** Which platform features this device exposes (the input of the RULE-22 decision). */
export interface DeviceFeatures {
  readonly videoDecoder: boolean;
  readonly videoEncoder: boolean;
  readonly webgl2: boolean;
}

/**
 * RULE-22 (scaffold): every capability the device lacks, in the order of the rule. An empty list
 * means the editor opens. Implements: F-023.R1 (presence part only; the probe replaces it in phase 4).
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

/** The full start-up probe (RULE-22, ADR-0004 outcome) — built with F-023. */
export const probeCapabilities = (): Promise<never> => notImplemented('MOD-Codec probeCapabilities');
export const probeExportGrid = (_codec: string): Promise<never> => notImplemented('MOD-Codec probeExportGrid');
export const chooseVideoFormat = (_caps: unknown, _hasSound: boolean): never =>
  notImplemented('MOD-Codec chooseVideoFormat');
export const chooseAudioFormat = (_caps: unknown): never => notImplemented('MOD-Codec chooseAudioFormat');
