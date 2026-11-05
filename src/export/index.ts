// MOD-Export — video, GIF and audio exports end to end (specs/40-technical/modules/MOD-Export.md,
// ADR-0010 and its outcome). The main-thread side: output settings from MOD-Core's tables, the panel's
// estimate (calibration encode in the idle export worker), sink choice, the two export workers, progress
// and time remaining, cancel by terminating both workers, interruption on a hidden page, and the
// hand-over of the finished file through a `blob:` URL and `<a download>` (never a `data:` URL; portal
// contract), followed by MOD-Scratch's 10 s rule. The workers themselves are ./export.worker.ts and
// ./export-audio.worker.ts; the export UI (MOD-App) uses only this file and MOD-Core's protocol.
// Implements: F-015.R1–R3/R5–R8, F-016.R2 (audio-only), F-019.R7; RULE-15, RULE-16, RULE-19 (signal),
// D-018, D-020; INV-01, INV-02; NFR-04, NFR-05, NFR-08, NFR-11.
import type { AudioFormat, VideoFormat } from '../codec';
import {
  AUDIO_ONLY_BPS,
  bitrateFor,
  estimateBytes,
  exportFileName,
  frameAspect,
  frameStart,
  gifOutputSize,
  MB,
  overheadBytes,
  predictedTargetBytes,
  projectFrames,
  sizeTargetPlan,
  targetVideoBps,
  videoOutputSize,
  VIDEO_AUDIO_BPS,
  deliveredBps,
  type Calibration,
  type EngineMedia,
  type ExportAudioSpec,
  type ExportOutput,
  type ExportSettings,
  type ExportStats,
  type FromExport,
  type FromExportAudio,
  type PcmSource,
  type Project,
  type TextBitmap,
  type ToExport,
  type ToExportAudio,
  type TrimInfo,
  type VideoResolution,
} from '../core';
import { voices } from '../plan';
import type { Scratch, ScratchFile } from '../scratch';
import { chooseSink, MEMORY_CAP, ROOM_FACTOR } from './sinks';
import { ABORT_ANSWER_MS, InterruptWatch, ProgressTracker, type ProgressView } from './watch';

export * from './sinks';
export * from './watch';
export { LateAudioMux, MemorySpill, type SpillStore } from './mux';
export { Dither, lossyAudio, mixBlocks, wavAudio, type AudioCodecs, type EncodedOut, type MixJob } from './audio-pass';

/** Created idle at start-up so a first export makes no request (architecture.md "Budgets"). */
export function startExportWorker(): Worker {
  return new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module', name: 'export' });
}

/** Created idle at start-up (ADR-0003 outcome: two workers per export). */
export function startExportAudioWorker(): Worker {
  return new Worker(new URL('./export-audio.worker.ts', import.meta.url), { type: 'module', name: 'export-audio' });
}

export interface WorkerPair {
  readonly video: Worker;
  readonly audio: Worker;
}

/**
 * The idle export worker pair. An export takes the pair and a fresh idle pair is started for the next
 * one (ADR-0003 §5: created per export, terminated after it; both created idle so an export makes no
 * request).
 */
export class ExportWorkers {
  private idle: WorkerPair;
  /** A calibration is running in the idle pair. */
  busy = false;
  constructor(
    private readonly spawn: () => WorkerPair = () => ({ video: startExportWorker(), audio: startExportAudioWorker() }),
  ) {
    this.idle = spawn();
  }
  /** The idle pair, kept idle (the estimate's calibration runs in it). */
  peek(): WorkerPair {
    return this.idle;
  }
  take(): WorkerPair {
    // An estimate still calibrating in the idle pair is dropped: the export starts on fresh workers.
    if (this.busy) this.renew();
    const pair = this.idle;
    this.idle = this.spawn();
    return pair;
  }
  /** Terminates the idle pair (cancelling a calibration) and starts a new one. */
  renew(): void {
    this.busy = false;
    terminate(this.idle);
    this.idle = this.spawn();
  }
}

const terminate = (p: WorkerPair): void => {
  p.video.terminate();
  p.audio.terminate();
};

/** What the start-up probe and the trial encodes recorded (MOD-Codec capability record). */
export interface ExportCaps {
  readonly videoFormat: VideoFormat | null;
  readonly audioFormat: AudioFormat;
  readonly video: {
    readonly latencyMode: 'quality' | 'realtime';
    readonly acceleration: 'no-preference' | 'prefer-software';
    readonly bitrateModes: readonly VideoEncoderBitrateMode[];
  };
  /** Per sound codec: the encoder delay (priming) and the delivered rate (WebKit AAC ignores `bitrate`). */
  readonly audio: Partial<
    Record<'aac' | 'opus', { readonly encoderDelay: number; readonly deliveredKbps: number | null }>
  >;
}

export interface ExportContext {
  readonly workers: ExportWorkers;
  readonly scratch: Scratch;
  readonly caps: ExportCaps;
  readonly media: readonly EngineMedia[];
  /** Decoded 48 kHz stereo sound per source (see build-spec-questions Q33). */
  readonly pcm: readonly PcmSource[];
  readonly looks: Readonly<Record<string, Uint8Array>>;
  /** Text layers rasterised for an output size (MOD-Preview's rasteriser, ADR-0012). */
  readonly texts: (width: number, height: number) => Readonly<Record<string, TextBitmap>>;
  readonly phone: boolean;
  /** The project's final sound gain per mix, shared by its video and audio-only exports (ADR-0008). */
  readonly gains: Map<string, number>;
  readonly visibility?: VisibilitySource;
  readonly now?: () => number;
  /** When the export finished (the RULE-15 file name); local time. */
  readonly clock?: () => Date;
  /** The hand-over; returns the object URL it made (default: `<a download>`). */
  readonly save?: (blob: Blob, fileName: string) => string;
  readonly setInterval?: (f: () => void, ms: number) => unknown;
  readonly clearInterval?: (id: unknown) => void;
}

export interface VisibilitySource {
  hidden(): boolean;
  onChange(f: () => void): () => void;
}

export const documentVisibility = (): VisibilitySource => ({
  hidden: () => document.visibilityState === 'hidden',
  onChange: (f) => {
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  },
});

/** Implements: RULE-15 / D-018 — the hand-over: a `blob:` URL clicked through `<a download>`. */
export function downloadBlob(blob: Blob, fileName: string): string {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  return url;
}

/** RULE-15 "Sound": included when any voice is unmuted, audible and has decoded sound. */
export function hasSound(project: Project, pcm: readonly PcmSource[]): boolean {
  const ids = new Set(pcm.map((p) => p.sourceId));
  return voices(project).some((v) => v.gain > 0 && ids.has(v.sourceId));
}

/** The mix's identity: the shared final gain applies to exports of the same mix (ADR-0008 outcome item 2). */
export const mixKey = (project: Project): string => JSON.stringify(voices(project));

function audioSpec(caps: ExportCaps, codec: 'aac' | 'opus', bitrate: number): ExportAudioSpec {
  return { codec, bitrate, encoderDelay: caps.audio[codec]?.encoderDelay ?? (codec === 'aac' ? 2112 : 312) };
}

/** Bits per second a sound track is expected to deliver (the probe's measured rate where known). */
function audioBps(caps: ExportCaps, spec: ExportAudioSpec | null): number {
  if (!spec) return 0;
  const delivered = caps.audio[spec.codec]?.deliveredKbps;
  return delivered ? delivered * 1000 : spec.bitrate;
}

export interface PlannedOutput {
  readonly output: ExportOutput;
  readonly ext: string;
  readonly frames: number;
  /** Nominal size before calibration (sink choice). */
  readonly nominalBytes: number;
}

/**
 * Implements: RULE-15 output, resolution and quality / size-target bitrate (VBR for quality levels,
 * CBR for a size target where the encoder has it), RULE-16 audio formats, ADR-0004 fallback order.
 */
export function planOutput(
  project: Project,
  settings: ExportSettings,
  caps: ExportCaps,
  sound: boolean,
): PlannedOutput {
  const rate = project.frame.frameRate;
  const frames = projectFrames(project);
  const seconds = frames / rate;
  if (settings.kind === 'video') {
    const f = caps.videoFormat;
    if (!f) throw new Error('NotSupportedError: no video output format on this device');
    const { width, height } = videoOutputSize(frameAspect(project), settings.resolution);
    const audio = sound && f.audio ? audioSpec(caps, f.audio, VIDEO_AUDIO_BPS) : null;
    const target = settings.targetMB ?? null;
    const constant = caps.video.bitrateModes.includes('constant');
    const bitrate =
      target !== null
        ? Math.max(1, Math.floor(targetVideoBps(target, seconds, audioBps(caps, audio))))
        : bitrateFor(settings.resolution, settings.quality, rate);
    const output: ExportOutput = {
      kind: 'video',
      video: {
        container: f.container,
        codec: f.video,
        width,
        height,
        rate,
        bitrate,
        bitrateMode: target !== null && constant ? 'constant' : 'variable',
        latencyMode: caps.video.latencyMode,
        acceleration: caps.video.acceleration,
      },
      audio,
      targetBytes: target !== null ? target * MB : null,
    };
    return {
      output,
      ext: f.container,
      frames,
      nominalBytes: estimateBytes({ cal: null, frames, rate, videoBps: bitrate, audioBps: audioBps(caps, audio) }),
    };
  }
  if (settings.kind === 'audio') {
    const fmt = settings.format === 'wav' ? 'wav' : caps.audioFormat.id;
    if (fmt === 'wav') {
      return {
        output: { kind: 'audio', container: 'wav', audio: null },
        ext: 'wav',
        frames,
        nominalBytes: 44 + Math.round(seconds * 48_000) * 4,
      };
    }
    const codec = fmt === 'm4a-aac' ? 'aac' : 'opus';
    const audio = audioSpec(caps, codec, AUDIO_ONLY_BPS[codec]);
    return {
      output: { kind: 'audio', container: codec === 'aac' ? 'm4a' : 'ogg', audio },
      ext: codec === 'aac' ? 'm4a' : 'ogg',
      frames,
      nominalBytes: Math.round((audioBps(caps, audio) * seconds) / 8 + overheadBytes(seconds)),
    };
  }
  // RULE-16 GIF: at most 15 s from `from`, its own size and rate, no sound.
  const end = frameStart(frames, rate);
  const from = Math.max(0, Math.min(settings.from, end));
  const length = Math.min(GIF_MAX_US, end - from);
  const gifFrames = Math.max(1, Math.ceil((length * settings.rate) / 1_000_000 - 1e-9));
  const { width, height } = gifOutputSize(frameAspect(project), settings.size);
  return {
    output: { kind: 'gif', width, height, rate: settings.rate, from, frames: gifFrames },
    ext: 'gif',
    frames: gifFrames,
    // A rough upper bound for the sink choice: ≤ 1 byte per pixel per frame.
    nominalBytes: width * height * gifFrames,
  };
}

/** RULE-16: a GIF covers at most 15 s. */
export const GIF_MAX_US = 15_000_000;

export interface EstimateResult {
  readonly bytes: number;
  readonly reachable: boolean;
  readonly suggestedResolution?: VideoResolution;
  readonly smallestTargetMB?: number;
}

/** Runs the calibration encode in the idle export worker (cancellable: `ctx.workers.renew()`). */
function calibrate(ctx: ExportContext, project: Project, output: ExportOutput): Promise<Calibration> {
  const worker = ctx.workers.peek().video;
  ctx.workers.busy = true;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<FromExport>): void => {
      if (e.data.type === 'export:calibration') {
        worker.removeEventListener('message', onMessage);
        ctx.workers.busy = false;
        resolve(e.data.cal);
      } else if (e.data.type === 'export:failed') {
        worker.removeEventListener('message', onMessage);
        ctx.workers.busy = false;
        reject(new Error(e.data.error.message));
      }
    };
    worker.addEventListener('message', onMessage);
    const { width, height } = output.kind === 'video' ? output.video : { width: 0, height: 0 };
    worker.postMessage({
      type: 'export:calibrate',
      job: { project, media: ctx.media, looks: ctx.looks, texts: ctx.texts(width, height), output },
    } satisfies ToExport);
  });
}

/**
 * Implements: F-015.R2 / AC11 (estimate within ±25 %: 3 × 2 s calibration capped at nominal) and the
 * size target's reachability (RULE-15, D-020, ADR-0010 outcome item 7: bitrate ≥ floor and the
 * target-rate pre-check predicts ≤ X; effective floor = max(table floor, delivered rate)).
 */
export async function estimate(
  project: Project,
  settings: ExportSettings,
  ctx: ExportContext,
): Promise<EstimateResult> {
  const sound = hasSound(project, ctx.pcm);
  const planned = planOutput(project, settings, ctx.caps, sound);
  if (planned.output.kind !== 'video' || settings.kind !== 'video')
    return { bytes: planned.nominalBytes, reachable: true };
  const out = planned.output;
  const rate = project.frame.frameRate;
  const aBps = audioBps(ctx.caps, out.audio);
  if (settings.targetMB === undefined) {
    const cal = await calibrate(ctx, project, out);
    return {
      bytes: estimateBytes({ cal, frames: planned.frames, rate, videoBps: out.video.bitrate, audioBps: aBps }),
      reachable: true,
    };
  }
  const offered = [480, 720, 1080, 1440, 2160].filter((r) => r <= settings.resolution) as VideoResolution[];
  const base = { targetMB: settings.targetMB, seconds: planned.frames / rate, rate, audioBps: aBps, offered };
  let plan = sizeTargetPlan({ ...base, resolution: settings.resolution });
  if (plan.reachable) {
    const cal = await calibrate(ctx, project, out);
    const predicted = predictedTargetBytes(cal, planned.frames, rate, aBps);
    if (predicted > settings.targetMB * MB) {
      plan = sizeTargetPlan({
        ...base,
        resolution: settings.resolution,
        delivered: { [settings.resolution]: Math.max(deliveredBps(cal, rate), out.video.bitrate + 1) },
      });
    } else return { bytes: Math.min(predicted, settings.targetMB * MB), reachable: true };
  }
  return {
    bytes: settings.targetMB * MB,
    reachable: false,
    ...(plan.suggestedResolution ? { suggestedResolution: plan.suggestedResolution } : {}),
    ...(plan.smallestTargetMB ? { smallestTargetMB: plan.smallestTargetMB } : {}),
  };
}

/** The COPY IDs an export can end with (MOD-App shows them). */
export type ExportErrorId = 'error.export_failed' | 'error.export_interrupted' | 'error.no_space';

export type ExportResult =
  | {
      readonly ok: true;
      readonly fileName: string;
      readonly bytes: number;
      readonly stats: ExportStats;
      readonly trim: TrimInfo | null;
      /** RULE-19: a video or audio export clears unexported changes; a GIF never does. */
      readonly fullProject: boolean;
    }
  | { readonly ok: false; readonly error: ExportErrorId | 'cancelled'; readonly detail?: string };

export interface ExportHandle {
  onProgress(f: (v: ProgressView) => void): void;
  /** Stops within 1 s: both workers terminated, scratch deleted (NFR-11). */
  cancel(): Promise<void>;
  readonly result: Promise<ExportResult>;
  /** Settles when the workers are gone and a failed or cancelled export's scratch is deleted. */
  readonly cleaned: Promise<void>;
  /** The scratch file in use (tests, storage inspection). */
  readonly scratchFile: ScratchFile | null;
}

/** Wall-clock checks of the interruption rules (ADR-0010 outcome item 10). */
export const WATCH_MS = 250;

/**
 * Implements: F-015.R1/R3/R5/R6/R7, F-016.R2, NFR-11 — runs one export: sink choice (or
 * COPY-error.no_space), both workers, progress, interruption, cancel and the hand-over.
 */
export async function start(project: Project, settings: ExportSettings, ctx: ExportContext): Promise<ExportHandle> {
  const now = ctx.now ?? (() => Date.now());
  const listeners: ((v: ProgressView) => void)[] = [];
  const tracker = new ProgressTracker();
  const vis = ctx.visibility ?? documentVisibility();
  const watch = new InterruptWatch(now(), vis.hidden());
  let finish: (r: ExportResult) => void = () => undefined;
  const result = new Promise<ExportResult>((r) => (finish = r));
  let settled = false;

  await ctx.scratch.cleanup(); // ADR-0010 outcome item 6: the next export deletes due files
  const sound = hasSound(project, ctx.pcm);
  let planned: PlannedOutput;
  try {
    planned = planOutput(project, settings, ctx.caps, sound);
  } catch (e) {
    return failedHandle({ ok: false, error: 'error.export_failed', detail: String(e) });
  }
  const room = ctx.scratch.available && (await ctx.scratch.hasRoom(planned.nominalBytes * ROOM_FACTOR));
  const kind = chooseSink({
    opfs: ctx.scratch.available,
    room,
    estimate: planned.nominalBytes,
    cap: ctx.phone ? MEMORY_CAP.phone : MEMORY_CAP.laptop,
  });
  if (kind === 'no_space') return failedHandle({ ok: false, error: 'error.no_space' });
  const memoryAllowed = planned.nominalBytes * ROOM_FACTOR < (ctx.phone ? MEMORY_CAP.phone : MEMORY_CAP.laptop);
  const file = kind === 'scratch' ? ctx.scratch.create() : null;
  const pair = ctx.workers.take();
  const needsAudio =
    planned.output.kind === 'audio' || (planned.output.kind === 'video' && planned.output.audio !== null);
  const channel = needsAudio ? new MessageChannel() : null;
  const out = planned.output;
  const { width, height } = out.kind === 'video' ? out.video : { width: 0, height: 0 };
  const audioCodec =
    out.kind === 'audio' && out.container === 'wav' ? 'pcm16' : out.kind !== 'gif' ? out.audio?.codec : undefined;
  const key = mixKey(project);
  const lossy = audioCodec === 'aac' || audioCodec === 'opus';
  let trim: TrimInfo | null = null;

  const stopTimers: (() => void)[] = [];
  let cleaned: Promise<void> = Promise.resolve();
  /**
   * The result is reported at once (cancel within 1 s, NFR-11; the message at detection, ADR-0010
   * outcome item 10); behind it the export worker closes and deletes its scratch files, both workers are
   * terminated (after 1.5 s without an answer) and the files are deleted again in case it could not.
   */
  const end = (r: ExportResult, keepFile = false): Promise<void> => {
    if (settled) return cleaned;
    settled = true;
    for (const s of stopTimers) s();
    finish(r);
    cleaned = (async () => {
      if (!keepFile) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, ABORT_ANSWER_MS);
          pair.video.addEventListener('message', (e: MessageEvent<FromExport>) => {
            if (e.data.type === 'export:aborted') {
              clearTimeout(timer);
              resolve();
            }
          });
          pair.video.postMessage({ type: 'export:abort' } satisfies ToExport);
        });
      }
      terminate(pair);
      if (!keepFile && file) await file.discard();
    })();
    return cleaned;
  };
  const fail = (kindOf: 'encoder' | 'webgl' | 'other', detail: string): void => {
    const interrupted = (kindOf === 'encoder' || kindOf === 'webgl') && watch.errorKind() === 'interrupted';
    void end({ ok: false, error: interrupted ? 'error.export_interrupted' : 'error.export_failed', detail });
  };
  const progress = (done: number, total: number): void => {
    watch.progress(now());
    const v = tracker.update(done, total, now());
    for (const l of listeners) l(v);
  };

  pair.video.addEventListener('message', (e: MessageEvent<FromExport>) => {
    const m = e.data;
    if (settled) return;
    if (m.type === 'export:progress' && out.kind === 'video') progress(m.done, m.total);
    else if (m.type === 'export:failed')
      fail(m.error.kind === 'encoder' || m.error.kind === 'webgl' ? m.error.kind : 'other', m.error.message);
    else if (m.type === 'export:done') void handOver(m.blob, m.bytes, m.stats);
  });
  pair.audio.onmessage = (e: MessageEvent<FromExportAudio>) => {
    const m = e.data;
    if (settled) return;
    if (m.type === 'exportAudio:progress' && out.kind === 'audio') progress(m.done, m.total);
    else if (m.type === 'exportAudio:done') {
      trim = m.trim;
      if (lossy && m.trim) ctx.gains.set(key, m.trim.gainDb);
    } else if (m.type === 'exportAudio:failed') fail('other', m.message);
  };
  const handOver = async (blob: Blob | null, bytes: number, stats: ExportStats): Promise<void> => {
    try {
      const data = blob ?? (file ? await file.file() : null);
      if (!data) throw new Error('NotFoundError: no file');
      const fileName = exportFileName((ctx.clock ?? (() => new Date()))(), planned.ext);
      for (const l of listeners) l(tracker.done());
      const url = (ctx.save ?? downloadBlob)(data, fileName);
      // ADR-0010 outcome item 6: nothing revoked or deleted for 10 s after the click.
      if (file) file.handedOver(url);
      else setTimeout(() => URL.revokeObjectURL(url), 10_000);
      void end({ ok: true, fileName, bytes, stats, trim, fullProject: out.kind !== 'gif' }, true);
    } catch (e) {
      fail('other', String(e));
    }
  };

  const setI = ctx.setInterval ?? ((f: () => void, ms: number) => setInterval(f, ms));
  const clearI = ctx.clearInterval ?? ((id: unknown) => clearInterval(id as number));
  const timer = setI(() => {
    if (!settled && watch.interrupted(now())) void end({ ok: false, error: 'error.export_interrupted' });
  }, WATCH_MS);
  stopTimers.push(() => clearI(timer));
  stopTimers.push(vis.onChange(() => watch.visibility(vis.hidden(), now())));

  if (channel && audioCodec) {
    pair.audio.postMessage(
      {
        type: 'exportAudio:start',
        project,
        pcm: ctx.pcm,
        codec: audioCodec,
        bitrate: out.kind !== 'gif' ? (out.audio?.bitrate ?? 0) : 0,
        encoderDelay: out.kind !== 'gif' ? (out.audio?.encoderDelay ?? 0) : 0,
        gainDb: lossy ? (ctx.gains.get(key) ?? null) : null,
        port: channel.port2,
      } satisfies ToExportAudio,
      [channel.port2],
    );
  }
  pair.video.postMessage(
    {
      type: 'export:start',
      job: {
        project,
        media: ctx.media,
        looks: ctx.looks,
        texts: ctx.texts(width, height),
        output: out,
        sink: file
          ? { kind: 'scratch', name: file.name, spill: file.spill, memoryFallback: memoryAllowed }
          : { kind: 'memory' },
        audio: channel ? channel.port1 : null,
      },
    } satisfies ToExport,
    channel ? [channel.port1] : [],
  );

  return {
    onProgress: (f) => void listeners.push(f),
    cancel: async () => void end({ ok: false, error: 'cancelled' }),
    result,
    get cleaned() {
      return cleaned;
    },
    scratchFile: file,
  };
}

function failedHandle(r: ExportResult): ExportHandle {
  return {
    onProgress: () => undefined,
    cancel: async () => undefined,
    result: Promise.resolve(r),
    cleaned: Promise.resolve(),
    scratchFile: null,
  };
}
