// MOD-Core — the export workers' messages (ADR-0003 §5 and outcome: an export (video) worker and an
// export-audio worker per export; ADR-0010). Typed here so MOD-Export's main-thread side and its two
// workers share one protocol, and the export UI (MOD-App) never imports a worker. Types only.
import type { Calibration } from './export';
import type { EngineMedia, TextBitmap } from './engine-protocol';
import type { FrameRate, Micros } from './time';
import type { Project } from './project.gen';

/** What the next export produces (ENT-ExportSettings; RULE-15, RULE-16). Kept for the session. */
export type ExportSettings =
  | {
      readonly kind: 'video';
      readonly resolution: 480 | 720 | 1080 | 1440 | 2160;
      readonly quality: 'smaller' | 'balanced' | 'best';
      /** "Under X MB" (whole MB, 1–4000); replaces the quality level when set. */
      readonly targetMB?: number;
    }
  | { readonly kind: 'gif'; readonly size: 320 | 480 | 640; readonly rate: 10 | 15; readonly from: Micros }
  | { readonly kind: 'audio'; readonly format: 'compressed' | 'wav' };

/** The video encoder an export uses (MOD-Codec trial record + MOD-Core tables). */
export interface ExportVideoSpec {
  readonly container: 'mp4' | 'webm';
  readonly codec: 'h264' | 'vp9' | 'vp8';
  readonly width: number;
  readonly height: number;
  readonly rate: FrameRate;
  readonly bitrate: number;
  readonly bitrateMode: 'variable' | 'constant';
  readonly latencyMode: 'quality' | 'realtime';
  readonly acceleration: 'no-preference' | 'prefer-software';
}

/** The sound encoder an export uses; `encoderDelay` from the trial encode (priming, edit list). */
export interface ExportAudioSpec {
  readonly codec: 'aac' | 'opus';
  readonly bitrate: number;
  readonly encoderDelay: number;
}

export type ExportOutput =
  | {
      readonly kind: 'video';
      readonly video: ExportVideoSpec;
      readonly audio: ExportAudioSpec | null;
      /** A size target in bytes (X × 1,000,000): never handed over above it (F-015.AC10). */
      readonly targetBytes: number | null;
    }
  | { readonly kind: 'audio'; readonly container: 'm4a' | 'ogg' | 'wav'; readonly audio: ExportAudioSpec | null }
  | {
      readonly kind: 'gif';
      readonly width: number;
      readonly height: number;
      readonly rate: 10 | 15;
      readonly from: Micros;
      readonly frames: number;
    };

/** Where the bytes go (ADR-0010 §2 and outcome item 5). */
export type SinkChoice =
  | {
      readonly kind: 'scratch';
      readonly name: string;
      /** The spill file: encoded video waiting for the verified sound (ADR-0010 outcome item 1). */
      readonly spill: string;
      readonly memoryFallback: boolean;
    }
  | { readonly kind: 'memory' };

export interface ExportJob {
  readonly project: Project;
  readonly media: readonly EngineMedia[];
  /** Look tables: 33³ RGBA bytes (as `engine:looks`). */
  readonly looks: Readonly<Record<string, Uint8Array>>;
  /** Text layers rasterised at the output size (ADR-0012). */
  readonly texts: Readonly<Record<string, TextBitmap>>;
  readonly output: ExportOutput;
  readonly sink: SinkChoice;
  /** The channel from the export-audio worker (null when the export has no sound). */
  readonly audio: MessagePort | null;
}

/** Why an export stopped. `kind` decides the message: interrupted/failed/no_space (main side). */
export interface ExportFailure {
  readonly kind: 'encoder' | 'webgl' | 'source' | 'sink' | 'no_space' | 'over_target' | 'audio' | 'internal';
  /** `name: message` (ADR-0010 outcome item 2: WebKit's stack omits the message). */
  readonly message: string;
}

export interface ExportStats {
  readonly frames: number;
  /** Encode passes (2 after the size target's corrective pass). */
  readonly passes: number;
  readonly bitrates: readonly number[];
  readonly wallMs: number;
  /** Time spent wrapping the canvas as a VideoFrame (≈ 70 % of phone export time, risk 3a). */
  readonly wrapMs: number;
  readonly paintMs: number;
  readonly decodeMs: number;
  readonly encodeWaitMs: number;
  /** Longest gap between encoder outputs (stall watchdog, ADR-0010 outcome item 2). */
  readonly longestOutputGapMs: number;
  /** Encoded video written to the spill file while the sound was not ready (G3 risk 5). */
  readonly spilledBytes: number;
  /** Most encoded video held in memory at once by the muxer stage (must stay ~0). */
  readonly heldVideoBytesMax: number;
  /** Encoder re-creations after a stall (ADR-0010 outcome item 2). */
  readonly encoderRestarts: number;
  readonly sink: 'scratch' | 'memory';
}

/** Main thread → export worker. */
export type ToExport =
  | { readonly type: 'hello' }
  | { readonly type: 'export:start'; readonly job: ExportJob }
  /** Cancel or interruption: close and delete the scratch files now, then answer (ADR-0010 outcome item 10). */
  | { readonly type: 'export:abort' }
  /** The 3 × 2 s calibration encode for the estimate or a size target's pre-check. */
  | { readonly type: 'export:calibrate'; readonly id: number; readonly job: Omit<ExportJob, 'sink' | 'audio'> };

/** Export worker → main thread. */
export type FromExport =
  | { readonly type: 'hello'; readonly worker: 'export'; readonly protocol: number }
  /** Frames muxed so far over every pass (`total` grows when the corrective pass starts). */
  | { readonly type: 'export:progress'; readonly done: number; readonly total: number }
  /** Liveness during phases without frame progress (waiting for the sound, replay, index). */
  | { readonly type: 'export:alive' }
  | {
      readonly type: 'export:done';
      readonly bytes: number;
      /** The memory sink's file; null when the file is the scratch file `job.sink.name`. */
      readonly blob: Blob | null;
      readonly stats: ExportStats;
      /** The sound's verify-and-trim result, relayed over the port (null without lossy sound). */
      readonly trim: TrimInfo | null;
    }
  | { readonly type: 'export:failed'; readonly error: ExportFailure }
  /** The scratch handles are closed and the files deleted; the worker can be terminated. */
  | { readonly type: 'export:aborted' }
  | { readonly type: 'export:calibration'; readonly id: number; readonly cal: Calibration }
  | { readonly type: 'export:calibrationFailed'; readonly id: number; readonly message: string };

/** A decoded 48 kHz stereo source for the mix (until windowed decoding, as `audio:pcm`). */
export interface PcmSource {
  readonly sourceId: string;
  readonly L: Float32Array;
  readonly R: Float32Array;
}

/** Main thread → export-audio worker. */
export type ToExportAudio =
  | { readonly type: 'hello' }
  | {
      readonly type: 'exportAudio:start';
      readonly project: Project;
      readonly pcm: readonly PcmSource[];
      /** `pcm16` = the WAV writer (RULE-16). */
      readonly codec: 'aac' | 'opus' | 'pcm16';
      readonly bitrate: number;
      readonly encoderDelay: number;
      /** The project's final gain from an earlier export of the same mix (shared by every export, ADR-0008). */
      readonly gainDb: number | null;
      /** To the export worker. */
      readonly port: MessagePort;
    };

/** One encoded sound packet; times in seconds, already shifted by the encoder delay (edit list). */
export interface AudioPacketData {
  readonly data: Uint8Array;
  readonly timestamp: number;
  readonly duration: number;
  readonly key: boolean;
}

/** Export-audio worker → export worker (over the port). */
export type AudioPortMessage =
  | {
      readonly type: 'packets';
      readonly decoderConfig: AudioDecoderConfig;
      readonly packets: readonly AudioPacketData[];
      readonly trim: TrimInfo;
    }
  /** WAV: the bytes after the 44-byte header, in order. */
  | { readonly type: 'pcm'; readonly bytes: Uint8Array }
  | { readonly type: 'end'; readonly frames: number; readonly trim: TrimInfo }
  /** Liveness while mixing, encoding and verifying (the export worker's sound-wait watchdog). */
  | { readonly type: 'alive' }
  /** `encoder`: a sound encoder/decoder error (rule (c) after a hide); `other` otherwise. */
  | { readonly type: 'failed'; readonly kind: 'encoder' | 'other'; readonly message: string };

export interface TrimInfo {
  readonly gainDb: number;
  readonly peakDb: number | null;
  readonly passes: number;
  readonly fallback: boolean;
}

/** Export-audio worker → main thread. */
export type FromExportAudio =
  | { readonly type: 'hello'; readonly worker: 'export-audio'; readonly protocol: number }
  /** Samples mixed in the current pass (audio-only progress). */
  | { readonly type: 'exportAudio:progress'; readonly done: number; readonly total: number }
  /** Liveness while mixing, encoding and verifying (counts for the interruption rules). */
  | { readonly type: 'exportAudio:alive' }
  | { readonly type: 'exportAudio:done'; readonly trim: TrimInfo | null }
  | { readonly type: 'exportAudio:failed'; readonly kind: 'encoder' | 'other'; readonly message: string };
