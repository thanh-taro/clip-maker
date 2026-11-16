// MOD-App — clip speed (F-005): what CMP-Inspector's Speed section and the phone Edit sheet's Speed row
// show, and the actions behind them. The rule maths is MOD-Project's `setSpeed` (RULE-06 steps and stops,
// RULE-03 limit, RULE-10 cross-fades and fades shrinking with the clip); MOD-Plan and MOD-Audio play the
// clip at its speed with its pitch kept (WSOLA, ADR-0008). Every quick choice, typed value or slider key
// is one RULE-13 undo step; one slider movement is one step (F-014 `beginGesture(onCut)`).
// Implements: F-005.R1 (quick choices and a fine control, 0.25×–4×), F-005.R2 (the timeline length is the
// source range ÷ speed; later clips move), F-005.R4/R5 (stops with COPY-notice.length_limited /
// COPY-notice.speed_limited), CMP-Inspector "clip Speed" and "Behavior".
import { computed } from '@preact/signals';
import { formatNumber, language, type Language } from '../copy';
import { frameStart, layoutOf, RULE_06, speedOf, speedStep, type Micros, type Notice } from '../core';
import { beginGesture, edit, project, setSpeed } from '../project';
import { showResultNotices } from './adding';
import { selectedClip } from './arrange';

/** RULE-06 quick choices (speed × 100): 0.25×, 0.5×, 1×, 1.5×, 2× and 4×. */
export const QUICK_SPEEDS: readonly number[] = RULE_06.quickPct;

/** A speed as the UI writes it: the language's decimal mark and the multiplication sign (vi-VN `0,25×`). */
export const speedLabel = (speedPct: number, lang: Language = language.value): string =>
  `${formatNumber(speedPct / 100, lang)}×`;

/** The selected video clip's speed and its resulting timeline length, or null (photos have no speed). */
export const speedTarget = computed<{ id: string; speedPct: number; length: Micros } | null>(() => {
  const clip = selectedClip.value;
  if (!clip || clip.kind !== 'video') return null;
  const p = project.value;
  const span = layoutOf(p).spans[p.clips.indexOf(clip)];
  return { id: clip.id, speedPct: speedOf(clip), length: span ? frameStart(span.frames, p.frame.frameRate) : 0 };
});

/**
 * A quick choice, a typed value or a slider key: one step, snapped to RULE-06's 0.05× steps; a stop shows
 * its notice. Returns the speed now in effect.
 */
export function setSpeedOnce(id: string, speedPct: number): number {
  if (Number.isFinite(speedPct)) showResultNotices(edit((p) => setSpeed(p, id, speedPct)));
  return speedTarget.peek()?.speedPct ?? RULE_06.defaultPct;
}

/** One movement of the Exact slider (F-014 gesture). */
export interface SpeedDrag {
  set(speedPct: number): void;
  /** The movement is over: the step is complete and its last notices show. */
  end(): void;
  /** False once ended, or once undo, redo or New project cut it. */
  readonly active: boolean;
}

/**
 * Implements: RULE-13 (one slider movement is one step), build question 104 / Q104 (a value back at the
 * start is no change). Each move sets the speed on the project as it was when the movement began, so a
 * movement back to the starting speed puts the project back exactly as it was (cross-fades and fades that
 * a faster speed shrank included, RULE-10) and leaves no undo step. Notices show once, at the end, so a
 * drag past a stop does not repeat them. `onCut` runs when undo, redo or New project cut the movement.
 */
export function beginSpeedDrag(id: string, onCut: () => void): SpeedDrag {
  const base = project.peek();
  const clip = base.clips.find((c) => c.id === id);
  const origin = clip ? speedOf(clip) : RULE_06.defaultPct;
  let ended = false;
  let notices: readonly Notice[] = [];
  const gesture = beginGesture(() => {
    ended = true;
    gesture.end();
    onCut();
  });
  return {
    set(speedPct) {
      if (ended || !gesture.active || !Number.isFinite(speedPct)) return;
      notices = gesture.edit(() =>
        speedStep(speedPct) === origin ? { project: base, notices: [], changed: [] } : setSpeed(base, id, speedPct),
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
