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
  floorFor,
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
  estimateGifBytes,
  type Calibration,
  type EngineMedia,
  type ExportAudioSpec,
  type ExportFailure,
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
  scriptUrl,
  type VideoResolution,
} from '../core';
import { voices } from '../plan';
import type { ScratchFile } from '../scratch';
import type { Scratch } from '../scratch';
import { chooseSink, MEMORY_CAP, ROOM_FACTOR } from './sinks';
import { ABORT_ANSWER_MS, InterruptWatch, ProgressTracker, type ProgressView } from './watch';
import exportWorkerUrl from './export.worker.ts?worker&url';
import exportAudioWorkerUrl from './export-audio.worker.ts?worker&url';

// MOD-App reaches MOD-Scratch's start-up and the Scratch type through MOD-Export (import boundaries).
export { initScratch, Scratch, browserScratchEnv } from '../scratch';
export * from './sinks';
export * from './watch';
export { LateAudioMux, MemorySpill, type SpillStore } from './mux';
export { Dither, lossyAudio, mixBlocks, wavAudio, type AudioCodecs, type EncodedOut, type MixJob } from './audio-pass';

/** Created idle at start-up so a first export makes no request (architecture.md "Budgets"). */
export function startExportWorker(): Worker {
  return new Worker(scriptUrl(exportWorkerUrl), { type: 'module', name: 'export' });
}

/** Created idle at start-up (ADR-0003 outcome: two workers per export). */
export function startExportAudioWorker(): Worker {
  return new Worker(scriptUrl(exportAudioWorkerUrl), { type: 'module', name: 'export-audio' });
}

export interface WorkerPair {
  readonly video: Worker;
  readonly audio: Worker;
}

/**
 * The one owner of the export workers (MOD-App starts it at boot). An export takes the idle pair and a
 * fresh idle pair is started for the next one (ADR-0003 §5: created per export, terminated after it; both
 * created idle so an export makes no request). The estimate's calibrations run one at a time in the idle
 * export worker, each tagged with an id so a stale answer never settles a newer request; taking or
 * renewing the pair rejects the calibrations still pending.
 */
export class ExportWorkers {
  private idle: WorkerPair;
  private nextId = 1;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly pending = new Map<
    number,
    { resolve: (c: Calibration) => void; reject: (e: Error) => void; post: () => void }
  >();

  constructor(
    private readonly spawn: () => WorkerPair = () => ({ video: startExportWorker(), audio: startExportAudioWorker() }),
  ) {
    this.idle = this.start();
  }

  private start(): WorkerPair {
    const pair = this.spawn();
    pair.video.addEventListener('message', (e: MessageEvent<FromExport>) => {
      const m = e.data;
      if (pair !== this.idle || (m.type !== 'export:calibration' && m.type !== 'export:calibrationFailed')) return;
      const p = this.pending.get(m.id);
      if (!p) return; // stale: its request was rejected already
      this.pending.delete(m.id);
      if (m.type === 'export:calibration') p.resolve(m.cal);
      else p.reject(new Error(m.message));
    });
    return pair;
  }

  /** The idle pair, kept idle (the estimate's calibration runs in it). */
  peek(): WorkerPair {
    return this.idle;
  }

  get busy(): boolean {
    return this.pending.size > 0;
  }

  /** Runs one calibration encode in the idle export worker, after the ones before it. */
  calibrate(job: Extract<ToExport, { type: 'export:calibrate' }>['job']): Promise<Calibration> {
    const id = this.nextId++;
    const video = this.idle.video;
    const run = new Promise<Calibration>((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject,
        post: () => video.postMessage({ type: 'export:calibrate', id, job } satisfies ToExport),
      });
    });
    this.queue = this.queue.then(() => {
      this.pending.get(id)?.post();
      return run.catch(() => undefined);
    });
    return run;
  }

  take(): WorkerPair {
    // An estimate still calibrating in the idle pair is dropped: the export starts on fresh workers.
    if (this.busy) this.renew();
    const pair = this.idle;
    this.idle = this.start();
    return pair;
  }

  /** Terminates the idle pair for good (RULE-22: an unsupported device runs no workers). */
  dispose(): void {
    for (const p of this.pending.values()) p.reject(new Error('AbortError: the calibration was cancelled'));
    this.pending.clear();
    terminate(this.idle);
  }

  /** Terminates the idle pair (cancelling its calibrations) and starts a new one. */
  renew(): void {
    for (const p of this.pending.values()) p.reject(new Error('AbortError: the calibration was cancelled'));
    this.pending.clear();
    this.queue = Promise.resolve();
    terminate(this.idle);
    this.idle = this.start();
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
  /**
   * Sound given whole as 48 kHz stereo per source (tests); it takes the place of decoding that source.
   * Every other source with sound is decoded from its file in `media` (the sound feed, ADR-0008 §6).
   */
  readonly pcm?: readonly PcmSource[];
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
  /**
   * Test hook (F-007.AC8, INV-02): receives the export worker's composed picture of project frame
   * `tap.frame` before encoding. The app never sets it.
   */
  readonly tap?: {
    readonly frame: number;
    readonly onFrame: (width: number, height: number, rgba: Uint8Array) => void;
  };
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

/** The sources heard in the mix: unmuted voices whose source has sound. */
function soundingSources(project: Project): Set<string> {
  const byId = new Map(project.sources.map((src) => [src.id, src]));
  const ids = new Set<string>();
  for (const v of voices(project)) {
    const src = byId.get(v.sourceId);
    if (v.gain > 0 && src?.hasSound === true) ids.add(v.sourceId);
  }
  return ids;
}

/** RULE-15 "Sound": included when any unmuted voice has sound. */
export function hasSound(project: Project): boolean {
  return soundingSources(project).size > 0;
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
  const stop = Math.max(from, Math.min(end, settings.to ?? end));
  const length = Math.min(GIF_MAX_US, stop - from);
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
  const { width, height } =
    output.kind === 'video' ? output.video : output.kind === 'gif' ? output : { width: 0, height: 0 };
  return ctx.workers.calibrate({
    project,
    media: ctx.media,
    looks: ctx.looks,
    texts: ctx.texts(width, height),
    output,
  });
}

/**
 * Implements: F-015.R2 / AC11 (estimate within ±25 %: 3 × 2 s calibration capped at nominal) and the
 * size target's reachability (RULE-15, D-020, ADR-0010 outcome item 7): a resolution is offered only if
 * the target's bitrate is at least its effective floor **and** its pre-check (the calibration at the
 * target's constant bitrate) predicts ≤ X; a resolution whose pre-check fails gets its delivered rate as
 * its effective floor. With no resolution, the smallest whole-MB target uses 480's effective floor.
 */
export async function estimate(
  project: Project,
  settings: ExportSettings,
  ctx: ExportContext,
): Promise<EstimateResult> {
  const sound = hasSound(project);
  const planned = planOutput(project, settings, ctx.caps, sound);
  // F-016, CMP-ExportPanel "gif": three of the GIF's frames encoded in the idle export worker.
  if (planned.output.kind === 'gif')
    return { bytes: estimateGifBytes(await calibrate(ctx, project, planned.output), planned.frames), reachable: true };
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
  const X = settings.targetMB * MB;
  const offered = RESOLUTIONS.filter((r) => r <= settings.resolution);
  const base = { targetMB: settings.targetMB, seconds: planned.frames / rate, rate, audioBps: aBps, offered };
  const delivered: Partial<Record<VideoResolution, number>> = {};
  const at = (resolution: VideoResolution): ExportOutput =>
    planOutput(project, { ...settings, resolution }, ctx.caps, sound).output;
  for (const r of [...offered].sort((a, b) => b - a)) {
    if (!sizeTargetPlan({ ...base, resolution: r, delivered }).reachable) continue;
    const o = at(r);
    const cal = await calibrate(ctx, project, o);
    const predicted = predictedTargetBytes(cal, planned.frames, rate, aBps);
    if (predicted <= X) {
      return r === settings.resolution
        ? { bytes: predicted, reachable: true }
        : { bytes: predicted, reachable: false, suggestedResolution: r };
    }
    // The encoder cannot go that low on this content: its delivered rate is this size's floor.
    const bitrate = o.kind === 'video' ? o.video.bitrate : 0;
    delivered[r] = Math.max(deliveredBps(cal, rate), bitrate + 1);
  }
  if (delivered[480] === undefined) {
    // D-020: the smallest whole-MB target 480 can meet, with 480's effective floor measured at its floor.
    const o = at(480);
    if (o.kind === 'video') {
      const floor = floorFor(480, rate);
      const cal = await calibrate(ctx, project, {
        ...o,
        video: {
          ...o.video,
          bitrate: floor,
          bitrateMode: ctx.caps.video.bitrateModes.includes('constant') ? 'constant' : 'variable',
        },
      });
      delivered[480] = Math.max(floor, deliveredBps(cal, rate));
    }
  }
  const plan = sizeTargetPlan({ ...base, resolution: 480, delivered });
  return {
    bytes: X,
    reachable: false,
    ...(plan.smallestTargetMB ? { smallestTargetMB: Math.max(plan.smallestTargetMB, settings.targetMB + 1) } : {}),
  };
}

const RESOLUTIONS: readonly VideoResolution[] = [480, 720, 1080, 1440, 2160];

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

/** No message from the export worker for this long while the page is visible: it is dead or hung. */
export const SILENCE_MS = 30_000;
/** A second delete of a failed export's files, in case the worker's handle was still open. */
export const DISCARD_RETRY_MS = 300;

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
  /** The finished file is being handed over: the interruption rules no longer apply. */
  let handing = false;

  await ctx.scratch.cleanup(); // ADR-0010 outcome item 6: the next export deletes due files
  const sound = hasSound(project);
  let planned: PlannedOutput;
  try {
    planned = planOutput(project, settings, ctx.caps, sound);
  } catch (e) {
    return failedHandle({ ok: false, error: 'error.export_failed', detail: String(e) });
  }
  const out = planned.output;
  // The sources' sound is decoded from their files by the export-audio worker (Q33, resolved by E6); a
  // decode or read error fails the export there (COPY-error.export_failed), never dropping the sound.
  const pcm = ctx.pcm ?? [];
  // Scratch only while this session holds its Web Lock, so no sweep can take its files (MOD-Scratch).
  const locked = ctx.scratch.available && (await ctx.scratch.holdSessionLock());
  // Room for the file × 1.3 and, in the worst case, the spill file (all the video) — build-spec Q32.
  const spill = out.kind === 'video' && out.audio ? (out.video.bitrate * planned.frames) / out.video.rate / 8 : 0;
  const room = locked && (await ctx.scratch.hasRoom(planned.nominalBytes * ROOM_FACTOR + spill));
  const cap = ctx.phone ? MEMORY_CAP.phone : MEMORY_CAP.laptop;
  const kind = chooseSink({ opfs: locked, room, estimate: planned.nominalBytes, cap });
  if (kind === 'no_space') return failedHandle({ ok: false, error: 'error.no_space' });
  const memoryAllowed = planned.nominalBytes * ROOM_FACTOR < cap;
  const file = kind === 'scratch' ? ctx.scratch.create() : null;
  const pair = ctx.workers.take();
  const needsAudio = out.kind === 'audio' || (out.kind === 'video' && out.audio !== null);
  const channel = needsAudio ? new MessageChannel() : null;
  // The sound feed: the export worker reads the sources' sound, the export-audio worker decodes it.
  const feed = needsAudio ? new MessageChannel() : null;
  const { width, height } = out.kind === 'video' ? out.video : out.kind === 'gif' ? out : { width: 0, height: 0 };
  const audioCodec =
    out.kind === 'audio' && out.container === 'wav' ? 'pcm16' : out.kind !== 'gif' ? out.audio?.codec : undefined;
  const key = mixKey(project);
  const lossy = audioCodec === 'aac' || audioCodec === 'opus';
  let lastHeard = now();

  const stopTimers: (() => void)[] = [];
  let cleaned: Promise<void> = Promise.resolve();
  /**
   * The result is reported at once (cancel within 1 s, NFR-11; the message at detection, ADR-0010
   * outcome item 10); behind it the export worker closes and deletes its scratch files, both workers are
   * terminated (after 1.5 s without an answer) and the files are deleted again — once more after a short
   * delay if they are still listed.
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
      if (!keepFile && file) {
        await file.discard();
        const names = await ctx.scratch.names();
        if (names.includes(file.name) || names.includes(file.spill)) {
          await new Promise((r) => setTimeout(r, DISCARD_RETRY_MS));
          await file.discard();
        }
      }
    })();
    return cleaned;
  };
  const fail = (kindOf: ExportFailure['kind'] | 'other', detail: string): void => {
    if (kindOf === 'no_space') return void end({ ok: false, error: 'error.no_space', detail });
    const interrupted = (kindOf === 'encoder' || kindOf === 'webgl') && watch.errorKind() === 'interrupted';
    void end({ ok: false, error: interrupted ? 'error.export_interrupted' : 'error.export_failed', detail });
  };
  /** Liveness: any sign of work counts for the interruption rules (ADR-0010 outcome item 10). */
  const alive = (): void => {
    lastHeard = now();
    watch.progress(now());
  };
  const progress = (done: number, total: number): void => {
    alive();
    const v = tracker.update(done, total, now());
    for (const l of listeners) l(v);
  };

  pair.video.addEventListener('message', (e: MessageEvent<FromExport>) => {
    const m = e.data;
    if (settled || handing) return;
    if (m.type === 'export:progress' && out.kind !== 'audio') progress(m.done, m.total);
    else if (m.type === 'export:progress' || m.type === 'export:alive') alive();
    else if (m.type === 'export:tap') ctx.tap?.onFrame(m.width, m.height, m.rgba);
    else if (m.type === 'export:failed') fail(m.error.kind, m.error.message);
    else if (m.type === 'export:done') void handOver(m.blob, m.bytes, m.stats, m.trim);
  });
  pair.audio.onmessage = (e: MessageEvent<FromExportAudio>) => {
    const m = e.data;
    if (settled || handing) return;
    if (m.type === 'exportAudio:progress' && out.kind === 'audio') progress(m.done, m.total);
    else if (m.type === 'exportAudio:progress' || m.type === 'exportAudio:alive') alive();
    else if (m.type === 'exportAudio:failed') fail(m.kind === 'encoder' ? 'encoder' : 'other', m.message);
  };
  // A worker that dies (an uncaught error, a message that cannot be read) fails the export.
  for (const w of [pair.video, pair.audio])
    for (const type of ['error', 'messageerror'])
      w.addEventListener(type, (e: Event) => {
        if (settled || handing || (w === pair.audio && !needsAudio)) return;
        fail('other', `WorkerError: ${(e as ErrorEvent).message ?? type}`);
      });

  const handOver = async (
    blob: Blob | null,
    bytes: number,
    stats: ExportStats,
    trim: TrimInfo | null,
  ): Promise<void> => {
    handing = true;
    try {
      const data = blob ?? (file ? await file.file() : null);
      if (!data) throw new Error('NotFoundError: no file');
      // Cancelled while the file was being opened: nothing is saved.
      if (settled) return;
      const fileName = exportFileName((ctx.clock ?? (() => new Date()))(), planned.ext);
      if (lossy && trim) ctx.gains.set(key, trim.gainDb);
      for (const l of listeners) l(tracker.done());
      const url = (ctx.save ?? downloadBlob)(data, fileName);
      // ADR-0010 outcome item 6: nothing revoked or deleted for 10 s after the click.
      if (file) file.handedOver(url);
      else setTimeout(() => URL.revokeObjectURL(url), 10_000);
      void end({ ok: true, fileName, bytes, stats, trim, fullProject: out.kind !== 'gif' }, true);
    } catch (e) {
      handing = false;
      fail('other', String(e));
    }
  };

  const setI = ctx.setInterval ?? ((f: () => void, ms: number) => setInterval(f, ms));
  const clearI = ctx.clearInterval ?? ((id: unknown) => clearInterval(id as number));
  const timer = setI(() => {
    if (settled || handing) return;
    if (watch.interrupted(now())) void end({ ok: false, error: 'error.export_interrupted' });
    else if (!vis.hidden() && now() - lastHeard >= SILENCE_MS)
      fail('other', `TimeoutError: no answer from the export for ${SILENCE_MS} ms`);
  }, WATCH_MS);
  stopTimers.push(() => clearI(timer));
  stopTimers.push(
    vis.onChange(() => {
      watch.visibility(vis.hidden(), now());
      if (!vis.hidden()) lastHeard = Math.max(lastHeard, now());
    }),
  );

  if (channel && audioCodec) {
    pair.audio.postMessage(
      {
        type: 'exportAudio:start',
        project,
        pcm,
        feed: feed ? feed.port2 : null,
        codec: audioCodec,
        bitrate: out.kind !== 'gif' ? (out.audio?.bitrate ?? 0) : 0,
        encoderDelay: out.kind !== 'gif' ? (out.audio?.encoderDelay ?? 0) : 0,
        // ADR-0008 outcome item 2: the final gain is shared by every export of the mix (WAV included).
        gainDb: ctx.gains.get(key) ?? null,
        port: channel.port2,
      } satisfies ToExportAudio,
      feed ? [channel.port2, feed.port2] : [channel.port2],
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
        soundFeed: feed && audioCodec ? feed.port1 : null,
        // Test hook only: production builds never ask the worker for a frame (security audit I1).
        ...(!import.meta.env.PROD && ctx.tap ? { tapFrame: ctx.tap.frame } : {}),
      },
    } satisfies ToExport,
    [...(channel ? [channel.port1] : []), ...(feed && audioCodec ? [feed.port1] : [])],
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
