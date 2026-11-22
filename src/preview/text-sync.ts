// MOD-Preview — keeps the engine's text bitmaps in step with the project and the preview's size (ADR-0012
// §3): a layer is rasterised again only when its pixels change (content, style, size or the canvas size;
// moving it or changing its times does not), the new bitmaps are transferred, and the others are kept by
// id. Results are posted in the order the changes came: one that finishes after a later change's result was
// posted is closed, never sent (while typing fast, each result that is still the newest shows).
// With a playhead and a byte budget (ADR-0009 §4: ≤ 32 MB phone, ≤ 96 MB laptop; build question 172) only
// the layers near the playhead are rasterised, nearest first; held bitmaps are kept least-recently-used
// within the budget, and one that was let go is rasterised again when the playhead comes near (a miss).
// A layer showing at the playhead is never let go for the budget.
// Implements: F-010.R5 (the preview draws the text the export draws), F-010.R1/R2 (typing and styling show
// in the preview as they happen), ADR-0012 §3, ADR-0009 §4, NFR-05.
import type { Micros, TextBitmap, TextLayer, ToEngine } from '../core';
import { rasteriseText, rasterKey } from './text';
import { bitmapBytes, distanceFrom, nearPlayhead, showingAt, TextBitmapLru } from './text-budget';

export type Rasterise = (layer: TextLayer, W: number, H: number) => Promise<ImageBitmap | null>;

export interface TextSync {
  /**
   * The project's layers, the canvas size in device pixels or the playhead changed (or may have). Without
   * `t` every layer is wanted (no playhead window).
   */
  update(layers: readonly TextLayer[], W: number, H: number, t?: Micros): Promise<void>;
  /** The ids the engine holds a bitmap for, least recently used first (tests, NFR-05 measurement). */
  held(): string[];
  /** Bytes the held bitmaps take. */
  heldBytes(): number;
  dispose(): void;
}

export function textSync(
  post: (m: ToEngine, transfer: Transferable[]) => void,
  rasterise: Rasterise = rasteriseText,
  budget: number = Number.POSITIVE_INFINITY,
): TextSync {
  /** What the engine holds per id: the raster key of its bitmap. */
  const held = new Map<string, string>();
  const lru = new TextBitmapLru(budget);
  let ticket = 0;
  /** The newest change whose result was posted. */
  let posted = 0;
  let live = true;
  /** The last known size of each layer's bitmap (any raster key): the estimate for choosing within budget. */
  const sizes = new Map<string, number>();
  /** Layers let go for the budget, with the raster key they had: not rasterised again until they show. */
  const skipped = new Map<string, string>();
  const drop = (id: string): void => {
    held.delete(id);
    lru.delete(id);
  };
  return {
    async update(layers, W, H, t) {
      const mine = ++ticket;
      const wanted = new Map(layers.map((l) => [l.id, rasterKey(l, W, H)] as const));
      for (const id of [...skipped.keys()]) if (!wanted.has(id)) skipped.delete(id);
      // Nearest first; the playhead window decides what is wanted now (all layers without a playhead).
      const near = (t === undefined ? [...layers] : layers.filter((l) => nearPlayhead(l, t))).sort((a, b) =>
        t === undefined ? 0 : distanceFrom(a, t) - distanceFrom(b, t),
      );
      const pinned = new Set(t === undefined ? [] : layers.filter((l) => showingAt(l, t)).map((l) => l.id));
      // Choose what fits before rasterising (nearest first; a showing layer always): a layer whose size is
      // known and would pass the budget is not rasterised only to be let go again, nor is one already let
      // go at the same raster key, until it shows (then it is pinned and always rasterised).
      let planned = 0;
      const chosen = new Set<string>();
      for (const l of near) {
        const current = held.get(l.id) === wanted.get(l.id);
        const est = current ? lru.bytesOf(l.id) : (sizes.get(l.id) ?? 0);
        const show = pinned.has(l.id);
        if (!show && !current && skipped.get(l.id) === wanted.get(l.id)) continue;
        if (show || planned + est <= budget) {
          chosen.add(l.id);
          planned += est;
        }
      }
      const stale = near.filter((l) => chosen.has(l.id) && held.get(l.id) !== wanted.get(l.id));
      // A held bitmap that is gone from the project, or out of date and not near: let go (rasterised on a miss).
      const gone = [...held.keys()].filter(
        (id) => !wanted.has(id) || (held.get(id) !== wanted.get(id) && !near.some((l) => l.id === id)),
      );
      if (!stale.length && !gone.length) {
        // The engine already shows this: an older result still running must not replace it.
        for (const l of [...near].reverse()) lru.touch(l.id);
        posted = mine;
        return;
      }
      const made: [TextLayer, ImageBitmap | null][] = [];
      try {
        for (const l of stale) made.push([l, await rasterise(l, W, H)]);
      } catch (e) {
        // A layer failed: the bitmaps made so far are never sent, so they are closed here.
        for (const [, b] of made) b?.close();
        throw e;
      }
      if (mine < posted || !live) {
        for (const [, b] of made) b?.close();
        return;
      }
      posted = mine;
      for (const id of gone) drop(id);
      for (const [l, b] of made) {
        if (b) {
          held.set(l.id, wanted.get(l.id)!);
          lru.set(l.id, bitmapBytes(b));
          sizes.set(l.id, bitmapBytes(b));
          skipped.delete(l.id);
        } else drop(l.id);
      }
      // The nearest layers become the most recently used; then the budget lets the least recent ones go.
      for (const l of [...near].reverse()) lru.touch(l.id);
      const evicted = new Set(lru.evict(pinned));
      for (const id of evicted) {
        held.delete(id);
        if (wanted.has(id)) skipped.set(id, wanted.get(id)!);
      }
      const bitmaps: Record<string, TextBitmap> = {};
      const transfer: Transferable[] = [];
      for (const [l, b] of made) {
        if (!b) continue;
        if (evicted.has(l.id)) {
          b.close();
          continue;
        }
        bitmaps[l.id] = { bitmap: b, s: Math.min(W, H) };
        transfer.push(b);
      }
      const keep = [...held.keys()].filter((id) => !(id in bitmaps));
      post({ type: 'engine:setTextBitmaps', bitmaps, keep }, transfer);
    },
    held: () => lru.ids().filter((id) => held.has(id)),
    heldBytes: () => lru.total,
    dispose() {
      live = false;
      ticket++;
    },
  };
}
