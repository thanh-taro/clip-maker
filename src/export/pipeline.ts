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
import { createOutput, type MediaWriter, type OutPacket, type Sink } from '../container';
import {
  correctiveBps,
  frameStart,
  gifDelays,
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
} from '../core';
import { createSequentialFrameReader, type SequentialFrameReader } from '../engine';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { framePlan, gifFramePlan, type FramePlan } from '../plan';
import { openScratchSink, openScratchSpill, type StorageLike } from '../scratch';
import { encoderConfig, errorText, StageError, VideoEncodeStage, type EncodedVideo } from './encoder';
import { LateAudioMux, MemorySpill, type SpillStore } from './mux';
import { MemorySink } from './sinks';
import { PROGRESS_POST_MS } from './watch';

export interface PipelineDeps {
  readonly storage: StorageLike | null;
  readonly post: (m: FromExport, transfer?: Transferable[]) => void;
  readonly now?: () => number;
  /** Registers how to drop the open sink at once (abort: close the handles, delete the files). */
  readonly onSink?: (discard: () => Promise<void>) => void;
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
      else this.photos.set(m.id, m.bitmap);
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
  readonly spill: () => Promise<SpillStore>;
  /** Deletes the spill file if one was opened (it is not needed once the file is complete). */
  readonly dropSpill: () => Promise<void>;
  /** Closes; returns the memory file (null for the scratch file). */
  readonly finish: (type: string) => Blob | null;
  readonly discard: () => Promise<void>;
}

/** ADR-0010 §2 / outcome item 5: the scratch file, or memory when it can't be opened and memory may be used. */
async function openSink(job: ExportJob, storage: StorageLike | null): Promise<OpenedSink> {
  const choice = job.sink;
  if (choice.kind === 'scratch' && storage) {
    try {
      const s = await openScratchSink(choice.name, storage);
      let spill: Promise<SpillStore> | null = null;
      return {
        kind: 'scratch',
        sink: { write: (c, p) => s.write(c, p), close: () => s.flush() },
        bytes: () => (s.flush(), s.size),
        reset: () => s.reset(),
        spill: () => (spill ??= openScratchSpill(choice.spill, storage)),
        dropSpill: async () => {
          if (spill) await (await spill.catch(() => null))?.discard();
        },
        finish: () => (s.close(), null),
        discard: async () => {
          await s.discard();
          if (spill) await (await spill.catch(() => null))?.discard();
        },
      };
    } catch (e) {
      if (!choice.memoryFallback) throw new StageError('sink', errorText(e));
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

/** The verified sound from the export-audio worker (over the job's port). */
function soundFrom(port: MessagePort | null): {
  packets: Promise<{ packets: OutPacket[]; config: AudioDecoderConfig }>;
  pcm: (onBytes: (b: Uint8Array) => void) => Promise<number>;
} {
  let onPcm: ((b: Uint8Array) => void) | null = null;
  let resolvePackets: (v: { packets: OutPacket[]; config: AudioDecoderConfig }) => void = () => undefined;
  let resolveEnd: (frames: number) => void = () => undefined;
  let rejectAll: (e: Error) => void = () => undefined;
  const pcmBacklog: Uint8Array[] = [];
  const packets = new Promise<{ packets: OutPacket[]; config: AudioDecoderConfig }>((res, rej) => {
    resolvePackets = res;
    const prev = rejectAll;
    rejectAll = (e) => (prev(e), rej(e));
  });
  const end = new Promise<number>((res, rej) => {
    resolveEnd = res;
    const prev = rejectAll;
    rejectAll = (e) => (prev(e), rej(e));
  });
  packets.catch(() => undefined);
  end.catch(() => undefined);
  if (port) {
    port.onmessage = (e: MessageEvent<AudioPortMessage>) => {
      const m = e.data;
      if (m.type === 'packets') resolvePackets({ packets: [...m.packets], config: m.decoderConfig });
      else if (m.type === 'pcm') {
        if (onPcm) onPcm(m.bytes);
        else pcmBacklog.push(m.bytes);
      } else if (m.type === 'end') resolveEnd(m.frames);
      else rejectAll(new StageError('audio', m.message));
    };
    port.start();
  }
  return {
    packets,
    pcm: (f) => {
      onPcm = f;
      for (const b of pcmBacklog.splice(0)) f(b);
      return end;
    },
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
  sink,
});

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
  const sink = await openSink(job, deps.storage);
  deps.onSink?.(sink.discard);
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
      const plan = gifFramePlan(job.project, { from: out.from, rate: out.rate }, i);
      const pictures = await source.frames(plan);
      const t = performance.now();
      paintFrame(comp, plan, pictures, texts);
      const rgba = comp.readPixels();
      paintMs += performance.now() - t;
      const palette = quantize(rgba, 256);
      gif.writeFrame(applyPalette(rgba, palette), out.width, out.height, {
        palette,
        delay: delays[i]! * 10,
        repeat: 0,
        first: i === 0,
      });
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
    deps.post({
      type: 'export:done',
      bytes,
      blob,
      stats: noStats(sink.kind, out.frames, now() - t0, paintMs, source.decodeMs),
    });
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
  const sink = await openSink(job, deps.storage);
  deps.onSink?.(sink.discard);
  const sound = out.audio ? soundFrom(job.audio) : null;
  const texts = new Map(Object.entries(job.texts));
  const { comp, canvas } = compositorFor(job, v.width, v.height);
  const stats = {
    wrapMs: 0,
    paintMs: 0,
    decodeMs: 0,
    encodeWaitMs: 0,
    longestOutputGapMs: 0,
    spilledBytes: 0,
    held: 0,
  };
  const bitrates: number[] = [];
  let total = frames;
  let doneFrames = 0;
  let lastPost = -Infinity;
  const progress = (force = false): void => {
    const t = now();
    if (!force && t - lastPost < PROGRESS_POST_MS) return;
    lastPost = t;
    deps.post({ type: 'export:progress', done: doneFrames, total });
  };
  try {
    let bitrate = v.bitrate;
    for (let pass = 1; ; pass++) {
      bitrates.push(bitrate);
      const writer = await createOutput(v.container, sink.sink, {
        video: { codec: v.codec === 'h264' ? 'avc' : v.codec, frameRate: v.rate },
        ...(out.audio ? { audio: { codec: out.audio.codec } } : {}),
      });
      const spill = out.audio ? await sink.spill() : null;
      const mux = new LateAudioMux(writer, !!out.audio, () => spill ?? new MemorySpill());
      const soundIn = sound ? sound.packets.then((a) => mux.audioReady(a.packets, a.config)) : Promise.resolve();
      soundIn.catch(() => undefined);
      const pass1 = await encodePass(job, v, bitrate, comp, canvas, texts, mux, stats, () => {
        doneFrames++;
        progress();
      });
      await soundIn;
      await mux.finish();
      await writer.finalize();
      stats.spilledBytes += mux.spilledBytes;
      stats.held = Math.max(stats.held, mux.heldVideoBytesMax);
      stats.longestOutputGapMs = Math.max(stats.longestOutputGapMs, pass1.longestGapMs);
      const bytes = sink.bytes();
      if (out.targetBytes === null || bytes <= out.targetBytes) break;
      // RULE-15 / F-015.AC10: one corrective pass; a file still above the target is never handed over.
      if (pass >= 2)
        throw new StageError('over_target', `RangeError: ${bytes} bytes over the ${out.targetBytes} target`);
      bitrate = correctiveBps(bitrate, out.targetBytes - (bytes - pass1.videoBytes), pass1.videoBytes);
      total += frames;
      sink.reset();
    }
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
      longestOutputGapMs: stats.longestOutputGapMs,
      spilledBytes: stats.spilledBytes,
      heldVideoBytesMax: stats.held,
      sink: sink.kind,
    };
    deps.post({ type: 'export:done', bytes, blob, stats: result });
  } catch (e) {
    await sink.discard().catch(() => undefined);
    throw e;
  } finally {
    comp.dispose();
  }
}

/** One full encode of the project into `mux`. */
async function encodePass(
  job: ExportJob,
  v: ExportVideoSpec,
  bitrate: number,
  comp: Compositor,
  canvas: OffscreenCanvas,
  texts: ReadonlyMap<string, TextBitmap>,
  mux: LateAudioMux,
  stats: { wrapMs: number; paintMs: number; decodeMs: number; encodeWaitMs: number },
  onFrame: () => void,
): Promise<{ videoBytes: number; longestGapMs: number }> {
  const frames = projectFrames(job.project);
  const source = new FrameSource(job.media);
  let muxError: unknown = null;
  let pending: Promise<void> = Promise.resolve();
  const enc = new VideoEncodeStage(encoderConfig(v, bitrate), (e: EncodedVideo) => {
    pending = mux.video(e.packet, e.config);
    pending.catch((err: unknown) => (muxError ??= err));
  });
  try {
    for (let k = 0; k < frames; k++) {
      if (muxError) throw new StageError('sink', errorText(muxError));
      const plan = framePlan(job.project, k);
      const pictures = await source.frames(plan);
      let t = performance.now();
      paintFrame(comp, plan, pictures, texts);
      const t2 = performance.now();
      stats.paintMs += t2 - t;
      const f = scheduledFrame(k, v.rate);
      // One wrap per frame: ≈ 70 % of phone export time (architecture.md risk 3a).
      const frame = new VideoFrame(canvas, { timestamp: f.timestamp, duration: f.duration });
      t = performance.now();
      stats.wrapMs += t - t2;
      try {
        await enc.encode(frame, f.key);
      } finally {
        frame.close();
      }
      onFrame();
    }
    await enc.flush();
    await pending;
    if (muxError) throw new StageError('sink', errorText(muxError));
    stats.decodeMs += source.decodeMs;
    stats.encodeWaitMs += enc.waitMs;
    return { videoBytes: enc.bytes, longestGapMs: enc.longestGapMs };
  } finally {
    enc.close();
    await source.close();
  }
}

/** Implements: F-016.R2 audio-only exports — M4A/Ogg from the verified packets, or the WAV stream. */
async function audioExport(job: ExportJob, deps: PipelineDeps): Promise<void> {
  const out = job.output;
  if (out.kind !== 'audio') throw new StageError('internal', 'not an audio job');
  const now = deps.now ?? (() => performance.now());
  const t0 = now();
  const sink = await openSink(job, deps.storage);
  deps.onSink?.(sink.discard);
  const sound = soundFrom(job.audio);
  try {
    if (out.container === 'wav') {
      let at = 44;
      const frames = await sound.pcm((b) => {
        sink.sink.write(b, at);
        at += b.length;
      });
      sink.sink.write(wavHeader(frames), 0);
    } else {
      if (!out.audio) throw new StageError('internal', 'no audio spec');
      const writer: MediaWriter = await createOutput(out.container, sink.sink, { audio: { codec: out.audio.codec } });
      const a = await sound.packets;
      for (const [i, p] of a.packets.entries()) await writer.addAudio(p, i === 0 ? a.config : undefined);
      await writer.finalize();
    }
    const bytes = sink.bytes();
    const blob = sink.finish(MIME[out.container]);
    deps.post({ type: 'export:done', bytes, blob, stats: noStats(sink.kind, 0, now() - t0) });
  } catch (e) {
    await sink.discard().catch(() => undefined);
    throw e;
  }
}

/** Runs one export job; posts `export:done` or `export:failed`. */
export async function runExport(job: ExportJob, deps: PipelineDeps): Promise<void> {
  try {
    if (job.output.kind === 'video') await videoExport(job, deps);
    else if (job.output.kind === 'audio') await audioExport(job, deps);
    else await gifExport(job, deps);
  } catch (e) {
    const error =
      e instanceof StageError
        ? { kind: e.kind, message: e.message }
        : { kind: 'internal' as const, message: errorText(e) };
    deps.post({ type: 'export:failed', error });
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
