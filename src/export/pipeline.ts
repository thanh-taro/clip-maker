// MOD-Export — the export (video) worker's pipeline (ADR-0010 §1 and outcome items 1–7; promoted from
// SP-speed's export worker and SP-size-target's calibration). For each output frame k: MOD-Plan's frame
// plan → MOD-Engine's sequential readers (no seeking except at clip starts) → MOD-Compositor's one `paint`
// (the same as the preview, INV-02) at output size → one `VideoFrame(canvas)` wrap → the encoder →
// the mux schedule → the sink. The sound comes from the export-audio worker over a port. No timers pace
// the loop (a hidden page does not slow it where workers keep running).
// Implements: F-015.R1/R4/R6/R8, F-016.R2 (audio-only files), RULE-15 (size target never exceeded),
// INV-02, NFR-04, NFR-05, NFR-08, NFR-11.
import { wavHeader } from '../audio';
import { createCompositor, type Compositor, type LookTable, type PaintFrame } from '../compositor';
import { createOutput, serveSound, type MediaWriter, type OutPacket, type Sink } from '../container';
import {
  frameStart,
  gifCalibrationFrames,
  gifDelays,
  gopFrames,
  projectFrames,
  scheduledFrame,
  type AudioPortMessage,
  type Calibration,
  type EngineMedia,
  type ExportJob,
  type ExportStats,
  type ExportVideoSpec,
  type FromExport,
  type Project,
  type TextBitmap,
  type TrimInfo,
} from '../core';
import { createSequentialFrameReader, type SequentialFrameReader } from '../engine';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { framePlan, gifFramePlan, type FramePlan } from '../plan';
import { openScratchSink, openScratchSpill, type ScratchSpill, type StorageLike } from '../scratch';
import { AbortGate, encodeFrames, runTargetPasses, sinkError, withHeartbeat } from './control';
import { encoderConfig, errorText, StageError, VideoEncodeStage } from './encoder';
import { LateAudioMux, MemorySpill, type SpillStore } from './mux';
import { MemorySink } from './sinks';
import { PROGRESS_POST_MS } from './watch';

export interface PipelineDeps {
  readonly storage: StorageLike | null;
  readonly post: (m: FromExport, transfer?: Transferable[]) => void;
  readonly now?: () => number;
  /** The abort gate: drops the open sink at once on abort (close the handles, delete the files). */
  readonly gate?: AbortGate;
}

/** The decoded pictures of a plan's layers: per-clip sequential readers and the photos. */
export class FrameSource {
  private readonly readers = new Map<string, Promise<SequentialFrameReader>>();
  private readonly files = new Map<string, Blob>();
  private readonly photos = new Map<string, ImageBitmap>();
  decodeMs = 0;

  constructor(media: readonly EngineMedia[]) {
    for (const m of media) {
      if (m.kind === 'video') this.files.set(m.id, m.file);
      else if (m.kind === 'photo') this.photos.set(m.id, m.bitmap);
    }
  }

  async frames(plan: FramePlan): Promise<(PaintFrame | null)[]> {
    const t0 = performance.now();
    const live = new Set(plan.layers.map((l) => l.clip.id));
    for (const [id, r] of this.readers)
      if (!live.has(id)) {
        this.readers.delete(id);
        void r.then((x) => x.close()).catch(() => undefined);
      }
    const out = await Promise.all(
      plan.layers.map(async (l): Promise<PaintFrame | null> => {
        if (l.clip.kind === 'photo') {
          const b = this.photos.get(l.clip.sourceId);
          return b ? { image: b, width: b.width, height: b.height, rotation: 0 } : null;
        }
        const file = this.files.get(l.clip.sourceId);
        if (!file) throw new StageError('source', `NotFoundError: source ${l.clip.sourceId} not given`);
        let reader = this.readers.get(l.clip.id);
        if (!reader) {
          reader = createSequentialFrameReader(l.clip.sourceId, file);
          this.readers.set(l.clip.id, reader);
        }
        let r;
        try {
          r = await (await reader).frameAt(l.sourceTime);
        } catch (e) {
          throw new StageError('source', errorText(e));
        }
        return r
          ? { image: r.frame, width: r.frame.displayWidth, height: r.frame.displayHeight, rotation: r.rotation }
          : null;
      }),
    );
    this.decodeMs += performance.now() - t0;
    return out;
  }

  async close(): Promise<void> {
    const all = [...this.readers.values()];
    this.readers.clear();
    for (const r of all) (await r.catch(() => null))?.close();
  }
}

/** The export's compositor on an unattached canvas at output size (ADR-0003 §5). */
function compositorFor(
  job: Pick<ExportJob, 'looks'>,
  width: number,
  height: number,
): { comp: Compositor; canvas: OffscreenCanvas } {
  const looks = new Map<string, LookTable>(Object.entries(job.looks));
  const canvas = new OffscreenCanvas(width, height);
  const comp = createCompositor(canvas, looks);
  comp.resize(width, height);
  return { comp, canvas };
}

/** paint → wrap; a context lost after the first frame fails the export (ADR-0006 outcome item 6). */
function paintFrame(
  comp: Compositor,
  plan: FramePlan,
  frames: readonly (PaintFrame | null)[],
  texts: ReadonlyMap<string, TextBitmap>,
): void {
  if (comp.lost) throw new StageError('webgl', 'ContextLostError: WebGL context lost');
  comp.paint(plan, frames, texts);
  if (comp.lost) throw new StageError('webgl', 'ContextLostError: WebGL context lost');
}

interface OpenedSink {
  readonly kind: 'scratch' | 'memory';
  readonly sink: Sink;
  readonly bytes: () => number;
  readonly reset: () => void;
  /** A fresh spill store, opened only when a video packet must wait for the sound. */
  readonly spill: () => Promise<SpillStore>;
  /** Deletes the current spill file if one is open (not needed once the file is complete). */
  readonly dropSpill: () => Promise<void>;
  /** Closes; returns the memory file (null for the scratch file). */
  readonly finish: (type: string) => Blob | null;
  readonly discard: () => Promise<void>;
}

/** Sink writes: a storage quota error becomes COPY-error.no_space (F-019.R7). */
const guarded = (write: (c: Uint8Array, p: number) => void): Sink['write'] => {
  return (c, p) => {
    try {
      write(c, p);
    } catch (e) {
      throw sinkError(e);
    }
  };
};

/** ADR-0010 §2 / outcome item 5: the scratch file, or memory when it can't be opened and memory may be used. */
async function openSink(job: ExportJob, storage: StorageLike | null): Promise<OpenedSink> {
  const choice = job.sink;
  if (choice.kind === 'scratch' && storage) {
    try {
      const s = await openScratchSink(choice.name, storage);
      let spill: ScratchSpill | null = null;
      const dropSpill = async (): Promise<void> => {
        const old = spill;
        spill = null;
        await old?.discard();
      };
      return {
        kind: 'scratch',
        sink: { write: guarded((c, p) => s.write(c, p)), close: () => s.flush() },
        bytes: () => {
          try {
            s.flush();
          } catch (e) {
            throw sinkError(e);
          }
          return s.size;
        },
        reset: () => s.reset(),
        spill: async () => {
          await dropSpill();
          spill = await openScratchSpill(choice.spill, storage);
          const opened = spill;
          return {
            append: (d) => {
              try {
                return opened.append(d);
              } catch (e) {
                throw sinkError(e);
              }
            },
            read: (o, n) => opened.read(o, n),
            get bytes() {
              return opened.bytes;
            },
            discard: () => opened.discard(),
          };
        },
        dropSpill,
        finish: () => (s.close(), null),
        discard: async () => {
          await s.discard();
          await dropSpill().catch(() => undefined);
        },
      };
    } catch (e) {
      if (!choice.memoryFallback) throw sinkError(e);
    }
  } else if (choice.kind === 'scratch' && !choice.memoryFallback)
    throw new StageError('sink', 'NotFoundError: no scratch storage');
  const m = new MemorySink();
  return {
    kind: 'memory',
    sink: { write: (c, p) => m.write(c, p), close: () => m.close() },
    bytes: () => (m.close(), m.bytes),
    reset: () => m.reset(),
    spill: async () => new MemorySpill(),
    dropSpill: async () => undefined,
    finish: (type) => m.blob(type),
    discard: async () => m.reset(),
  };
}

/** No message from the export-audio worker for this long while the video waits for it: a dead worker. */
export const SOUND_STALL_MS = 30_000;

interface Sound {
  readonly packets: Promise<{ packets: OutPacket[]; config: AudioDecoderConfig; trim: TrimInfo }>;
  readonly pcm: (onBytes: (b: Uint8Array) => void) => Promise<{ frames: number; trim: TrimInfo }>;
  /** Rejects when the export-audio worker falls silent for SOUND_STALL_MS before it delivered. */
  readonly watchdog: Promise<never>;
  stop(): void;
}

/** The verified sound from the export-audio worker (over the job's port), with its trim result. */
export function soundFrom(port: MessagePort | null): Sound {
  let onPcm: ((b: Uint8Array) => void) | null = null;
  const backlog: Uint8Array[] = [];
  let resolvePackets: (v: { packets: OutPacket[]; config: AudioDecoderConfig; trim: TrimInfo }) => void = () =>
    undefined;
  let resolveEnd: (v: { frames: number; trim: TrimInfo }) => void = () => undefined;
  const rejects: ((e: Error) => void)[] = [];
  const packets = new Promise<{ packets: OutPacket[]; config: AudioDecoderConfig; trim: TrimInfo }>((res, rej) => {
    resolvePackets = res;
    rejects.push(rej);
  });
  const end = new Promise<{ frames: number; trim: TrimInfo }>((res, rej) => {
    resolveEnd = res;
    rejects.push(rej);
  });
  let rejectWatch: (e: Error) => void = () => undefined;
  const watchdog = new Promise<never>((_, rej) => (rejectWatch = rej));
  for (const p of [packets, end, watchdog]) p.catch(() => undefined);
  let last = Date.now();
  let delivered = false;
  const fail = (e: Error): void => {
    for (const r of rejects) r(e);
    rejectWatch(e);
  };
  const timer = setInterval(() => {
    if (!delivered && Date.now() - last >= SOUND_STALL_MS)
      fail(new StageError('audio', `TimeoutError: no sound for ${SOUND_STALL_MS} ms`));
  }, 1000);
  if (port) {
    port.onmessage = (e: MessageEvent<AudioPortMessage>) => {
      last = Date.now();
      const m = e.data;
      if (m.type === 'packets') {
        delivered = true;
        resolvePackets({ packets: [...m.packets], config: m.decoderConfig, trim: m.trim });
      } else if (m.type === 'pcm') {
        if (onPcm) onPcm(m.bytes);
        else backlog.push(m.bytes);
      } else if (m.type === 'end') {
        delivered = true;
        resolveEnd({ frames: m.frames, trim: m.trim });
      } else if (m.type === 'failed') fail(new StageError(m.kind === 'encoder' ? 'encoder' : 'audio', m.message));
    };
    port.start();
  }
  return {
    packets,
    pcm: (f) => {
      onPcm = f;
      for (const b of backlog.splice(0)) f(b);
      return end;
    },
    watchdog,
    stop: () => clearInterval(timer),
  };
}

const MIME = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  gif: 'image/gif',
} as const;

const noStats = (
  sink: 'scratch' | 'memory',
  frames: number,
  wallMs: number,
  paintMs = 0,
  decodeMs = 0,
): ExportStats => ({
  frames,
  passes: 1,
  bitrates: [],
  wallMs,
  wrapMs: 0,
  paintMs,
  decodeMs,
  encodeWaitMs: 0,
  longestOutputGapMs: 0,
  spilledBytes: 0,
  heldVideoBytesMax: 0,
  encoderRestarts: 0,
  sink,
});

/** Opens the sink and registers it with the abort gate (a sink opened after an abort is dropped). */
async function openRegistered(job: ExportJob, deps: PipelineDeps): Promise<OpenedSink> {
  const sink = await openSink(job, deps.storage);
  if (deps.gate && !deps.gate.register(sink.discard)) {
    await sink.discard().catch(() => undefined);
    throw new StageError('internal', 'AbortError: the export was cancelled');
  }
  return sink;
}

/** Posts `export:done`; from then on an abort no longer deletes the file. */
function done(deps: PipelineDeps, m: Extract<FromExport, { type: 'export:done' }>): void {
  deps.gate?.clear();
  deps.post(m);
}

const beat = (deps: PipelineDeps) => (): void => deps.post({ type: 'export:alive' });

type GifOut = Extract<ExportJob['output'], { kind: 'gif' }>;
interface GifPainter {
  readonly comp: Compositor;
  readonly source: FrameSource;
  readonly texts: ReadonlyMap<string, TextBitmap>;
}

/**
 * GIF frame `i`: painted by the same `paint` as the preview at GIF size, quantised to 256 colours and
 * written with its delay (hundredths of a second; the first frame carries the loop). Returns the paint time.
 */
async function gifFrame(
  gif: ReturnType<typeof GIFEncoder>,
  p: GifPainter,
  project: Project,
  out: GifOut,
  i: number,
  delayCs: number,
): Promise<number> {
  const plan = gifFramePlan(project, { from: out.from, rate: out.rate }, i);
  const pictures = await p.source.frames(plan);
  const t = performance.now();
  paintFrame(p.comp, plan, pictures, p.texts);
  const rgba = p.comp.readPixels();
  const ms = performance.now() - t;
  const palette = quantize(rgba, 256);
  gif.writeFrame(applyPalette(rgba, palette), out.width, out.height, {
    palette,
    delay: delayCs * 10,
    repeat: 0,
    first: i === 0,
  });
  return ms;
}

/**
 * Implements: the CMP-ExportPanel "gif" estimate (F-016) — the frames at 10, 50 and 90 % of the range
 * encoded on their own (no sink); their bytes give the mean frame size.
 */
async function gifCalibration(
  job: Pick<ExportJob, 'project' | 'media' | 'looks' | 'texts' | 'output'>,
): Promise<Calibration> {
  const out = job.output;
  if (out.kind !== 'gif') throw new StageError('internal', 'not a GIF job');
  const { comp } = compositorFor(job, out.width, out.height);
  const source = new FrameSource(job.media);
  const painter = { comp, source, texts: new Map(Object.entries(job.texts)) };
  const gif = GIFEncoder({ auto: false });
  const picked = gifCalibrationFrames(out.frames);
  let bytes = 0;
  try {
    for (const i of picked) {
      await gifFrame(gif, painter, job.project, out, i, 7);
      bytes += gif.bytesView().length;
      gif.reset();
    }
    return { keyBytes: bytes, keyCount: picked.length, deltaBytes: 0, deltaCount: 0 };
  } finally {
    await source.close();
    comp.dispose();
  }
}

/**
 * Implements: F-016.R1, RULE-16 GIF (loops forever, no sound, its own size and rate), ADR-0010 §10 —
 * frames from the same `paint` at GIF size, quantised per frame to 256 colours by gifenc (DEP-05), with
 * alternating delays so every frame stays within one GIF frame of its preview time (NFR-08). Each
 * frame's bytes go to the sink as soon as it is encoded.
 */
async function gifExport(job: ExportJob, deps: PipelineDeps): Promise<void> {
  const out = job.output;
  if (out.kind !== 'gif') throw new StageError('internal', 'not a GIF job');
  const now = deps.now ?? (() => performance.now());
  const t0 = now();
  const sink = await openRegistered(job, deps);
  const { comp } = compositorFor(job, out.width, out.height);
  const source = new FrameSource(job.media);
  const texts = new Map(Object.entries(job.texts));
  const delays = gifDelays(out.rate, out.frames);
  // Manual mode: gifenc's reset() would start a new file in auto mode; each frame's bytes are written
  // out and the stream emptied, so the GIF is never held whole.
  const gif = GIFEncoder({ auto: false });
  gif.writeHeader();
  let at = 0;
  let paintMs = 0;
  let lastPost = -Infinity;
  const flush = (): void => {
    const b = gif.bytesView();
    sink.sink.write(b, at);
    at += b.length;
    gif.reset();
  };
  try {
    for (let i = 0; i < out.frames; i++) {
      paintMs += await gifFrame(gif, { comp, source, texts }, job.project, out, i, delays[i]!);
      flush();
      if (now() - lastPost >= PROGRESS_POST_MS || i === out.frames - 1) {
        lastPost = now();
        deps.post({ type: 'export:progress', done: i + 1, total: out.frames });
      }
    }
    gif.finish();
    flush();
    const bytes = sink.bytes();
    const blob = sink.finish(MIME.gif);
    const stats = noStats(sink.kind, out.frames, now() - t0, paintMs, source.decodeMs);
    done(deps, { type: 'export:done', bytes, blob, stats, trim: null });
  } catch (e) {
    await sink.discard().catch(() => undefined);
    throw e;
  } finally {
    await source.close();
    comp.dispose();
  }
}

/** Implements: the video export of ADR-0010 (with the single corrective pass for a size target). */
async function videoExport(job: ExportJob, deps: PipelineDeps): Promise<void> {
  const out = job.output;
  if (out.kind !== 'video') throw new StageError('internal', 'not a video job');
  const now = deps.now ?? (() => performance.now());
  const t0 = now();
  const v = out.video;
  const frames = projectFrames(job.project);
  if (frames <= 0) throw new StageError('internal', 'RangeError: empty project');
  const sink = await openRegistered(job, deps);
  const sound = out.audio ? soundFrom(job.audio) : null;
  const texts = new Map(Object.entries(job.texts));
  const { comp, canvas } = compositorFor(job, v.width, v.height);
  const stats = { wrapMs: 0, paintMs: 0, decodeMs: 0, encodeWaitMs: 0, gap: 0, spilled: 0, held: 0, restarts: 0 };
  let total = frames;
  let doneFrames = 0;
  let lastPost = -Infinity;
  const progress = (force = false): void => {
    const t = now();
    if (!force && t - lastPost < PROGRESS_POST_MS) return;
    lastPost = t;
    deps.post({ type: 'export:progress', done: doneFrames, total });
  };
  let trim: TrimInfo | null = null;
  try {
    const { bitrates } = await runTargetPasses({
      bitrate: v.bitrate,
      targetBytes: out.targetBytes,
      reset: () => {
        total += frames;
        sink.reset();
      },
      pass: async (bitrate) => {
        const writer = await createOutput(v.container, sink.sink, {
          video: { codec: v.codec === 'h264' ? 'avc' : v.codec, frameRate: v.rate },
          ...(out.audio ? { audio: { codec: out.audio.codec } } : {}),
        });
        // A fresh, lazily opened spill per pass (never a store discarded by an earlier pass).
        const mux = new LateAudioMux(writer, !!out.audio, () => sink.spill());
        const soundIn = sound
          ? sound.packets.then((a) => {
              trim = a.trim;
              return mux.audioReady(a.packets, a.config);
            })
          : Promise.resolve();
        soundIn.catch(() => undefined);
        const pass = await Promise.race([
          encodePass(
            job,
            v,
            bitrate,
            comp,
            canvas,
            texts,
            mux,
            stats,
            () => {
              doneFrames++;
              progress();
            },
            deps.post,
          ),
          ...(sound ? [sound.watchdog] : []),
        ]);
        // Phases without frame progress post liveness beats (ADR-0010 outcome item 10).
        await withHeartbeat(
          (async () => {
            await Promise.race([soundIn, ...(sound ? [sound.watchdog] : [])]);
            await mux.finish();
            await writer.finalize();
          })(),
          beat(deps),
        );
        stats.spilled += mux.spilledBytes;
        stats.held = Math.max(stats.held, mux.heldVideoBytesMax);
        return { bytes: sink.bytes(), videoBytes: pass.videoBytes };
      },
    });
    progress(true);
    await sink.dropSpill();
    const bytes = sink.bytes();
    const blob = sink.finish(MIME[v.container]);
    const result: ExportStats = {
      frames,
      passes: bitrates.length,
      bitrates,
      wallMs: now() - t0,
      wrapMs: stats.wrapMs,
      paintMs: stats.paintMs,
      decodeMs: stats.decodeMs,
      encodeWaitMs: stats.encodeWaitMs,
      longestOutputGapMs: stats.gap,
      spilledBytes: stats.spilled,
      heldVideoBytesMax: stats.held,
      encoderRestarts: stats.restarts,
      sink: sink.kind,
    };
    done(deps, { type: 'export:done', bytes, blob, stats: result, trim });
  } catch (e) {
    await sink.discard().catch(() => undefined);
    throw e;
  } finally {
    sound?.stop();
    comp.dispose();
  }
}

/** One full encode of the project into `mux` (with the encoder restart after a stall). */
async function encodePass(
  job: ExportJob,
  v: ExportVideoSpec,
  bitrate: number,
  comp: Compositor,
  canvas: OffscreenCanvas,
  texts: ReadonlyMap<string, TextBitmap>,
  mux: LateAudioMux,
  stats: { wrapMs: number; paintMs: number; decodeMs: number; encodeWaitMs: number; gap: number; restarts: number },
  onFrame: () => void,
  /** The worker's channel (the `job.tapFrame` test hook posts on it). */
  post?: PipelineDeps['post'],
): Promise<{ videoBytes: number }> {
  const frames = projectFrames(job.project);
  let source = new FrameSource(job.media);
  let muxError: unknown = null;
  let pending: Promise<void> = Promise.resolve();
  let videoBytes = 0;
  const stages: VideoEncodeStage[] = [];
  let best = 0;
  try {
    const r = await encodeFrames({
      frames,
      gop: gopFrames(v.rate),
      render: async (k) => {
        if (muxError) throw sinkError(muxError);
        const plan = framePlan(job.project, k);
        const pictures = await source.frames(plan);
        let t = performance.now();
        paintFrame(comp, plan, pictures, texts);
        if (job.tapFrame === k) {
          // Test hook (F-007.AC8): the composed picture before it is wrapped and encoded.
          const rgba = comp.readPixels();
          post?.({ type: 'export:tap', frame: k, width: canvas.width, height: canvas.height, rgba }, [rgba.buffer]);
        }
        const t2 = performance.now();
        stats.paintMs += t2 - t;
        const f = scheduledFrame(k, v.rate);
        // One wrap per frame: ≈ 70 % of phone export time (architecture.md risk 3a).
        const frame = new VideoFrame(canvas, { timestamp: f.timestamp, duration: f.duration });
        t = performance.now();
        stats.wrapMs += t - t2;
        return frame;
      },
      createEncoder: (onPacket) => {
        const stage = new VideoEncodeStage(encoderConfig(v, bitrate), onPacket);
        stages.push(stage);
        return stage;
      },
      frameOf: (e) => Math.round(e.packet.timestamp * v.rate),
      deliver: (e) => {
        videoBytes += e.packet.data.length;
        pending = mux.video(e.packet, e.config);
        pending.catch((err: unknown) => (muxError ??= err));
      },
      rewind: async () => {
        await source.close();
        source = new FrameSource(job.media);
      },
      onFrame: (k) => {
        // Progress never goes back after a restart (frames re-encoded are not counted twice).
        if (k + 1 > best) {
          best = k + 1;
          onFrame();
        }
      },
    });
    await pending;
    if (muxError) throw sinkError(muxError);
    stats.restarts += r.restarts;
    return { videoBytes };
  } finally {
    for (const s of stages) {
      stats.encodeWaitMs += s.waitMs;
      stats.gap = Math.max(stats.gap, s.longestGapMs);
      s.close();
    }
    stats.decodeMs += source.decodeMs;
    await source.close();
  }
}

/** Implements: F-016.R2 audio-only exports — M4A/Ogg from the verified packets, or the WAV stream. */
async function audioExport(job: ExportJob, deps: PipelineDeps): Promise<void> {
  const out = job.output;
  if (out.kind !== 'audio') throw new StageError('internal', 'not an audio job');
  const now = deps.now ?? (() => performance.now());
  const t0 = now();
  const sink = await openRegistered(job, deps);
  const sound = soundFrom(job.audio);
  let trim: TrimInfo | null = null;
  try {
    await withHeartbeat(
      Promise.race([
        (async () => {
          if (out.container === 'wav') {
            let at = 44;
            const end = await sound.pcm((b) => {
              sink.sink.write(b, at);
              at += b.length;
            });
            sink.sink.write(wavHeader(end.frames), 0);
            trim = end.trim;
          } else {
            if (!out.audio) throw new StageError('internal', 'no audio spec');
            const writer: MediaWriter = await createOutput(out.container, sink.sink, {
              audio: { codec: out.audio.codec },
            });
            const a = await sound.packets;
            trim = a.trim;
            for (const [i, p] of a.packets.entries()) await writer.addAudio(p, i === 0 ? a.config : undefined);
            await writer.finalize();
          }
        })(),
        sound.watchdog,
      ]),
      beat(deps),
    );
    const bytes = sink.bytes();
    const blob = sink.finish(MIME[out.container]);
    done(deps, { type: 'export:done', bytes, blob, stats: noStats(sink.kind, 0, now() - t0), trim });
  } catch (e) {
    await sink.discard().catch(() => undefined);
    throw e;
  } finally {
    sound.stop();
  }
}

/**
 * Runs one export job; posts `export:done` or `export:failed`. Meanwhile it serves the sources' encoded
 * sound to the export-audio worker, which decodes and mixes it (the sound feed, ADR-0008 §6, Q33).
 */
export async function runExport(job: ExportJob, deps: PipelineDeps): Promise<void> {
  const files = new Map<string, Blob>();
  for (const m of job.media) if (m.kind !== 'photo') files.set(m.id, m.file);
  const feed = job.soundFeed ? serveSound(job.soundFeed, (id) => files.get(id)) : null;
  try {
    if (job.output.kind === 'video') await videoExport(job, deps);
    else if (job.output.kind === 'audio') await audioExport(job, deps);
    else await gifExport(job, deps);
  } catch (e) {
    const err = e instanceof StageError ? e : new StageError('internal', errorText(e));
    deps.post({ type: 'export:failed', error: { kind: err.kind, message: err.message } });
  } finally {
    feed?.close();
  }
}

/**
 * Implements: F-015.R2 / AC11 estimate and the size target's pre-check (ADR-0010 outcome items 7–8):
 * the calibration ranges encoded as one contiguous stream with a keyframe at each range start, at the
 * job's bitrate and mode; key and other frames' bytes are counted (no muxing).
 */
export async function runCalibration(
  job: Pick<ExportJob, 'project' | 'media' | 'looks' | 'texts' | 'output'>,
  ranges: readonly (readonly [number, number])[],
): Promise<Calibration> {
  const out = job.output;
  if (out.kind === 'gif') return gifCalibration(job);
  if (out.kind !== 'video') throw new StageError('internal', 'not a video job');
  const v = out.video;
  const { comp, canvas } = compositorFor(job, v.width, v.height);
  const source = new FrameSource(job.media);
  const texts = new Map(Object.entries(job.texts));
  const enc = new VideoEncodeStage(encoderConfig(v), () => undefined);
  try {
    let i = 0;
    for (const [from, to] of ranges)
      for (let k = from; k < to; k++, i++) {
        const plan = framePlan(job.project as Project, k);
        paintFrame(comp, plan, await source.frames(plan), texts);
        const ts = frameStart(i, v.rate);
        const frame = new VideoFrame(canvas, {
          timestamp: ts,
          duration: frameStart(i + 1, v.rate) - ts,
        });
        try {
          await enc.encode(frame, k === from);
        } finally {
          frame.close();
        }
      }
    await enc.flush();
    return { keyBytes: enc.keyBytes, keyCount: enc.keyCount, deltaBytes: enc.deltaBytes, deltaCount: enc.deltaCount };
  } finally {
    enc.close();
    await source.close();
    comp.dispose();
  }
}
