// MOD-Preview — keeps the engine's text bitmaps in step with the project and the preview's size (ADR-0012
// §3): a layer is rasterised again only when its pixels change (content, style, size or the canvas size;
// moving it or changing its times does not), the new bitmaps are transferred, and the others are kept by
// id. A later change supersedes a rasterisation still running (its bitmaps are closed, never sent).
// Implements: F-010.R5 (the preview draws the text the export draws), F-010.R1/R2 (typing and styling show
// in the preview as they happen), ADR-0012 §3.
import type { TextBitmap, TextLayer, ToEngine } from '../core';
import { rasteriseText, rasterKey } from './text';

export type Rasterise = (layer: TextLayer, W: number, H: number) => Promise<ImageBitmap | null>;

export interface TextSync {
  /** The project's layers and the canvas size in device pixels changed (or may have). */
  update(layers: readonly TextLayer[], W: number, H: number): Promise<void>;
  dispose(): void;
}

export function textSync(
  post: (m: ToEngine, transfer: Transferable[]) => void,
  rasterise: Rasterise = rasteriseText,
): TextSync {
  /** What the engine holds per id: the raster key of its bitmap. */
  const held = new Map<string, string>();
  let ticket = 0;
  let live = true;
  return {
    async update(layers, W, H) {
      const mine = ++ticket;
      const wanted = new Map(layers.map((l) => [l.id, rasterKey(l, W, H)] as const));
      const stale = layers.filter((l) => held.get(l.id) !== wanted.get(l.id));
      const gone = [...held.keys()].some((id) => !wanted.has(id));
      if (!stale.length && !gone) return;
      const made: [TextLayer, ImageBitmap | null][] = [];
      for (const l of stale) made.push([l, await rasterise(l, W, H)]);
      if (mine !== ticket || !live) {
        for (const [, b] of made) b?.close();
        return;
      }
      const bitmaps: Record<string, TextBitmap> = {};
      const transfer: Transferable[] = [];
      for (const [l, b] of made) {
        if (b) {
          bitmaps[l.id] = { bitmap: b, s: Math.min(W, H) };
          transfer.push(b);
          held.set(l.id, wanted.get(l.id)!);
        } else held.delete(l.id);
      }
      const keep = [...held.keys()].filter((id) => wanted.has(id) && !(id in bitmaps));
      for (const id of [...held.keys()]) if (!wanted.has(id)) held.delete(id);
      post({ type: 'engine:setTextBitmaps', bitmaps, keep }, transfer);
    },
    dispose() {
      live = false;
      ticket++;
    },
  };
}
