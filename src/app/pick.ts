// MOD-App — colour replace's pick mode (RULE-25 *Pick mode* and *Picking*, F-028; CMP-Preview "picking a colour"):
// Add colour to replace or Pick from preview enter it; the preview then shows only the selected clip's ungraded
// source picture (MOD-Preview `setPick`, MOD-Plan `pickPlan`), which is what the eyedropper samples. A successful
// pick is one undo step (adding a replacement, or setting an existing one's From) announced with COPY-replace.picked;
// a grey pick shows COPY-notice.replace_grey and keeps pick mode on, a faint one is accepted with
// COPY-notice.replace_faint; a click outside the clip's picture does nothing. Entering pauses playback and, when the
// playhead is outside the clip, moves it to MOD-Plan `pickStartFrame` (the playhead is never an undo step). Pick mode
// ends after a successful pick, on Esc or Cancel, on Play, when the selection changes, when the playhead leaves the
// clip, on entering full screen, on New project and when an export starts.
// Implements: F-028.R1/R2/R4/R8, RULE-25 *Pick mode*, *Picking*, RULE-13 (one step per pick).
import { computed, effect, signal } from '@preact/signals';
import { t } from '../copy';
import { frameIndexAt, frameStart, layoutOf, pickStartFrame, type Notice } from '../core';
import { addReplacement, edit, playhead, project, setReplacement } from '../project';
import { announce } from './announce';
import { selectedClip } from './arrange';
import { editorLocked } from './lock';
import { showNotice } from './notice-stack';
import { playback } from './playback';

/** What a pick does: add a replacement, or set an existing replacement's From. */
export type PickTarget = { readonly kind: 'add' } | { readonly kind: 'from'; readonly index: number };

export interface PickMode {
  readonly clipId: string;
  readonly target: PickTarget;
  /** Started from the keyboard: the marker shows and takes focus (COPY-replace.picking_keys). */
  readonly keys: boolean;
}

/** Pick mode (null: off). Session UI state, never an undo step. */
export const pickMode = signal<PickMode | null>(null);
/** The control focus returns to when pick mode ends ('add', or the Pick button of replacement `n`). */
export const pickReturn = signal<'add' | number | null>(null);

const targetKey = (t: PickTarget): 'add' | number => (t.kind === 'add' ? 'add' : t.index);

/** The Add or Pick button that shows as pressed (CMP-Inspector "colour replace"). */
export const pickPressed = computed<'add' | number | null>(() => {
  const m = pickMode.value;
  return m ? targetKey(m.target) : null;
});

/** RULE-25 *Pick mode*: enter it for the selected clip; playback pauses and the playhead moves onto the clip. */
export function startPick(clipId: string, target: PickTarget, keys: boolean): void {
  const ctl = playback.peek()?.ctl;
  ctl?.pause();
  const p = project.peek();
  const rate = p.frame.frameRate;
  const k = frameIndexAt(playhead.peek(), rate);
  const start = pickStartFrame(p, clipId, k);
  if (start === null) return;
  if (start !== k) playhead.value = frameStart(start, rate);
  pickMode.value = { clipId, target, keys };
  ctl?.setPick(clipId);
}

/** Ends pick mode without a change; `focusBack` returns focus to the button that started it. */
export function endPick(focusBack = false): void {
  const m = pickMode.peek();
  if (!m) return;
  pickMode.value = null;
  playback.peek()?.ctl.setPick(null);
  if (focusBack) pickReturn.value = targetKey(m.target);
}

const notice = (n: Notice): void => {
  if (n === 'notice.replace_grey') showNotice({ kind: 'warning', tag: 'replace_grey', text: () => t(n) });
  else if (n === 'notice.replace_faint') showNotice({ kind: 'info', tag: 'replace_faint', text: () => t(n) });
};

/**
 * Implements: RULE-25 *Picking* — a picked colour (#RRGGBB, already averaged and rounded): the replacement is added
 * or its From set (one step). Grey: nothing changes, COPY-notice.replace_grey, pick mode stays on. Otherwise
 * COPY-replace.picked is announced (and COPY-notice.replace_faint shown for a faint colour) and pick mode ends.
 */
export function commitPick(hex: string): void {
  const m = pickMode.peek();
  if (!m) return;
  const notices = edit((p) =>
    m.target.kind === 'add'
      ? addReplacement(p, m.clipId, hex)
      : setReplacement(p, m.clipId, m.target.index, { from: hex }),
  );
  if (notices.includes('notice.replace_grey')) {
    notice('notice.replace_grey');
    return;
  }
  announce(t('replace.picked', { hex }));
  for (const n of notices) notice(n);
  endPick(true);
}

/**
 * RULE-25 *Picking*: the colour at (`x`, `y`) (fractions of the frame), sampled by the engine on the pick-mode picture;
 * a point outside the clip's picture does nothing and keeps pick mode on.
 */
export async function pickAt(x: number, y: number): Promise<void> {
  const m = pickMode.peek();
  const ctl = playback.peek()?.ctl;
  if (!m || !ctl) return;
  const s = await ctl.sample(x, y);
  if (pickMode.peek() !== m || !s?.hex) return;
  commitPick(s.hex);
}

// Pick mode ends on Play, a selection change, the playhead leaving the clip, full screen, New project (the clip goes)
// and an export starting (RULE-25 *Pick mode*). Play ends it without a change and then plays.
effect(() => {
  const m = pickMode.value;
  if (!m) return;
  const ctl = playback.value;
  const clip = selectedClip.value;
  const p = project.value;
  const playing = ctl?.ctl.state.value === 'playing';
  const fullScreen = (ctl?.fs.mode.value ?? 'off') !== 'off';
  const i = clip ? p.clips.indexOf(clip) : -1;
  const span = layoutOf(p).spans[i];
  const k = frameIndexAt(playhead.value, p.frame.frameRate);
  const onClip = span !== undefined && k >= span.startFrame && k < span.endFrame;
  if (playing || fullScreen || editorLocked.value || clip?.id !== m.clipId || !onClip) endPick(false);
});
