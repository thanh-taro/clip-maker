// MOD-App — a photo clip's duration (F-004, build question 150): what CMP-Inspector's Duration row (a photo's
// Edit tab, between Position and Fades) and the phone Edit sheet's Duration row show, and the actions behind
// them. The rule maths is MOD-Project's `setPhotoDuration` (RULE-05: 0.1–60 s, whole frames; RULE-03: a
// change that would pass 10 minutes stops at the limit with COPY-notice.length_limited; RULE-10: fades and
// cross-fades shrink with the clip; INV-03: later clips move). Every typed value or slider key is one
// RULE-13 undo step; one slider movement is one step, measured from where it began (F-014
// `beginGesture(onCut)`, Q104), with its notices shown once when it ends (as Speed's, build question 129).
// Implements: F-004.R2 (a photo's duration within 0.1–60 s; later clips move), F-004.R7 (the duration
// control), CMP-Inspector "photo clip" (Duration slider and field) and "Behavior".
import { computed } from '@preact/signals';
import { RULE_05, type Notice } from '../core';
import { beginGesture, edit, project, setPhotoDuration } from '../project';
import { showResultNotices } from './adding';
import { selectedClip } from './arrange';
import { tenthsOf } from './fades';

/** RULE-05 photo duration in tenths of a second (the slider's and field's 0.1 s steps). */
export const DURATION_MIN_TENTHS = RULE_05.photoMinTenths;
export const DURATION_MAX_TENTHS = RULE_05.photoMaxSeconds * 10;

/** The selected photo clip's duration in tenths (whole frames read back to the nearest 0.1 s), or null. */
export const durationTarget = computed<{ id: string; tenths: number } | null>(() => {
  const clip = selectedClip.value;
  if (!clip || clip.kind !== 'photo') return null;
  return { id: clip.id, tenths: tenthsOf(clip.duration ?? 0) };
});

const durationNow = (id: string): number => {
  const t = durationTarget.peek();
  return t && t.id === id ? t.tenths : 0;
};

/**
 * A typed value or a slider key: one step; RULE-05 clamps it to 0.1–60 s, RULE-03 stops it at the limit with
 * its notice. Returns the duration now in effect, in tenths.
 */
export function setDurationOnce(id: string, tenths: number): number {
  if (Number.isFinite(tenths)) showResultNotices(edit((p) => setPhotoDuration(p, id, Math.round(tenths) * 100_000)));
  return durationNow(id);
}

/** One movement of the Duration slider (F-014 gesture). */
export interface DurationDrag {
  set(tenths: number): void;
  /** The movement is over: the step is complete and its last notices show. */
  end(): void;
  /** False once ended, or once undo, redo, New project or another edit cut it. */
  readonly active: boolean;
}

/**
 * Implements: RULE-13 (one slider movement is one step), Q104 (back at the start is no change). Each move
 * sets the duration on the project as it was when the movement began, so a movement back to the starting
 * duration puts the project back exactly (fades and cross-fades a shorter photo shrank included, RULE-10)
 * and leaves no undo step. A RULE-03 stop holds the thumb at the duration in effect; its notice shows once,
 * when the movement ends. `onCut` runs when undo, redo, New project or another edit cut the movement.
 */
export function beginDurationDrag(id: string, onCut: () => void): DurationDrag {
  const base = project.peek();
  const clip = base.clips.find((c) => c.id === id);
  const origin = clip?.kind === 'photo' ? tenthsOf(clip.duration ?? 0) : 0;
  let ended = false;
  let notices: readonly Notice[] = [];
  const gesture = beginGesture(() => {
    ended = true;
    gesture.end();
    onCut();
  });
  return {
    set(tenths) {
      if (ended || !gesture.active || !Number.isFinite(tenths)) return;
      const v = Math.round(tenths);
      notices = gesture.edit(() =>
        v === origin ? { project: base, notices: [], changed: [] } : setPhotoDuration(base, id, v * 100_000),
      );
    },
    end() {
      if (ended) return;
      ended = true;
      gesture.end();
      showResultNotices(notices);
    },
    get active() {
      return !ended && gesture.active;
    },
  };
}
