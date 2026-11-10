// MOD-Core — the engine worker's messages (ADR-0003 §2: "the main thread sends ticks, project
// snapshots and text bitmaps; the worker answers with 'frame shown at t' and errors"; MOD-Engine
// public surface). Typed here so MOD-Preview (main thread) and MOD-Engine (worker) share one protocol
// without importing each other. Types only; no runtime code.
import type { Micros } from './time';
import type { Project } from './project.gen';

/** A source the engine can draw: a video file read in pieces, or a decoded photo (ADR-0009 §1–2). */
export type EngineMedia =
  | { readonly id: string; readonly kind: 'video'; readonly file: Blob }
  | { readonly id: string; readonly kind: 'photo'; readonly bitmap: ImageBitmap };

/** A rasterised text layer (ADR-0012): premultiplied pixels made for an output whose shorter side is `s`. */
export interface TextBitmap {
  readonly bitmap: ImageBitmap;
  /** The output shorter side (px) the bitmap was rasterised for; other sizes scale it. */
  readonly s: number;
}

/** Screen-only extras drawn after `paint` in the preview (ADR-0006 §5); never in an export. */
export interface Overlay {
  /** Lines in frame fractions (0..1 from the top-left), `width` in device pixels, colour RGBA 0..1. */
  readonly lines: readonly {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
    readonly width: number;
    readonly colour: readonly [number, number, number, number];
  }[];
}

/** Main thread → engine worker. */
export type ToEngine =
  | { readonly type: 'hello' }
  /** Once: the preview canvas (transferred) and its first size in device pixels. */
  | {
      readonly type: 'engine:canvas';
      readonly canvas: OffscreenCanvas;
      readonly width: number;
      readonly height: number;
    }
  | { readonly type: 'engine:resize'; readonly width: number; readonly height: number }
  /** Look tables: 33³ RGBA bytes indexed ((b·33 + g)·33 + r)·4 (ADR-0007 §3). */
  | { readonly type: 'engine:looks'; readonly tables: Readonly<Record<string, Uint8Array>> }
  /** The whole media list (tests, harness). A source id keeps its file for the session, so ids that stay keep their decoders. */
  | { readonly type: 'engine:media'; readonly media: readonly EngineMedia[] }
  /** Media changes by source id (MOD-App): only new sources travel, so nothing that stays is cloned or reopened. */
  | {
      readonly type: 'engine:mediaChanges';
      readonly add: readonly EngineMedia[];
      readonly remove: readonly string[];
    }
  | { readonly type: 'engine:setProject'; readonly project: Project }
  /** A wanted project time: the audio clock while playing, the playhead while paused. */
  | { readonly type: 'engine:tick'; readonly t: Micros; readonly playing: boolean }
  /** Seek or scrub: coarse first, then the exact frame (NFR-03). Latest wins. */
  | { readonly type: 'engine:seek'; readonly t: Micros }
  | { readonly type: 'engine:setTextBitmaps'; readonly bitmaps: Readonly<Record<string, TextBitmap>> }
  /** Compare hold (RULE-08): the clip drawn without adjustments and look; null ends it. */
  | { readonly type: 'engine:compare'; readonly clipId: string | null }
  | { readonly type: 'engine:overlay'; readonly overlay: Overlay | null }
  /** RULE-22 effects check, run in this worker (platform-mapping "Start-up check"). */
  | { readonly type: 'engine:effectsCheck' }
  | { readonly type: 'engine:lookThumbnails'; readonly clipId: string }
  /** Statistics of the playback so far (tests and NFR-03 measurement). */
  | { readonly type: 'engine:stats' }
  /** Releases every decoder, decoded frame and coarse copy (before an export, ADR-0003 §5); the compositor and its context stay. */
  | { readonly type: 'engine:release' };

export interface EngineStats {
  readonly painted: number;
  /** Project frames passed over while playing (the device could not keep up). */
  readonly skipped: number;
  /** Paints that showed an older frame than wanted while playing (slow decode). */
  readonly inexact: number;
  readonly restarts: number;
  readonly flushes: number;
  readonly openFrames: number;
  readonly contextLosses: number;
  readonly recoveries: number;
}

/** Engine worker → main thread (MOD-Engine events). */
export type FromEngine =
  | { readonly type: 'hello'; readonly worker: 'engine'; readonly protocol: number }
  /** The picture of project time `t` (frame `frameIndex`) is on screen; `exact` false for a coarse paint. */
  | {
      readonly type: 'engine:frameShown';
      readonly t: Micros;
      readonly frameIndex: number;
      readonly exact: boolean;
    }
  /** No picture could be produced for the wanted time while playing. */
  | { readonly type: 'engine:stalled'; readonly t: Micros }
  | { readonly type: 'engine:sourceError'; readonly id: string }
  /** The source decodes slower than real time (RULE-22: COPY-notice.slow_device once per session). */
  | { readonly type: 'engine:slowSource'; readonly id: string }
  /** RULE-22, first answer: the effect chain compiled and drew its first frame (false: it can't). */
  | { readonly type: 'engine:effectsDrawn'; readonly ok: boolean }
  | { readonly type: 'engine:effects'; readonly ok: boolean; readonly fps: number; readonly slow: boolean }
  | { readonly type: 'engine:contextLost' }
  | { readonly type: 'engine:contextRestored' }
  /** The preview could not be recovered after the retries (ADR-0006 outcome item 6). */
  | { readonly type: 'engine:contextFailed' }
  | { readonly type: 'engine:stats'; readonly stats: EngineStats }
  | { readonly type: 'engine:error'; readonly message: string };
