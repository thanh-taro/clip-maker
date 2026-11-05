// MOD-Engine — the coarse frame cache for long-GOP sources (ADR-0009 outcome rule 4): while decoding
// forward, a source whose keyframes are more than 2 s apart keeps a preview-size copy of about one
// frame per second (≤ 32 per source), so a backward scrub paints something at once (NFR-03).
import type { Micros } from '../core';

/** Keyframe spacing above which a source keeps coarse frames, s. */
export const COARSE_MIN_SPACING_S = 2;
/** About one kept frame per second. */
export const COARSE_INTERVAL_US = 1_000_000;

export interface Closeable {
  close(): void;
}

/** Does a source with this keyframe spacing (s, null = unknown) keep coarse frames? */
export const keepsCoarse = (keySpacing: number | null): boolean =>
  keySpacing !== null && keySpacing > COARSE_MIN_SPACING_S;

export class CoarseCache<B extends Closeable> {
  private entries: { t: Micros; item: B }[] = [];

  constructor(private readonly max: number) {}

  get size(): number {
    return this.entries.length;
  }

  /** Is a frame at `t` worth keeping (no kept frame within the interval)? */
  wants(t: Micros): boolean {
    return !this.entries.some((e) => Math.abs(e.t - t) < COARSE_INTERVAL_US);
  }

  /** Adds a frame; when full, the entry farthest from `t` goes (it is the least likely to be scrubbed to). */
  add(t: Micros, item: B): void {
    if (!this.wants(t)) {
      item.close();
      return;
    }
    this.entries.push({ t, item });
    this.entries.sort((a, b) => a.t - b.t);
    while (this.entries.length > this.max) {
      let far = 0;
      for (let i = 1; i < this.entries.length; i++)
        if (Math.abs(this.entries[i]!.t - t) > Math.abs(this.entries[far]!.t - t)) far = i;
      this.entries.splice(far, 1)[0]!.item.close();
    }
  }

  /** The kept frame nearest at or before `t` (else the first after it), or null. */
  nearest(t: Micros): { t: Micros; item: B } | null {
    let best: { t: Micros; item: B } | null = null;
    for (const e of this.entries) if (e.t <= t) best = e;
    return best ?? this.entries[0] ?? null;
  }

  clear(): void {
    for (const e of this.entries) e.item.close();
    this.entries = [];
  }
}
