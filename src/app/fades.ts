// MOD-App — fades and cross-fades (F-009): what CMP-Inspector's Fades rows (a clip's Edit tab, an audio
// clip's sound section) and CMP-Timeline's cross-fade controls (the add chip, the bow-tie marker and its
// popover, the phone Edit sheet's Cross-fade tile) show, and the actions behind them. The rule maths is
// MOD-Project's `setFade`, `setCrossFade` and `crossFadeAvailability` (RULE-10 limits, whole frames,
// RULE-03 refusals); MOD-Plan and MOD-Audio draw and mix them (preview and export alike, INV-02).
// Every field value, slider key, quick toggle and popover button is one RULE-13 undo step; one slider
// movement is one step, measured from where it began (F-014 `beginGesture(onCut)`, Q104).
// Implements: F-009.R1 (clip fade in and out), F-009.R2 (add a cross-fade, set its length, remove it),
// F-009.R4 (audio clip fades), F-009.R5 (0.1 s steps applied as whole frames; values beyond the limits are
// reduced), F-009.R6 (a removal or shortening past RULE-03 is refused with COPY-notice.length_full),
// F-009.R7 (unavailable between clips too short, with COPY-notice.crossfade_too_short), CMP-Timeline
// "cross-fade" and "Behavior" (add uses 0.5 s), CMP-Inspector "clip Speed" (Fade in, Fade out and the quick
// toggles), "audio clip" (Fade in and Fade out, 0–5 s), "Behavior" (quick fade sets the rule's quick value).
import { computed, signal } from '@preact/signals';
import { formatField, language, translate, type Language } from '../copy';
import { RULE_10, type Micros, type Notice, type Project } from '../core';
import { beginGesture, crossFadeAvailability, edit, project, setCrossFade, setFade } from '../project';
import { showResultNotices } from './adding';
import { selectedAudio, selectedClip } from './arrange';

export type FadeEdge = 'in' | 'out';

/** A duration in µs as the 0.1 s steps RULE-10 picks it in (whole frames read back to the nearest step). */
export const tenthsOf = (us: Micros): number => Math.round(us / 100_000);

/**
 * Seconds as the fades and cross-fades show them: one decimal in the language's format, then the unit
 * COPY-fades.unit (`0.5 s`, vi-VN `0,5 s`).
 */
export const secondsLabel = (tenths: number, lang: Language = language.value): string =>
  `${formatField(tenths / 10, lang, 1, true)} ${translate(lang, 'fades.unit')}`;

/** The selected clip's or audio clip's fades (CMP-Inspector "clip Speed", "photo clip", "audio clip"). */
export interface FadeTarget {
  readonly id: string;
  readonly kind: 'clip' | 'audio';
  readonly fadeIn: number;
  readonly fadeOut: number;
  /** RULE-10's longest fade in tenths: 3 s for a clip, 5 s for an audio clip. */
  readonly maxTenths: number;
}

export const fadeTarget = computed<FadeTarget | null>(() => {
  const a = selectedAudio.value;
  if (a)
    return {
      id: a.id,
      kind: 'audio',
      fadeIn: tenthsOf(a.fadeIn),
      fadeOut: tenthsOf(a.fadeOut),
      maxTenths: RULE_10.audioFadeMaxSeconds * 10,
    };
  const c = selectedClip.value;
  if (c)
    return {
      id: c.id,
      kind: 'clip',
      fadeIn: tenthsOf(c.fadeIn),
      fadeOut: tenthsOf(c.fadeOut),
      maxTenths: RULE_10.clipFadeMaxSeconds * 10,
    };
  return null;
});

const fadeNow = (id: string, edge: FadeEdge): number => {
  const t = fadeTarget.peek();
  if (!t || t.id !== id) return 0;
  return edge === 'in' ? t.fadeIn : t.fadeOut;
};

/**
 * A typed value or a slider key: one step; RULE-10 reduces it to what fits (the clip's length less the
 * other fade, 3 s or 5 s). Returns the fade now in effect, in tenths.
 */
export function setFadeOnce(id: string, edge: FadeEdge, tenths: number): number {
  if (Number.isFinite(tenths)) showResultNotices(edit((p) => setFade(p, id, edge, Math.round(tenths))));
  return fadeNow(id, edge);
}

/**
 * CMP-Inspector "clip Speed": Quick fade in / Quick fade out are toggles (pressed while the fade is on).
 * Off → the rule's quick value (0.5 s, RULE-10); on → no fade. One step.
 */
export function toggleQuickFade(id: string, edge: FadeEdge): number {
  return setFadeOnce(id, edge, fadeNow(id, edge) > 0 ? 0 : RULE_10.quickFadeTenths);
}

/** One movement of a Fade in / Fade out slider (F-014 gesture). */
export interface FadeDrag {
  set(tenths: number): void;
  end(): void;
  readonly active: boolean;
}

/**
 * RULE-13 (one slider movement is one step), Q104 (back at the start is no change): each move sets the
 * fade on the project as it was when the movement began, so moving back leaves no step. `onCut` runs when
 * undo, redo, New project or another edit cut the movement.
 */
export function beginFadeDrag(id: string, edge: FadeEdge, onCut: () => void): FadeDrag {
  const base = project.peek();
  let ended = false;
  const gesture = beginGesture(() => {
    ended = true;
    gesture.end();
    onCut();
  });
  return {
    set(tenths) {
      if (ended || !gesture.active || !Number.isFinite(tenths)) return;
      gesture.edit(() => setFade(base, id, edge, Math.round(tenths)));
    },
    end() {
      if (ended) return;
      ended = true;
      gesture.end();
    },
    get active() {
      return !ended && gesture.active;
    },
  };
}

// ── Cross-fades (CMP-Timeline "cross-fade") ───────────────────────────────────────────────────────────

/** The join after main-track clip `id` (with the next clip), as the timeline's controls show it. */
export interface CrossFadeJoin {
  readonly id: string;
  /** The cross-fade's length in tenths; 0 when there is none. */
  readonly tenths: number;
  /** A cross-fade can join the two clips (F-009.R7); null reason when there is no next clip. */
  readonly available: boolean;
  readonly reason: Notice | null;
  /** Shorter and Longer would change it (0.1 s minimum; 2 s and half of either clip, RULE-10). */
  readonly canShorten: boolean;
  readonly canLengthen: boolean;
}

/** The join after clip `id` in project `p`, or null when `id` is not a main-track clip. */
export function joinOf(p: Project, id: string): CrossFadeJoin | null {
  const i = p.clips.findIndex((c) => c.id === id);
  const clip = p.clips[i];
  if (!clip) return null;
  const tenths = tenthsOf(clip.crossFadeNext);
  const { available, reason } = crossFadeAvailability(p, id);
  const longer = available && tenths > 0 && setCrossFade(p, id, tenths + 1).project.clips[i]!.crossFadeNext;
  return {
    id,
    tenths,
    available,
    reason,
    canShorten: tenths > RULE_10.crossFadeMinTenths,
    canLengthen: longer !== false && longer > clip.crossFadeNext,
  };
}

/** The join whose popover is open (CMP-Timeline "cross-fade"; UI state, not an edit: RULE-13). */
export const openJoin = signal<string | null>(null);

/** What opened the popover (focus returns there when it closes; the marker when it is gone). */
export const popoverOpener: { el: HTMLElement | null } = { el: null };

/** The open popover's join as it is now; null (and the popover closes) once its cross-fade is gone. */
export const openJoinState = computed<CrossFadeJoin | null>(() => {
  const id = openJoin.value;
  if (id === null) return null;
  const j = joinOf(project.value, id);
  return j && j.tenths > 0 ? j : null;
});

/**
 * CMP-Timeline "Behavior": the add chip adds a 0.5 s cross-fade (RULE-10's default), one step; between
 * clips too short it adds nothing and shows COPY-notice.crossfade_too_short (F-009.R7). True when added.
 */
export function addCrossFade(id: string): boolean {
  const before = project.peek();
  showResultNotices(edit((p) => setCrossFade(p, id, RULE_10.crossFadeDefaultTenths)));
  return project.peek() !== before;
}

/**
 * The popover's Shorter / Longer: 0.1 s, one step, within RULE-10; a shortening that would pass the
 * length limit is refused with COPY-notice.length_full (RULE-03). Returns the length now, in tenths.
 */
export function stepCrossFade(id: string, by: 1 | -1): number {
  const j = joinOf(project.peek(), id);
  if (!j || j.tenths === 0) return 0;
  if ((by < 0 && !j.canShorten) || (by > 0 && !j.canLengthen)) return j.tenths;
  showResultNotices(edit((p) => setCrossFade(p, id, j.tenths + by)));
  return joinOf(project.peek(), id)?.tenths ?? 0;
}

/** The popover's Remove: one step; refused with COPY-notice.length_full past the limit (F-009.R6). */
export function removeCrossFade(id: string): boolean {
  const before = project.peek();
  showResultNotices(edit((p) => setCrossFade(p, id, 0)));
  return project.peek() !== before;
}

/**
 * The phone Edit sheet's Cross-fade tile (CMP-Timeline "narrow / sheet open"): it acts on the join after
 * the selected main-track clip. Unavailable without a next clip; between clips too short it is
 * unavailable with its reason (F-009.R7).
 */
export const tileJoin = computed<CrossFadeJoin | null>(() => {
  const clip = selectedClip.value;
  return clip ? joinOf(project.value, clip.id) : null;
});

/**
 * The tile: with no cross-fade yet, add one (0.5 s); then open the join's popover to set its length or
 * remove it. Unavailable: show the reason (COPY-notice.crossfade_too_short) and change nothing.
 */
export function crossFadeTile(from: HTMLElement | null = null): boolean {
  const j = tileJoin.peek();
  if (!j) return false;
  if (!j.available) {
    if (j.reason) showResultNotices([j.reason]);
    return false;
  }
  if (j.tenths === 0 && !addCrossFade(j.id)) return false;
  popoverOpener.el = from;
  openJoin.value = j.id;
  return true;
}
