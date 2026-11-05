// MOD-Export — main-thread watchers of a running export: progress with time remaining, and the
// interruption rules for a hidden page (ADR-0010 §7–§8, outcome item 10). Pure (time is passed in).

/** Progress is posted at least every 500 ms (ADR-0010 §7); the worker posts every 250 ms. */
export const PROGRESS_POST_MS = 250;
/** Time remaining is shown once 10 % is done (F-015.AC12). */
export const REMAINING_FROM = 0.1;
/** The moving-average window of the rate (ms). */
export const RATE_WINDOW_MS = 5000;
/** The last step (writing the index, handing over) keeps the bar below 100 % until done. */
export const FINAL_STEP = 0.01;

export interface ProgressView {
  /** 0..1, never going down (F-015.AC12). */
  readonly fraction: number;
  /** Milliseconds left, from 10 % on; null before. */
  readonly remainingMs: number | null;
}

/**
 * Implements: F-015.R3 / AC12, ADR-0010 §7 — frames muxed ÷ total frames (a final step for the index),
 * monotone; time remaining from a moving average of the rate once 10 % is done.
 */
export class ProgressTracker {
  private fraction = 0;
  private readonly samples: [t: number, f: number][] = [];

  update(done: number, total: number, now: number): ProgressView {
    const raw = total > 0 ? (done / total) * (1 - FINAL_STEP) : 0;
    this.fraction = Math.max(this.fraction, Math.min(1 - FINAL_STEP, raw));
    this.samples.push([now, this.fraction]);
    while (this.samples.length > 2 && now - this.samples[0]![0] > RATE_WINDOW_MS) this.samples.shift();
    return { fraction: this.fraction, remainingMs: this.remaining(now) };
  }

  done(): ProgressView {
    this.fraction = 1;
    return { fraction: 1, remainingMs: 0 };
  }

  private remaining(now: number): number | null {
    if (this.fraction < REMAINING_FROM * (1 - FINAL_STEP)) return null;
    const [t0, f0] = this.samples[0]!;
    const rate = now > t0 ? (this.fraction - f0) / (now - t0) : 0;
    if (rate <= 0) return null;
    return Math.round((1 - FINAL_STEP - this.fraction) / rate);
  }
}

/** Hidden with no progress for 5 s: rule (a). */
export const HIDDEN_STALL_MS = 5000;
/** Visible again without new progress within 3 s: rule (b). */
export const RETURN_GRACE_MS = 3000;
/** The worker is terminated if it does not answer an abort within 1.5 s (outcome item 10). */
export const ABORT_ANSWER_MS = 1500;

/**
 * Implements: F-015 edge case (page hidden), ADR-0010 outcome item 10 — with wall-clock time the export
 * is interrupted when (a) the page is hidden and no progress is made for 5 s, or (b) after the page
 * becomes visible again no new progress arrives within 3 s, or (c) an encoder or WebGL error follows a
 * hide. Without a hide, an error is a plain failure. An export still alive on return continues.
 */
export class InterruptWatch {
  private hiddenSince: number | null = null;
  private visibleAgainAt: number | null = null;
  private hadHide = false;
  private lastProgress: number;

  constructor(now: number, hidden = false) {
    this.lastProgress = now;
    if (hidden) this.visibility(true, now);
  }

  visibility(hidden: boolean, now: number): void {
    if (hidden) {
      this.hiddenSince ??= now;
      this.hadHide = true;
      this.visibleAgainAt = null;
    } else if (this.hiddenSince !== null) {
      this.hiddenSince = null;
      this.visibleAgainAt = now;
    }
  }

  progress(now: number): void {
    this.lastProgress = now;
    if (this.visibleAgainAt !== null && now >= this.visibleAgainAt) this.visibleAgainAt = null;
  }

  /** True when the export must stop with COPY-error.export_interrupted. */
  interrupted(now: number): boolean {
    if (this.hiddenSince !== null && now - Math.max(this.lastProgress, this.hiddenSince) >= HIDDEN_STALL_MS)
      return true;
    return this.visibleAgainAt !== null && now - this.visibleAgainAt >= RETURN_GRACE_MS;
  }

  /** Rule (c): an error after a hide is an interruption, otherwise a failure. */
  errorKind(): 'interrupted' | 'failed' {
    return this.hadHide ? 'interrupted' : 'failed';
  }
}
