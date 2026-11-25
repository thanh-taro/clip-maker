// MOD-App — colour and light (F-007): what CMP-Inspector's Adjust tab and the phone Adjust sheet show, and
// the actions behind them. The rule maths is MOD-Core's (RULE-08 ranges, `clampAdjustments`, which drops
// values at their default so `{}` is "all default", build question 104) and MOD-Project's
// `setAdjustments` / `resetAdjustment` / `resetAdjustments` / `pasteGrade` / `applyToAll`; MOD-Compositor
// applies them in RULE-08 order in the preview and the export alike (INV-02). Each control is one RULE-13
// step; one slider movement is one step (F-014 `beginGesture(onCut)`), measured from where it began, so
// a movement back to its start leaves no step and keeps redo (Q104). Copy colour and the compare hold
// are not undo steps.
// Implements: F-007.R1 (each adjustment within its range, live in the preview), F-007.R3 (reset one or
// all), F-007.R4 (Apply to all as one step; copy and paste), F-007.R6 (keys and typed values: see the
// section), F-007.R7 (compare hold, not an undo step), RULE-08 *Reset and copy* and *Compare*, RULE-20
// (Mod+C / Mod+V act only with a video or photo clip selected; hold \ to compare).
import { computed, effect, signal } from '@preact/signals';
import { RULE_08, type AdjustmentName, type Adjustments, type ColourTools, type Look } from '../core';
import { isMac, resolveKey, scopeOf } from '../keys';
import {
  applyToAll,
  beginGesture,
  copiedGrade,
  edit,
  gradeOf,
  pasteGrade,
  project,
  resetAdjustment,
  resetAdjustments,
  setAdjustments,
  type EditResult,
} from '../project';
import { selectedClip } from './arrange';
import { focusInfo } from './playback';
import { pastes } from './transfer';

/** RULE-08: Brightness … Tint run from −100 to +100 (centre default); Sharpen … Fade from 0 to 100. */
export const isBipolar = (name: AdjustmentName): boolean =>
  (RULE_08.bipolar as readonly AdjustmentName[]).includes(name);

/** The range of one adjustment (RULE-08); every default is 0. */
export const rangeOf = (name: AdjustmentName): { min: number; max: number } =>
  isBipolar(name)
    ? { min: RULE_08.bipolarMin, max: RULE_08.bipolarMax }
    : { min: RULE_08.unipolarMin, max: RULE_08.unipolarMax };

export type AdjustGroup = 'light' | 'colour' | 'effects';

/**
 * CMP-Inspector "clip Adjust": the groups and their rows, for reading only (adjustments are always applied
 * in RULE-08 order, CMP-Inspector "Behavior").
 */
export const ADJUST_GROUPS: readonly { readonly group: AdjustGroup; readonly names: readonly AdjustmentName[] }[] = [
  { group: 'light', names: ['brightness', 'contrast', 'highlights', 'shadows'] },
  { group: 'colour', names: ['temperature', 'tint', 'saturation', 'vibrance'] },
  { group: 'effects', names: ['fade', 'sharpen', 'vignette', 'grain'] },
];

/** An adjustment as the slider's value text and the field read it: "+12", "−8", "0" (board CMP-Inspector). */
export function signedLabel(value: number, bipolar: boolean): string {
  if (!bipolar || value === 0) return String(value);
  return value > 0 ? `+${value}` : `−${-value}`;
}

export interface AdjustTarget {
  readonly id: string;
  readonly adjustments: Adjustments;
  readonly look: Look;
  /** RULE-24 (absent: every colour tool at default). */
  readonly colourTools: ColourTools | undefined;
  /** Some adjustment or colour tool is away from its default (Reset all is available). */
  readonly changed: boolean;
}

/** The selected video or photo clip's adjustments and look, or null (F-007 Edge cases: a photo as a video). */
export const adjustTarget = computed<AdjustTarget | null>(() => {
  const clip = selectedClip.value;
  if (!clip) return null;
  return {
    id: clip.id,
    adjustments: clip.adjustments,
    look: clip.look,
    colourTools: clip.colourTools,
    // RULE-24: Reset all also returns every colour tool to default.
    changed: Object.keys(clip.adjustments).length > 0 || clip.colourTools !== undefined,
  };
});

/** F-007 Edge cases: Paste colour is unavailable with nothing copied (or no video or photo clip selected). */
export const canPaste = computed<boolean>(() => copiedGrade.value !== null && adjustTarget.value !== null);

/** There is another main-track clip for Apply to all to reach. */
export const canApplyAll = computed<boolean>(() => adjustTarget.value !== null && project.value.clips.length > 1);

const valueOf = (id: string, name: AdjustmentName): number =>
  project.peek().clips.find((c) => c.id === id)?.adjustments[name] ?? 0;

/** One control (a typed value, a slider key): one step. Returns the value now in effect. */
export function setAdjustmentOnce(id: string, name: AdjustmentName, value: number): number {
  if (Number.isFinite(value)) edit((p) => setAdjustments(p, id, { [name]: value }));
  return valueOf(id, name);
}

/** RULE-08: one adjustment back to its default; one step (none when already there). */
export function resetOne(id: string, name: AdjustmentName): void {
  edit((p) => resetAdjustment(p, id, name));
}

/** RULE-08 Reset all: every adjustment back to default (the look stays, F-008); one step. */
export function resetAll(id: string): void {
  edit((p) => resetAdjustments(p, id));
}

/** RULE-08 Copy: the clip's adjustments and look (not an undo step; New project clears it, RULE-23). */
export function copyColour(id: string): boolean {
  const clip = project.peek().clips.find((c) => c.id === id);
  if (!clip) return false;
  copiedGrade.value = gradeOf(clip);
  return true;
}

/** RULE-08 Paste: the copied adjustments and look onto the clip; one step. False with nothing copied. */
export function pasteColour(id: string): boolean {
  const grade = copiedGrade.peek();
  if (!grade || !project.peek().clips.some((c) => c.id === id)) return false;
  edit((p) => pasteGrade(p, id, grade));
  return true;
}

/** RULE-08 Apply to all: the clip's adjustments and look onto every other main-track clip, one step. */
export function applyColourToAll(id: string): void {
  edit((p) => applyToAll(p, id));
}

/** One movement of an adjustment slider (F-014 gesture). */
export interface AdjustDrag {
  set(value: number): void;
  /** The movement is over: the step is complete. */
  end(): void;
  /** False once ended, or once undo, redo, New project or another edit cut it. */
  readonly active: boolean;
}

/**
 * Implements: RULE-13 (one slider movement is one step), Q104 (a value back at the start is no change),
 * RULE-08 *Drag detent* (a bipolar movement within ±2 of the default lands on it).
 * Each move sets the value on the project as it was when the movement began, so a movement back to the
 * starting value puts the project back exactly and leaves no step (redo is kept). `onCut` runs when undo,
 * redo, New project or an edit outside the movement cut it.
 */
export function beginAdjustDrag(id: string, name: AdjustmentName, onCut: () => void): AdjustDrag {
  const base = project.peek();
  const origin = base.clips.find((c) => c.id === id)?.adjustments[name] ?? 0;
  let ended = false;
  const gesture = beginGesture(() => {
    ended = true;
    gesture.end();
    onCut();
  });
  return {
    set(value) {
      if (ended || !gesture.active || !Number.isFinite(value)) return;
      const { min, max } = rangeOf(name);
      const r = Math.min(max, Math.max(min, Math.round(value)));
      // Implements: RULE-08 *Drag detent* (build question 140) — a pointer movement of a bipolar slider that
      // lands within ±2 of the default lands on it (WebKit's whole-pixel thumb can't reach 0 otherwise); keys
      // and the number field still reach ±1 and ±2 (they are not movements).
      const v = isBipolar(name) && Math.abs(r) <= RULE_08.dragDetent ? 0 : r;
      gesture.edit((): EditResult =>
        v === origin ? { project: base, notices: [], changed: [] } : setAdjustments(base, id, { [name]: v }),
      );
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

// ── Compare (RULE-08, F-007.R7) ────────────────────────────────────────────────────────────────

/**
 * The clip shown without its adjustments and look while compare is held (null: not held). Preview only,
 * never an undo step; CMP-Preview shows COPY-preview.comparing while it is set (./Preview.tsx sends it to
 * MOD-Preview).
 */
export const comparing = signal<string | null>(null);

/** Why compare is held: the control (pointer, touch, Space/Enter) and the \ key each hold it on their own. */
const holders = new Set<'control' | 'key'>();

/** Starts holding compare on the selected video or photo clip. */
export function holdCompare(by: 'control' | 'key'): void {
  const target = adjustTarget.peek();
  if (!target) return;
  holders.add(by);
  comparing.value = target.id;
}

/** Ends one hold; the clip's adjustments and look return when nothing holds it any more. */
export function releaseCompare(by?: 'control' | 'key'): void {
  if (by) holders.delete(by);
  else holders.clear();
  if (holders.size === 0) comparing.value = null;
}

// The held clip stops being the selected video or photo clip (deselected, deleted, undone): compare ends.
effect(() => {
  const held = comparing.value;
  if (held !== null && adjustTarget.value?.id !== held) releaseCompare();
});

// ── Keys (RULE-20: Mod+C, Mod+V, hold \) ─────────────────────────────────────────────────────────

/**
 * RULE-20 Mod+C / Mod+V / hold \ (the F-007 keys), with the arrange keys' scope (no field edited, no
 * dialog or menu, no control that uses the key). They act only while a video or photo clip is selected;
 * otherwise the browser keeps them. Mod+V is not taken from the browser: its `paste` event comes first,
 * and when that event brought files they are added as media (RULE-20) and the colour is not pasted.
 */
export function bindAdjustKeys(doc: Document = document): () => void {
  const mac = isMac(navigator.platform || navigator.userAgent);
  const view = doc.defaultView ?? window;
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing) return;
    const action = resolveKey(e, scopeOf(focusInfo(doc.activeElement), e.code, e), mac);
    const target = adjustTarget.peek();
    if (!target) return;
    switch (action) {
      case 'compare':
        if (!e.repeat) holdCompare('key');
        e.preventDefault();
        return;
      case 'copy-colour':
        // Text selected on the page (a notice, the licence list) copies as text (build question 144).
        if (!(doc.getSelection()?.isCollapsed ?? true)) return;
        if (!e.repeat) copyColour(target.id);
        e.preventDefault();
        return;
      case 'paste-colour': {
        if (e.repeat) return;
        const before = pastes.files;
        view.setTimeout(() => {
          const now = adjustTarget.peek();
          if (pastes.files === before && now?.id === target.id) pasteColour(target.id);
        }, 0);
        return;
      }
      default:
        return;
    }
  };
  const onUp = (e: KeyboardEvent): void => {
    if (e.code === 'Backslash') releaseCompare('key');
  };
  const onBlur = (): void => releaseCompare('key');
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('keyup', onUp);
  view.addEventListener('blur', onBlur);
  return () => {
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('keyup', onUp);
    view.removeEventListener('blur', onBlur);
    releaseCompare('key');
  };
}
