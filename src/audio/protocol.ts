// MOD-Audio — messages between the main thread, the audio worker and the playback worklet
// (ADR-0003 §3, ADR-0008 §5 and outcome rule 6). Blocks travel as transferred ArrayBuffers over a
// MessagePort between the worker and the worklet; no SharedArrayBuffer (ADR-0003 §6).
// No runtime imports: the worklet bundle includes this file and must stay free of MOD-Core's tables.
import type { Micros, Project } from '../core';

/** Samples the audio worker keeps queued ahead of the worklet (ADR-0008 outcome: 400 ms). */
export const PLAYBACK_LEAD = 19_200; // 0.4 s × 48 kHz (MOD-Plan SAMPLE_RATE)
/** Samples per block sent to the worklet. */
export const PLAYBACK_BLOCK = 1024;
/** The processor name the worklet registers. */
export const PROCESSOR_NAME = 'clipmaker-playback';
/** Bounded wait for `AudioContext.resume()` (ADR-0008 outcome rule 7; WebKit may never settle). */
export const RESUME_TIMEOUT_MS = 2000;

/** Main thread → audio worker. */
export type ToAudioWorker =
  | { readonly type: 'hello' }
  /** The worker's end of the channel to the worklet. */
  | { readonly type: 'audio:port'; readonly port: MessagePort }
  /** The audio worker's end of the sound feed from the engine worker (ADR-0008 §6, MOD-Core `FeedRequest`). */
  | { readonly type: 'audio:feed'; readonly port: MessagePort }
  /** A source's sound given whole as 48 kHz stereo (tests); it takes the place of decoding that source. */
  | { readonly type: 'audio:pcm'; readonly sourceId: string; readonly L: Float32Array; readonly R: Float32Array }
  | { readonly type: 'audio:setProject'; readonly project: Project }
  | { readonly type: 'audio:play'; readonly from: Micros; readonly gen: number }
  | { readonly type: 'audio:pause'; readonly gen: number }
  | { readonly type: 'audio:seek'; readonly t: Micros; readonly gen: number }
  /**
   * F-011.R1 / ADR-0008 §7: the picker plays bundled track `trackId` (`length` 48 kHz samples) from its
   * start through the same mixer, as a one-voice plan; the project's mix waits meanwhile.
   */
  | { readonly type: 'audio:audition'; readonly trackId: string; readonly length: number; readonly gen: number }
  /** The audition stops: the project's mix is back, paused at project time `t`. */
  | { readonly type: 'audio:auditionStop'; readonly t: Micros; readonly gen: number };

/** Audio worker → worklet (over the channel). Blocks of an older generation are dropped (flush). */
export type ToWorklet =
  | { readonly type: 'flush'; readonly gen: number; readonly from: number }
  | {
      readonly type: 'block';
      readonly gen: number;
      readonly from: number;
      readonly L: Float32Array;
      readonly R: Float32Array;
    }
  | { readonly type: 'end'; readonly gen: number; readonly at: number };

/** Worklet → audio worker (over the channel): samples of the generation played so far. */
export type FromWorkletToWorker = { readonly type: 'played'; readonly gen: number; readonly played: number };

/** Main thread → worklet (node.port). */
export type ToWorkletNode = { readonly type: 'connect'; readonly port: MessagePort } | { readonly type: 'stats' };

/** Worklet → main thread (node.port). */
export type FromWorkletNode =
  /** At context frame `frame` the worklet started outputting project sample `sample` (master clock). */
  | { readonly type: 'position'; readonly gen: number; readonly sample: number; readonly frame: number }
  | { readonly type: 'ended'; readonly gen: number; readonly sample: number }
  | { readonly type: 'stats'; readonly stats: WorkletStats };

export interface WorkletStats {
  /** Render quanta that could not be filled while playing (underruns). */
  readonly underrunQuanta: number;
  /** Separate underrun events. */
  readonly underrunEvents: number;
  /** Lowest queued samples seen while playing (the low-water mark). */
  readonly lowWater: number;
  readonly played: number;
  /** FNV-1a of the samples played since the last flush (L then R per block; tests compare it to a render). */
  readonly hashL: string;
  readonly hashR: string;
  readonly hashed: number;
}
