// MOD-App — the editor's polite status messages (CMP-Preview "Accessibility": the preview area holds the one
// status region). Edits and keyboard playback are announced in the active language; undo and redo name the
// step they undid or redid, from the action name recorded when the step was made.
// Implements: F-017.R7 (split, delete, duplicate, move, undo/redo naming the step, playback started by Space),
// F-017.R8 (a rejected or limited typed value is announced), NFR-06 announcements.
import { signal } from '@preact/signals';
import type { Project } from '../core';
import { t, type MessageId } from '../copy';
import { history, project, type Step } from '../project';

/** The status region's text (CMP-Preview `.tk-preview-status`). */
export const announcement = signal('');

/**
 * Say `text` politely. The same text twice in a row is still read: it alternates a trailing no-break space,
 * so the region's content changes.
 */
export function announce(text: string): void {
  announcement.value = announcement.peek() === text ? `${text} ` : text;
}

/**
 * COPY IDs of the actions an undo step can be named by (F-017.R7). Adding text isn't one: its step merges with the
 * typing that follows (RULE-13), so it is announced as COPY-announce.last_edit (owner decision QA-7).
 */
export type StepLabel = Extract<
  MessageId,
  | 'action.split'
  | 'action.delete'
  | 'action.duplicate'
  | 'action.move_left'
  | 'action.move_right'
  | 'action.set_in'
  | 'action.set_out'
  | 'action.mute'
>;

/** The action each history step was made by (steps keep their identity across undo and redo). */
const labels = new WeakMap<Step, StepLabel>();

/** Names the step just recorded (the last of the history's past) by its action. */
export function labelLastStep(label: StepLabel): void {
  const step = history.peek().past.at(-1);
  if (step) labels.set(step, label);
}

/** What a step undid or redid: its action name, or COPY-announce.last_edit. */
export function stepName(step: Step | undefined): string {
  const label = step ? labels.get(step) : undefined;
  return label ? t(label) : t('announce.last_edit');
}

/** The name an item is announced by: a clip's or audio clip's source name, a text layer's text. */
export function itemName(id: string, p: Project = project.peek()): string {
  const clip = p.clips.find((c) => c.id === id) ?? p.audioClips.find((a) => a.id === id);
  if (clip) return p.sources.find((s) => s.id === clip.sourceId)?.name ?? '';
  const layer = p.textLayers.find((l) => l.id === id);
  return layer ? layer.content.replace(/\s+/g, ' ').trim() : '';
}
