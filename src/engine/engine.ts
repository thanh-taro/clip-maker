// MOD-Engine — preview playback and seeking (ADR-0003 §2, ADR-0009 and their outcomes), promoted from
// SP-compositor's engine worker. On each tick (the audio clock's time while playing, the playhead
// while paused) it asks MOD-Plan for the frame plan, gets the needed source frames from its decoder
// slots, and calls MOD-Compositor's `paint`. Requests are coalesced: the latest wins. Independent of the
// worker scope so it is unit-tested with fakes.
// Implements: F-002.R1–R4/R6 (picture at the playhead, picture following the sound clock, scrub, step),
// F-002 edge case "frames are skipped to keep sound in sync", RULE-22 (slow source → slowSource once;
// the newest frame is shown while sound plays on), NFR-03 (coarse-then-exact seeks), NFR-05 (bounded
// decoders, frames and coarse copies), ADR-0006 outcome rule 6 (the preview always recovers from a
// WebGL context loss), F-008.R1 (look thumbnails, RULE-09) and F-008.R2 (a look previewed on the selected
// clip without an undo step).
import {
  frameAspect,
  frameIndexAt,
  LOOK_IDS,
  frameStart,
  layoutOf,
  projectFrames,
  type EngineMedia,
  type EngineStats,
  type FromEngine,
  type Look,
  type Micros,
  type Overlay,
  type Project,
  type TextBitmap,
  type ToEngine,
} from '../core';
import { framePlan, thumbnailPlan, type FramePlan } from '../plan';
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

/** Look-gallery thumbnails (RULE-09): their own small canvas, and its picture taken as a bitmap. */
export interface ThumbnailSurface {
  canvas(width: number, height: number): OffscreenCanvas;
  /** The canvas's current picture (OffscreenCanvas.transferToImageBitmap in the worker). */
  bitmap(canvas: OffscreenCanvas): ImageBitmap;
}

export interface EngineDeps {
  post(m: FromEngine, transfer?: Transferable[]): void;
  createCompositor(canvas: OffscreenCanvas, looks: ReadonlyMap<string, LookTable>, o: CompositorOptions): Compositor;
  openVideo(id: string, file: Blob): Promise<VideoSourceLike>;
  /** `onDrawn` is called once the chain compiled and drew its first frame (MOD-Compositor). */
  effectsCheck(onDrawn?: (ok: boolean) => void): Promise<EffectsResult>;
  /** A preview-size copy of a frame for the coarse cache (ADR-0009 outcome rule 4). */
  coarseCopy(frame: EngineFrame): Promise<CoarseBitmap>;
  readonly budget: Budget;
  readonly phone: boolean;
  now(): number;
  /** Look thumbnails (F-008.R1); without it a request is answered with an error. */
  readonly thumbnails?: ThumbnailSurface;
}

type ThumbRequest = Extract<ToEngine, { type: 'engine:lookThumbnails' }>;

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
  private lookPreview: { readonly clipId: string; readonly look: Look } | null = null;
  private overlay: Overlay | null = null;
  /** The latest look-thumbnail request not yet drawn (latest wins). */
  private thumbRequest: ThumbRequest | null = null;
  private thumbs: { comp: Compositor; canvas: OffscreenCanvas } | null = null;
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
        this.thumbs?.comp.setLooks(this.looks);
        return this.repaint();
      case 'engine:media':
        this.setMedia(m.media);
        return this.repaint();
      case 'engine:mediaChanges':
        this.changeMedia(m.add, m.remove);
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
        // RULE-22 (F-023): "drawn" decides the opening screen; the timed result only the slow notice.
        void this.deps
          .effectsCheck((ok) => this.deps.post({ type: 'engine:effectsDrawn', ok }))
          .then((r) => this.deps.post({ type: 'engine:effects', ...r }));
        return;
      case 'engine:previewLook':
        this.lookPreview = m.clipId === null ? null : { clipId: m.clipId, look: m.look };
        return this.repaint();
      case 'engine:lookThumbnails':
        if (!this.deps.thumbnails) {
          this.deps.post({ type: 'engine:error', message: 'lookThumbnails: no thumbnail surface' });
          return;
        }
        this.thumbRequest = m;
        return this.kick();
      case 'engine:stats':
        this.deps.post({ type: 'engine:stats', stats: this.stats() });
        return;
      case 'engine:release':
        this.release();
        return;
      case 'engine:soundFeed':
        return; // served by the worker scope (MOD-Container), not drawn
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

  /**
   * The whole list. A source id's file never changes within a session (MOD-Media ids are never reused),
   * so a source that stays is kept as it is, whatever object arrived for it (messages are cloned):
   * its decoders and slots survive. Duplicate photo bitmaps that arrived are closed.
   */
  private setMedia(media: readonly EngineMedia[]): void {
    const next = new Set(media.map((m) => m.id));
    this.changeMedia(
      media,
      [...this.media.keys()].filter((id) => !next.has(id)),
    );
  }

  /** Implements: ADR-0009 §7 — sources added and removed by id; the others keep their decoders. */
  private changeMedia(add: readonly EngineMedia[], remove: readonly string[]): void {
    for (const id of remove) {
      const old = this.media.get(id);
      if (!old) continue;
      this.dropSource(id);
      if (old.kind === 'photo') old.bitmap.close();
      this.media.delete(id);
    }
    for (const m of add) {
      if (this.media.has(m.id)) {
        if (m.kind === 'photo' && m.bitmap !== (this.media.get(m.id) as { bitmap?: ImageBitmap }).bitmap)
          m.bitmap.close();
        continue;
      }
      // A source asked for before its media arrived was remembered as missing: open it now (F-002.R1).
      this.videos.delete(m.id);
      this.failed.delete(m.id);
      this.media.set(m.id, m);
    }
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
    this.kick();
  }

  private kick(): void {
    if (this.busy) return;
    this.busy = true;
    this.idle = this.loop();
  }

  /** Preview renders first; look thumbnails when no render waits (they never hold the preview back). */
  private async loop(): Promise<void> {
    try {
      while (this.pending || this.thumbRequest) {
        try {
          if (this.pending) {
            const r = this.pending;
            this.pending = null;
            await this.render(r);
          } else if (this.thumbRequest) {
            const t = this.thumbRequest;
            this.thumbRequest = null;
            await this.renderThumbnails(t);
          }
        } catch (e) {
          this.deps.post({ type: 'engine:error', message: e instanceof Error ? e.message : String(e) });
        }
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * Implements: RULE-09 *Thumbnails*, F-008.R1 — the selected clip's RULE-09 frame (MOD-Plan
   * `thumbnailPlan`) decoded once and painted with each loaded look at 100 on the thumbnail canvas, its
   * shorter side `side` pixels in the project's frame; each picture is posted as it is drawn, so the gallery
   * fills in. A newer request, a preview render waiting, or a source change stops this one.
   */
  private async renderThumbnails(req: ThumbRequest): Promise<void> {
    const project = this.project;
    const surface = this.deps.thumbnails;
    if (!project || !surface) return;
    const base = thumbnailPlan(project, req.clipId, req.t, null);
    const layer = base?.layers[0];
    if (!base || !layer) return;
    const gen = this.gen;
    const superseded = (): boolean => gen !== this.gen || this.thumbRequest !== null || this.project !== project;
    let frame: PaintFrame | null;
    if (layer.clip.kind === 'photo') frame = this.photoFrame(layer.clip.sourceId);
    else {
      const [slot] = await this.slotsFor(project, base.layers);
      const r = slot
        ? await this.decodeWithRetry(slot, layer.sourceTime, 'exact', undefined, false, layer.clip.sourceId, superseded)
        : null;
      const rotation = (await this.video(layer.clip.sourceId))?.rotation ?? 0;
      frame = r?.frame ? this.paintFrame(r.frame, rotation) : null;
      // The preview's decoder may have moved for the thumbnail: the next paint decodes its own frame again.
      this.lastK = -1;
    }
    if (!frame || superseded()) return;
    const aspect = frameAspect(project);
    const side = Math.max(1, Math.round(req.side));
    const width = Math.max(1, Math.round(aspect >= 1 ? side * aspect : side));
    const height = Math.max(1, Math.round(aspect >= 1 ? side : side / aspect));
    let thumbs = this.thumbs;
    if (!thumbs || thumbs.comp.lost) {
      thumbs?.comp.dispose();
      const canvas = surface.canvas(width, height);
      thumbs = { canvas, comp: this.deps.createCompositor(canvas, this.looks, { phone: this.deps.phone }) };
      this.thumbs = thumbs;
    }
    if (thumbs.comp.width !== width || thumbs.comp.height !== height) thumbs.comp.resize(width, height);
    for (const lookId of LOOK_IDS) {
      if (!this.looks.has(lookId)) continue;
      // A waiting preview render goes first; this request carries on after it unless replaced.
      if (this.pending) await Promise.resolve();
      if (superseded() || thumbs.comp.lost) return;
      const plan = thumbnailPlan(project, req.clipId, req.t, lookId);
      if (!plan) return;
      thumbs.comp.paint(plan, [frame]);
      const bitmap = surface.bitmap(thumbs.canvas);
      this.deps.post({ type: 'engine:lookThumbnail', ticket: req.ticket, clipId: req.clipId, lookId, bitmap }, [
        bitmap,
      ]);
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
    comp.paint(plan, frames, this.texts, { compare: this.compare, lookPreview: this.lookPreview });
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
