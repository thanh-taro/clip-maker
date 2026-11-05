// MOD-Audio — the deterministic mixer, time-stretch, limiter, playback clock and WAV writer
// (specs/40-technical/modules/MOD-Audio.md, ADR-0008 and its outcome). Also starts the audio and
// export-audio workers and names the worklet module's URL.
// Not yet here: windowed decoding, stereo mapping and 48 kHz resampling (they arrive with
// MOD-Container/MOD-Codec, ADR-0008 §2/§6) and the picker audition (F-011).
// The worklet is bundled as its own hashed same-origin module (ADR-0003; CSP `script-src 'self'`).
import workletUrl from './playback.worklet.ts?worker&url';

/** URL of the AudioWorklet module, for `audioContext.audioWorklet.addModule` in the first gesture. */
export const WORKLET_URL: string = workletUrl;

export function startAudioWorker(): Worker {
  return new Worker(new URL('./audio.worker.ts', import.meta.url), { type: 'module', name: 'audio' });
}

/** Created idle at start-up so a first export makes no request (ADR-0003 outcome). */
export function startExportAudioWorker(): Worker {
  return new Worker(new URL('./export-audio.worker.ts', import.meta.url), { type: 'module', name: 'export-audio' });
}

export { render, renderOffline, Mixer, LIMITER_PREROLL, originOf, type MixerOptions } from './mixer';
export { Limiter, LIMITER_CEILING_DB, LIMITER_LOOKAHEAD, LIMITER_RELEASE_MS } from './limiter';
export { truePeak, BS1770_METER, SIDE_CHAIN, designInterpolator, dbOf, linearOf, type Interpolator } from './truepeak';
export { createStretcher, seekDecodeFrom, Wsola, type Stretcher } from './wsola';
export { pcmSource, bankOf, type SoundSource, type SourceBank } from './source';
export { verifyAndTrim, TRIM_LIMIT_DB, TRIM_TARGET_DB, TRIM_MAX_PASSES, type TrimPass, type TrimResult } from './trim';
export { wavHeader, wavData, encodeWav, pcm16, WAV_HEADER_BYTES } from './wav';
export { Streamer, sampleAt, endSampleOf } from './stream';
export { Playback, boundedResume, browserEnv, type AudioEnv, type PlaybackState } from './playback';
export * from './protocol';
