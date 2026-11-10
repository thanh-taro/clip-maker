// MOD-App — the frame (F-012): the choices CMP-Inspector's frame section offers and the actions behind
// them. Each pick is one MOD-Project edit, so one RULE-13 undo step; RULE-03's shortening or refusal of a
// frame-rate change shows as CMP-Notice. The preview reshapes through the project signal (MOD-Preview
// sizes its canvas to `frameAspect`), and export paints with the same compositor (INV-02).
// Implements: F-012.R1 (aspect), F-012.R2 (frame rate), F-012.R3 (background), F-012.R4 (undo steps; the
// RULE-03 notices).
import { computed } from '@preact/signals';
import { PALETTE, RULE_04, type Frame, type FrameRate } from '../core';
import { edit, project, setAspect, setBackground, setFrameRate, type EditResult } from '../project';
import { showResultNotices } from './adding';
import { selectedClip } from './arrange';

/** F-012.R1: 9:16, 1:1, 4:5, 16:9, then Original (CMP-Inspector "Frame"). */
export const ASPECT_CHOICES: readonly Frame['aspect'][] = RULE_04.aspects;
/** F-012.R2: 24, 25, 30, 60. */
export const RATE_CHOICES: readonly FrameRate[] = RULE_04.frameRates;
/** F-012.R3: the ten palette swatches (RULE-11 order), then Blur. */
export const BACKGROUND_CHOICES: readonly Frame['background'][] = [...PALETTE, 'blur'];

/** The session's frame settings. */
export const frameSettings = computed(() => project.value.frame);

/**
 * CMP-Inspector and the narrow Edit sheet show the frame section when nothing selected has an inspector
 * section yet. Only main-track clips will have one first (F-005–F-008), so a selected audio clip or
 * text layer (e.g. after RULE-13 undo or redo) still shows the frame. Widen this as the text layer's
 * and audio clip's sections arrive (build question 106).
 */
export const frameSectionShown = computed(() => selectedClip.value === null);

/** One edit with its notices; true when the project changed. */
function commit(op: (p: typeof project.value) => EditResult): boolean {
  const before = project.peek();
  showResultNotices(edit(op));
  return project.peek() !== before;
}

/** F-012.R1: the aspect; every clip keeps its placement settings (RULE-04). */
export function chooseAspect(aspect: Frame['aspect']): boolean {
  return commit((p) => setAspect(p, aspect));
}

/**
 * F-012.R2: the frame rate; times move to frame starts, RULE-03 may shorten the last clip or refuse.
 * Picking the rate already shown is still a choice (RULE-04 "until the user chooses a rate"): while no
 * rate was chosen it is one step that only marks the rate chosen (build question 110).
 */
export function chooseRate(rate: FrameRate): boolean {
  return commit((p) => setFrameRate(p, rate));
}

/** F-012.R3: a palette colour or Blur. */
export function chooseBackground(background: Frame['background']): boolean {
  return commit((p) => setBackground(p, background));
}
