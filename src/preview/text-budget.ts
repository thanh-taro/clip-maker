// MOD-Preview — the text-bitmap budget of ADR-0009 §4 (≤ 32 MB phone, ≤ 96 MB laptop; build question 172,
// QA-6): a least-recently-used record of the bitmaps the engine holds, by bytes. The preview keeps the
// layers near the playhead (showing now, or starting within TEXT_AHEAD) and lets the others go when the
// budget is passed; a layer that comes near again is rasterised again (text-sync.ts).
// Implements: NFR-05 (memory is a function of the edit, bounded per device class), ADR-0009 §4.
import type { Micros, TextLayer } from '../core';

/** A layer starting within this much after the playhead is rasterised ahead of time (µs). */
export const TEXT_AHEAD: Micros = 5_000_000;
/** A layer that ended within this much before the playhead still counts as near (µs; a step back). */
export const TEXT_BEHIND: Micros = 1_000_000;

/** Is `layer` near the playhead `t`: showing at `t`, ended within TEXT_BEHIND, or starting within TEXT_AHEAD? */
export function nearPlayhead(layer: Pick<TextLayer, 'start' | 'end'>, t: Micros): boolean {
  return layer.end > t - TEXT_BEHIND && layer.start <= t + TEXT_AHEAD;
}

/** How far `layer` is from the playhead (0 while it shows). */
export function distanceFrom(layer: Pick<TextLayer, 'start' | 'end'>, t: Micros): Micros {
  if (t < layer.start) return layer.start - t;
  if (t >= layer.end) return t - layer.end;
  return 0;
}

/** Is `layer` showing at `t` (it may never be evicted for the budget while it shows)? */
export const showingAt = (layer: Pick<TextLayer, 'start' | 'end'>, t: Micros): boolean =>
  layer.start <= t && t < layer.end;

/** Bytes an RGBA bitmap holds. */
export const bitmapBytes = (b: { readonly width?: number; readonly height?: number }): number =>
  Math.max(0, b.width ?? 0) * Math.max(0, b.height ?? 0) * 4;

/**
 * Bytes per held bitmap, least recently used first (Map insertion order). `budget` bounds the total;
 * `evict` drops the least recently used entries that are not pinned until the total fits.
 */
export class TextBitmapLru {
  private readonly entries = new Map<string, number>();
  private bytes = 0;

  constructor(readonly budget: number) {}

  get total(): number {
    return this.bytes;
  }

  /** Bytes recorded for `id` (0 when not held). */
  bytesOf(id: string): number {
    return this.entries.get(id) ?? 0;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }

  /** Marks `id` as the most recently used. */
  touch(id: string): void {
    const b = this.entries.get(id);
    if (b === undefined) return;
    this.entries.delete(id);
    this.entries.set(id, b);
  }

  /** Records (or replaces) `id`'s bitmap as the most recently used. */
  set(id: string, bytes: number): void {
    this.delete(id);
    this.entries.set(id, bytes);
    this.bytes += bytes;
  }

  delete(id: string): void {
    const b = this.entries.get(id);
    if (b === undefined) return;
    this.entries.delete(id);
    this.bytes -= b;
  }

  /** Drops least recently used, unpinned entries until the total is within the budget; returns them. */
  evict(pinned: ReadonlySet<string> = new Set()): string[] {
    const out: string[] = [];
    for (const [id] of this.entries) {
      if (this.bytes <= this.budget) break;
      if (pinned.has(id)) continue;
      this.delete(id);
      out.push(id);
    }
    return out;
  }
}
