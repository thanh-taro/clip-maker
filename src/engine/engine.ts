// MOD-Engine — preview playback and seeking (ADR-0003 §2, ADR-0009 and their outcomes), promoted from
// SP-compositor's engine worker. On each tick (the audio clock's time while playing, the playhead
// while paused) it asks MOD-Plan for the frame plan, gets the needed source frames from its decoder
// slots, and calls MOD-Compositor's `paint`. Requests are coalesced: the latest wins. Independent of the
// worker scope so it is unit-tested with fakes.
// Implements: F-002.R1–R4/R6 (picture at the playhead, picture following the sound clock, scrub, step),
// F-002 edge case "frames are skipped to keep sound in sync", RULE-22 (slow source → slowSource once;
// the newest frame is shown while sound plays on), NFR-03 (coarse-then-exact seeks), NFR-05 (bounded
// decoders, frames and coarse copies), ADR-0006 outcome rule 6 (the preview always recovers from a
// WebGL context loss).
import {
  frameIndexAt,
  frameStart,
  layoutOf,
  projectFrames,
  type EngineMedia,
  type EngineStats,
  type FromEngine,
  type Micros,
  type Overlay,
  type Project,
  type TextBitmap,
  type ToEngine,
} from '../core';
import { framePlan, type FramePlan } from '../plan';
import type { Compositor, CompositorOptions, EffectsResult, LookTable, PaintFrame, Rotation } from '../compositor';
import type { Budget } from './budget';
import { CoarseCache, keepsCoarse } from './coarse';
import type { FrameResult, SlotOptions } from './decoder';
import { assignSlots, runKeys, type FrameMode } from './frames';

/** A decoded frame the engine can paint (a `VideoFrame` in the worker). */
export interface EngineFrame {
  readonly timestamp: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  close(): void;
}

/** The decoder-slot surface the engine drives (DecoderSlot in the worker, fakes in tests). */
export interface SlotLike<F extends EngineFrame = EngineFrame> {
  frameAt(t: Micros, mode: FrameMode, onCoarse?: (f: F) => void, jump?: boolean): Promise<FrameResult<F>>;
  prefetch(t: Micros): Promise<void>;
  peek(t: Micros): F | null;
  close(): void;
  onFrame: ((f: F) => void) | null;
  readonly openFrames: number;
  readonly stats: { readonly restarts: number; readonly flushes: number };
}

export interface VideoSourceLike<F extends EngineFrame = EngineFrame> {
  readonly rotation: Rotation;
  readonly frameUs: number;
  readonly keySpacing: number | null;
  newSlot(maxFrames: number, options?: SlotOptions): SlotLike<F>;
  close(): void;
}

export interface CoarseBitmap {
  readonly width: number;
  readonly height: number;
  close(): void;
}

export interface EngineDeps {
  post(m: FromEngine): void;
  createCompositor(canvas: OffscreenCanvas, looks: ReadonlyMap<string, LookTable>, o: CompositorOptions): Compositor;
  openVideo(id: string, file: Blob): Promise<VideoSourceLike>;
  effectsCheck(): Promise<EffectsResult>;
  /** A preview-size copy of a frame for the coarse cache (ADR-0009 outcome rule 4). */
  coarseCopy(frame: EngineFrame): Promise<CoarseBitmap>;
  readonly budget: Budget;
  readonly phone: boolean;
  now(): number;
}

/** A source reported slow after this many inexact paints within SLOW_WINDOW_MS (RULE-22). */
export const SLOW_PAINTS = 10;
export const SLOW_WINDOW_MS = 2000;
/** The next clip's decoder warms up this long before its start (ADR-0009 §4 "next clip warm-up"). */
export const WARMUP_US = 1_000_000;

interface Request {
  readonly t: Micros;
  readonly playing: boolean;
  readonly seek: boolean;
}

interface Bound {
  /** The decode run the slot serves (runKeys); null when free. */
  key: string | null;
  sourceId: string | null;
  slot: SlotLike | null;
  lastUsed: number;
}

export class Engine {
  private comp: Compositor | null = null;
  private looks = new Map<string, LookTable>();
  private project: Project | null = null;
  private media = new Map<string, EngineMedia>();
  private videos = new Map<string, Promise<VideoSourceLike | null>>();
  private failed = new Set<string>();
  private slots: Bound[] = [];
  private coarse = new Map<string, CoarseCache<CoarseBitmap>>();
  private texts = new Map<string, TextBitmap>();
  private compare: string | null = null;
  private overlay: Overlay | null = null;
  private pending: Request | null = null;
  private busy = false;
  private idle: Promise<void> = Promise.resolve();
  private lastK = -1;
  private lastExact = false;
  private lastT: Micros = 0;
  /** Bumped by every change that alters the picture; a render records the version it painted. */
  private version = 0;
  private paintedVersion = -1;
  /** Bumped by release and source removal: renders started before them neither paint nor report. */
  private gen = 0;
  private useCounter = 0;
  private slowTimes = new Map<string, number[]>();
  private reportedSlow = new Set<string>();
  private counts = { painted: 0, skipped: 0, inexact: 0, contextLosses: 0, recoveries: 0 };

  constructor(private readonly deps: EngineDeps) {}

  /** Resolves when no render is running or queued (tests). */
  settled(): Promise<void> {
    return this.idle;
  }

  handle(m: ToEngine): void {
    switch (m.type) {
      case 'hello':
        return;
      case 'engine:canvas':
        this.attach(m.canvas, m.width, m.height);
        return;
      case 'engine:resize':
        this.comp?.resize(m.width, m.height);
        return this.repaint();
      case 'engine:looks':
        for (const [k, v] of Object.entries(m.tables)) this.looks.set(k, v);
        this.comp?.setLooks(this.looks);
        return this.repaint();
      case 'engine:media':
        this.setMedia(m.media);
        return this.repaint();
      case 'engine:setProject':
        this.project = m.project;
        return this.repaint();
      case 'engine:tick':
        return this.request({ t: m.t, playing: m.playing, seek: false });
      case 'engine:seek':
        return this.request({ t: m.t, playing: false, seek: true });
      case 'engine:setTextBitmaps':
        for (const [id, t] of this.texts) if (m.bitmaps[id]?.bitmap !== t.bitmap) t.bitmap.close();
        this.texts = new Map(Object.entries(m.bitmaps));
        return this.repaint();
      case 'engine:compare':
        this.compare = m.clipId;
        return this.repaint();
      case 'engine:overlay':
        this.overlay = m.overlay;
        return this.repaint();
      case 'engine:effectsCheck':
        void this.deps.effectsCheck().then((r) => this.deps.post({ type: 'engine:effects', ...r }));
        return;
      case 'engine:lookThumbnails':
        // RULE-09 thumbnails need MOD-Plan's thumbnailPlan, built with F-008.
        this.deps.post({ type: 'engine:error', message: 'lookThumbnails: built with F-008' });
        return;
      case 'engine:stats':
        this.deps.post({ type: 'engine:stats', stats: this.stats() });
        return;
      case 'engine:release':
        this.release();
        return;
    }
  }

  stats(): EngineStats {
    const slots = this.slots.map((b) => b.slot).filter((s): s is SlotLike => s !== null);
    return {
      ...this.counts,
      restarts: slots.reduce((a, s) => a + s.stats.restarts, 0),
      flushes: slots.reduce((a, s) => a + s.stats.flushes, 0),
      openFrames: slots.reduce((a, s) => a + s.openFrames, 0),
    };
  }

  private attach(canvas: OffscreenCanvas, width: number, height: number): void {
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const comp = this.deps.createCompositor(canvas, this.looks, { phone: this.deps.phone });
    comp.onContextLost(() => this.onContextLost(comp));
    this.comp = comp;
    this.repaint();
  }

  /** ADR-0006 outcome rule 6: re-create the context's resources and repaint the current plan. */
  private onContextLost(comp: Compositor): void {
    this.counts.contextLosses++;
    this.deps.post({ type: 'engine:contextLost' });
    comp.recover().then(
      () => {
        this.counts.recoveries++;
        this.deps.post({ type: 'engine:contextRestored' });
        this.repaint();
      },
      () => this.deps.post({ type: 'engine:contextFailed' }),
    );
  }

  private setMedia(media: readonly EngineMedia[]): void {
    const next = new Map(media.map((m) => [m.id, m]));
    for (const [id, old] of this.media) {
      const now = next.get(id);
      if (now === undefined || (old.kind === 'video' && (now.kind !== 'video' || now.file !== old.file))) {
        this.dropSource(id);
      }
      if (old.kind === 'photo' && (now?.kind !== 'photo' || now.bitmap !== old.bitmap)) old.bitmap.close();
    }
    this.media = next;
  }

  /** ADR-0009 §7: removing a source releases its decoders, frames and coarse copies. */
  private dropSource(id: string): void {
    this.gen++;
    for (const b of this.slots)
      if (b.sourceId === id) {
        b.slot?.close();
        b.slot = null;
        b.sourceId = null;
        b.key = null;
      }
    this.coarse.get(id)?.clear();
    this.coarse.delete(id);
    const v = this.videos.get(id);
    this.videos.delete(id);
    this.failed.delete(id);
    void v?.then((s) => s?.close());
  }

  /** ADR-0003 §5: before an export, every decoder and cache goes. */
  release(): void {
    this.gen++;
    for (const id of [...this.videos.keys()]) this.dropSource(id);
    for (const b of this.slots) b.slot?.close();
    this.slots = [];
    for (const c of this.coarse.values()) c.clear();
    this.coarse.clear();
    this.lastK = -1;
    this.version++;
  }

  /** The picture changed: paint the current time again (a queued request already will). */
  private repaint(): void {
    this.version++;
    if (this.pending) return;
    this.request({ t: this.lastT, playing: false, seek: false });
  }

  private request(r: Request): void {
    // A tick replacing a queued seek keeps it a seek: the decoder may restart for it.
    this.pending = { ...r, seek: r.seek || (this.pending?.seek ?? false) };
    if (this.busy) return;
    this.busy = true;
    this.idle = this.loop();
  }

  private async loop(): Promise<void> {
    try {
      while (this.pending) {
        const r = this.pending;
        this.pending = null;
        try {
          await this.render(r);
        } catch (e) {
          this.deps.post({ type: 'engine:error', message: e instanceof Error ? e.message : String(e) });
        }
      }
    } finally {
      this.busy = false;
    }
  }

  private video(id: string): Promise<VideoSourceLike | null> {
    let v = this.videos.get(id);
    if (!v) {
      const m = this.media.get(id);
      v =
        m?.kind === 'video'
          ? this.deps.openVideo(id, m.file).catch(() => {
              this.sourceFailed(id);
              return null;
            })
          : Promise.resolve(null);
      this.videos.set(id, v);
    }
    return v;
  }

  private sourceFailed(id: string): void {
    if (this.failed.has(id)) return;
    this.failed.add(id);
    this.deps.post({ type: 'engine:sourceError', id });
  }

  /**
   * Decoder slots for video layers (ADR-0009 outcome rule 5, one helper for render and warm-up), one
   * per decode run (runKeys). Slots serving the `keep` runs are never taken; a layer that finds no
   * slot gets null.
   */
  private async slotsFor(
    project: Project,
    layers: FramePlan['layers'],
    keep: readonly string[] = [],
  ): Promise<(SlotLike | null)[]> {
    const keys = runKeys(project.clips);
    const wanted = layers.map((l) =>
      l.clip.kind === 'video' ? { key: keys.get(l.clip.id) ?? l.clip.id, sourceId: l.clip.sourceId } : null,
    );
    const sources = await Promise.all(wanted.map((w) => (w ? this.video(w.sourceId) : Promise.resolve(null))));
    const live = wanted.filter((w, i): w is { key: string; sourceId: string } => w !== null && sources[i] !== null);
    const idx = assignSlots(
      this.slots.map((b) => b.key),
      this.slots.map((b) => b.lastUsed),
      [...keep, ...live.map((w) => w.key)],
      this.deps.budget.decoders,
    ).slice(keep.length);
    const out: (SlotLike | null)[] = [];
    let n = 0;
    wanted.forEach((w, i) => {
      const src = sources[i];
      if (!w || !src) {
        out.push(null);
        return;
      }
      const at = idx[n++] ?? -1;
      if (at < 0) {
        out.push(null);
        return;
      }
      const bound = (this.slots[at] ??= { key: null, sourceId: null, slot: null, lastUsed: 0 });
      if (bound.key !== w.key || !bound.slot) {
        bound.slot?.close();
        bound.slot = src.newSlot(this.deps.budget.framesPerDecoder, { idleFlush: true });
        bound.key = w.key;
        bound.sourceId = w.sourceId;
        this.watchCoarse(w.sourceId, src, bound.slot);
      }
      bound.lastUsed = ++this.useCounter;
      out.push(bound.slot);
    });
    return out;
  }

  private watchCoarse(id: string, src: VideoSourceLike, slot: SlotLike): void {
    if (!keepsCoarse(src.keySpacing)) return;
    let cache = this.coarse.get(id);
    if (!cache) {
      cache = new CoarseCache<CoarseBitmap>(this.deps.budget.coarsePerSource);
      this.coarse.set(id, cache);
    }
    const c = cache;
    slot.onFrame = (f) => {
      if (!c.wants(f.timestamp)) return;
      const ts = f.timestamp;
      void this.deps
        .coarseCopy(f)
        .then((b) => {
          // The source may have gone meanwhile; `add` re-checks the spacing and closes extras.
          if (this.coarse.get(id) !== c) b.close();
          else c.add(ts, b);
        })
        .catch(() => undefined);
    };
  }

  private paintFrame(f: EngineFrame | CoarseBitmap, rotation: Rotation): PaintFrame {
    const w = 'displayWidth' in f ? f.displayWidth : f.width;
    const h = 'displayHeight' in f ? f.displayHeight : f.height;
    return { image: f as unknown as TexImageSource, width: w, height: h, rotation };
  }

  private paint(plan: FramePlan, frames: readonly (PaintFrame | null)[], exact: boolean): void {
    const comp = this.comp;
    if (!comp || comp.lost) return;
    comp.paint(plan, frames, this.texts, { compare: this.compare });
    if (this.overlay) comp.paintOverlay(this.overlay);
    this.counts.painted++;
    this.deps.post({ type: 'engine:frameShown', t: plan.time, frameIndex: plan.frameIndex, exact });
  }

  private async render(req: Request): Promise<void> {
    const comp = this.comp;
    const project = this.project;
    if (!comp || !project || comp.lost) return;
    const version = this.version;
    const gen = this.gen;
    const stale = (): boolean => gen !== this.gen;
    const rate = project.frame.frameRate;
    const total = projectFrames(project);
    let k = frameIndexAt(Math.max(0, req.t), rate);
    // Nothing past the end is drawn (INV-07): at or after the end the last frame stays on screen.
    if (total > 0 && k >= total) k = total - 1;
    if (this.paintedVersion === version && k === this.lastK && this.lastExact) return;
    this.lastT = req.t;
    const plan = framePlan(project, k);
    const mode: FrameMode = req.playing ? 'play' : 'exact';
    const slots = await this.slotsFor(project, plan.layers);
    const rotations = await Promise.all(
      plan.layers.map(async (l) =>
        l.clip.kind === 'video' ? ((await this.video(l.clip.sourceId))?.rotation ?? 0) : 0,
      ),
    );
    if (stale()) return;
    let coarsePainted = false;
    const coarseFrames = (i: number, f: PaintFrame): (PaintFrame | null)[] =>
      plan.layers.map((l, j) => {
        if (j === i) return f;
        const peek = slots[j]?.peek(l.sourceTime);
        return peek ? this.paintFrame(peek, rotations[j] as Rotation) : this.photoFrame(l.clip.sourceId);
      });
    // Long-GOP sources: a kept copy near the target paints at once (ADR-0009 outcome rule 4).
    if (req.seek)
      plan.layers.forEach((l, i) => {
        const cache = this.coarse.get(l.clip.sourceId);
        const near = cache?.nearest(l.sourceTime);
        const peek = slots[i]?.peek(l.sourceTime);
        if (
          coarsePainted ||
          !near ||
          (peek && Math.abs(peek.timestamp - l.sourceTime) <= Math.abs(near.t - l.sourceTime))
        )
          return;
        this.paint(plan, coarseFrames(i, this.paintFrame(near.item, rotations[i] as Rotation)), false);
        coarsePainted = true;
      });
    const results = await Promise.all(
      plan.layers.map(async (l, i): Promise<{ frame: PaintFrame | null; exact: boolean }> => {
        if (l.clip.kind === 'photo') return { frame: this.photoFrame(l.clip.sourceId), exact: true };
        const slot = slots[i];
        if (!slot) return { frame: null, exact: false };
        const onCoarse = req.seek
          ? (f: EngineFrame): void => {
              if (!coarsePainted && !stale()) {
                this.paint(plan, coarseFrames(i, this.paintFrame(f, rotations[i] as Rotation)), false);
                coarsePainted = true;
              }
              f.close();
            }
          : undefined;
        const r = await this.decodeWithRetry(slot, l.sourceTime, mode, onCoarse, req.seek, l.clip.sourceId, stale);
        return r?.frame
          ? { frame: this.paintFrame(r.frame, rotations[i] as Rotation), exact: r.exact }
          : { frame: null, exact: false };
      }),
    );
    // Released or a source removed meanwhile: these frames may be closed already.
    if (stale()) return;
    // A newer seek or tick replaces this one before it is painted (latest wins).
    if (this.pending && !req.playing && this.pending.seek) return;
    const exact = results.every((r) => r.exact && r.frame !== null);
    if (req.playing) {
      if (results.some((r, i) => r.frame === null && plan.layers[i]!.clip.kind === 'video')) {
        // Keep the previous picture rather than show a hole; the sound plays on (F-002 edge case).
        this.deps.post({ type: 'engine:stalled', t: plan.time });
        return;
      }
      if (this.lastK >= 0 && k > this.lastK + 1) this.counts.skipped += k - this.lastK - 1;
      results.forEach((r, i) => {
        if (!r.exact && r.frame) this.noteInexact(plan.layers[i]!.clip.sourceId);
      });
      if (!exact) this.counts.inexact++;
    }
    this.paint(
      plan,
      results.map((r) => r.frame),
      exact,
    );
    this.lastK = k;
    this.lastExact = exact;
    this.paintedVersion = version; // changes that arrived meanwhile are painted by the queued request
    if (req.playing) this.decodeAhead(project, plan, slots);
  }

  /**
   * A decoder error is retried once with a fresh decoder (software preferred); only a repeated failure
   * refuses the source (RULE-22: only that item is left out). Stale renders report nothing.
   */
  private async decodeWithRetry(
    slot: SlotLike,
    t: Micros,
    mode: FrameMode,
    onCoarse: ((f: EngineFrame) => void) | undefined,
    jump: boolean,
    sourceId: string,
    stale: () => boolean,
  ): Promise<FrameResult<EngineFrame> | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await slot.frameAt(t, mode, onCoarse, jump || attempt > 0);
      } catch {
        if (stale()) return null;
      }
    }
    this.sourceFailed(sourceId);
    return null;
  }

  private photoFrame(sourceId: string): PaintFrame | null {
    const m = this.media.get(sourceId);
    return m?.kind === 'photo' ? this.paintFrame(m.bitmap as unknown as CoarseBitmap, 0) : null;
  }

  /** RULE-22: a source decoding slower than real time is reported once. */
  private noteInexact(id: string): void {
    if (this.reportedSlow.has(id)) return;
    const now = this.deps.now();
    const times = (this.slowTimes.get(id) ?? []).filter((t) => now - t < SLOW_WINDOW_MS);
    times.push(now);
    this.slowTimes.set(id, times);
    if (times.length >= SLOW_PAINTS) {
      this.reportedSlow.add(id);
      this.deps.post({ type: 'engine:slowSource', id });
    }
  }

  /**
   * Decode-ahead for the visible clips, and the next clip's warm-up (ADR-0009 §4): the next decode run
   * gets a slot the visible clips do not use and decodes its first frame.
   */
  private decodeAhead(project: Project, plan: FramePlan, slots: readonly (SlotLike | null)[]): void {
    plan.layers.forEach((l, i) => void slots[i]?.prefetch(l.sourceTime).catch(() => undefined));
    const rate = project.frame.frameRate;
    const { spans } = layoutOf(project);
    const nextIndex = spans.findIndex((s) => s.startFrame > plan.frameIndex);
    const span = spans[nextIndex];
    const clip = project.clips[nextIndex];
    if (!span || !clip || clip.kind !== 'video') return;
    if (frameStart(span.startFrame, rate) - plan.time > WARMUP_US) return;
    const keys = runKeys(project.clips);
    const key = keys.get(clip.id) ?? clip.id;
    if (this.slots.some((b) => b.key === key)) return; // the same decode run, or already warm
    const layer = framePlan(project, span.startFrame).layers.find((l) => l.clip.id === clip.id);
    if (!layer) return;
    const visible = plan.layers.map((l) => keys.get(l.clip.id) ?? l.clip.id);
    void this.slotsFor(project, [layer], visible)
      .then(async ([slot]) => {
        if (slot) await slot.frameAt(layer.sourceTime, 'exact');
      })
      .catch(() => undefined);
  }
}
