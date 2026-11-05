// MOD-Project — snapshot history (ADR-0011 §3). Pure: steps hold the documents before and after.
// Implements: RULE-13 (every completed edit is one step, coalesced gestures, at least 200 steps,
// a new step discards the redo steps — F-014.R4).
import type { Project } from '../core';

export interface Step {
  readonly before: Project;
  readonly after: Project;
  /** IDs of the items the step changed (selected after undo/redo when they exist). */
  readonly changed: readonly string[];
  /** Gesture token: steps recorded under the same open gesture merge into one. */
  readonly gesture: number | null;
}

export interface History {
  readonly past: readonly Step[];
  readonly future: readonly Step[];
}

/** RULE-13: at least the last 200 steps are kept. */
export const HISTORY_DEPTH = 200;

export const EMPTY_HISTORY: History = Object.freeze({ past: Object.freeze([]), future: Object.freeze([]) });

/**
 * Record a step. A step under the same open gesture as the last one merges into it (keeping the first
 * `before`); a merged step that ends where it began disappears (e.g. text added then removed empty).
 */
export function record(h: History, step: Step): History {
  if (step.before === step.after) return h;
  const last = h.past[h.past.length - 1];
  if (last && step.gesture !== null && last.gesture === step.gesture && last.after === step.before) {
    const merged: Step = {
      before: last.before,
      after: step.after,
      changed: [...new Set([...last.changed, ...step.changed])],
      gesture: step.gesture,
    };
    const past = h.past.slice(0, -1);
    return { past: sameDocument(merged.before, merged.after) ? past : [...past, merged], future: [] };
  }
  const past = [...h.past, step];
  return { past: past.length > HISTORY_DEPTH ? past.slice(past.length - HISTORY_DEPTH) : past, future: [] };
}

const sameValue = (x: unknown, y: unknown): boolean => x === y || JSON.stringify(x) === JSON.stringify(y);
const sameItems = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a === b || (a.length === b.length && a.every((x, i) => sameValue(x, b[i])));

/**
 * The two documents hold the same values (an edit session that ended where it began, such as a
 * slider dragged away and back). Only used when merging a gesture's steps.
 */
export function sameDocument(a: Project, b: Project): boolean {
  return (
    a === b ||
    (sameValue(a.frame, b.frame) &&
      sameItems(a.sources, b.sources) &&
      sameItems(a.clips, b.clips) &&
      sameItems(a.textLayers, b.textLayers) &&
      sameItems(a.audioClips, b.audioClips))
  );
}

export function undoStep(h: History): { history: History; step: Step } | null {
  const step = h.past[h.past.length - 1];
  if (!step) return null;
  return { history: { past: h.past.slice(0, -1), future: [...h.future, step] }, step };
}

export function redoStep(h: History): { history: History; step: Step } | null {
  const step = h.future[h.future.length - 1];
  if (!step) return null;
  return { history: { past: [...h.past, step], future: h.future.slice(0, -1) }, step };
}
