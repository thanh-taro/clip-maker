// MOD-App — arranging clips on the main track (F-003): the selection, which clip actions are available,
// and the actions behind the timeline's toolbar, the phone Edit sheet, the RULE-20 keys and a drag on
// the timeline. Every action is one MOD-Project edit, so it is one RULE-13 undo step in the session's
// history (F-014 adds the Undo UI); refusals and shortenings show as CMP-Notice.
// Implements: F-003.R1 (select), F-003.R2 (move), F-003.R3 (delete), F-003.R4 (duplicate), F-003.R5
// (through MOD-Project's RULE-05 / RULE-03 operations), F-003.R6 (each without a drag), RULE-20 Edit
// keys (Delete/Backspace, Mod+D, Alt+Left/Right).
// F-011 adds the audio clips: the same selection, Delete and Duplicate (RULE-12 duplicate), the time moves
// Earlier/Later by one frame (Shift+Alt: 1 s) under the RULE-12 move rule, and M to mute the selected
// video or audio clip. Implements: F-011.R2 (move, duplicate, delete), F-011.R8, RULE-20 (M, Shift+Alt).
// F-004 adds the trim keys S or Mod+B (split), I and O (start / end here), acting through ./trim.ts.
// F-010 adds the text layers (./text.ts): the same Delete and Duplicate, Earlier/Later one frame in time
// (Shift+Alt: 1 s), and T to add a text layer. Implements: F-010.R4, F-010.R8, RULE-20 (T, Alt / Shift+Alt).
import { computed } from '@preact/signals';
import type { AudioClip, Clip } from '../core';
import { isMac, resolveKey, scopeOf, type Action } from '../keys';
import {
  deleteItem,
  duplicateAudio,
  duplicateClip,
  edit,
  moveAudio,
  moveClip,
  moveItemTime,
  project,
  selection,
  setMuted,
} from '../project';
import { nextItemId, showResultNotices } from './adding';
import { focusInfo } from './playback';
import {
  addTextAndEdit,
  deleteSelectedText,
  duplicateSelectedText,
  moveTextBy,
  selectedText,
  textMoveAvailable,
} from './text';
import { splitHere, trimHere } from './trim';

/** F-003.R1: the selected main-track clip, if the selection is one. */
export const selectedClip = computed<Clip | null>(() => {
  const id = selection.value[0];
  return (id !== undefined && project.value.clips.find((c) => c.id === id)) || null;
});

/** F-011: the selected audio clip, if the selection is one. */
export const selectedAudio = computed<AudioClip | null>(() => {
  const id = selection.value[0];
  return (id !== undefined && project.value.audioClips.find((a) => a.id === id)) || null;
});

/** Whether moving the selected audio clip `frames` frames would change anything (RULE-12 move rule). */
const audioMoves = (a: AudioClip, frames: number): boolean => {
  const p = project.value;
  return moveItemTime(p, a.id, frames).project !== p;
};

const selectedIndex = computed(() => {
  const clip = selectedClip.value;
  return clip ? project.value.clips.indexOf(clip) : -1;
});

/**
 * SCR-Editor "Unavailable controls": with nothing selected, delete, duplicate and move are unavailable;
 * the first clip can't move earlier, nor the last later.
 */
export const arrangeAvailable = computed(() => {
  if (selectedText.value) {
    const m = textMoveAvailable.value;
    return { earlier: m.earlier, later: m.later, delete: true, duplicate: project.value.textLayers.length < 50 };
  }
  const audio = selectedAudio.value;
  if (audio) {
    const p = project.value;
    return {
      earlier: audioMoves(audio, -1),
      later: audioMoves(audio, 1),
      delete: true,
      duplicate: duplicateAudio(p, audio.id, () => 'probe').project !== p,
    };
  }
  const i = selectedIndex.value;
  const n = project.value.clips.length;
  return { earlier: i > 0, later: i >= 0 && i < n - 1, delete: i >= 0, duplicate: i >= 0 };
});

/** F-003.R1: select a clip, or nothing (not an undo step, RULE-13). */
export function selectClip(id: string | null): void {
  const next = id === null ? [] : [id];
  if (next.join() !== selection.peek().join()) selection.value = next;
}

/** Runs one edit; false when nothing changed (refused, or no move). */
function commit(op: Parameters<typeof edit>[0]): boolean {
  const before = project.peek();
  showResultNotices(edit(op));
  return project.peek() !== before;
}

/** F-003.R2: move a clip to index `to` of the resulting order (a drag drop, RULE-05). */
export function moveClipTo(id: string, to: number): boolean {
  return commit((p) => moveClip(p, id, to));
}

/** F-011.R2: an audio clip dragged to start at `start` (the RULE-12 move rule; no step when nothing moves). */
export function moveAudioTo(id: string, start: number): boolean {
  return commit((p) => moveAudio(p, id, start));
}

/** F-011.R8 / RULE-20: the selected audio clip `frames` frames earlier (negative) or later. */
export function moveAudioBy(frames: number): boolean {
  const a = selectedAudio.peek();
  return a ? commit((p) => moveItemTime(p, a.id, frames)) : false;
}

/**
 * F-003.R2/R6: Move earlier / Move later — the selected clip one place along the main track; F-011.R8:
 * Earlier / Later — the selected audio clip one frame in time.
 */
export function moveSelected(direction: 'earlier' | 'later'): boolean {
  if (selectedText.peek()) return moveTextBy(direction === 'earlier' ? -1 : 1);
  if (selectedAudio.peek()) return moveAudioBy(direction === 'earlier' ? -1 : 1);
  const clip = selectedClip.peek();
  const i = selectedIndex.peek();
  const to = direction === 'earlier' ? i - 1 : i + 1;
  if (!clip || to < 0 || to >= project.peek().clips.length) return false;
  return moveClipTo(clip.id, to);
}

/** F-003.R3: delete the selected clip; later clips close the gap and nothing is selected afterwards. */
export function deleteSelected(): boolean {
  if (selectedText.peek()) {
    const had = typeof document === 'undefined' ? null : (document.activeElement?.closest?.('.tk-tclip') ?? null);
    const done = deleteSelectedText();
    // Keyboard focus stays on the text lane: the next text item, else the main track.
    if (done && had)
      setTimeout(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        (document.querySelector<HTMLElement>('.tk-tclip') ?? document.querySelector<HTMLElement>('.tk-track'))?.focus();
      }, 0);
    return done;
  }
  const audio = selectedAudio.peek();
  if (audio) {
    const had = document.activeElement?.closest?.('.tk-aclip') ?? null;
    const done = commit((p) => deleteItem(p, audio.id));
    if (done) {
      selectClip(null);
      // Keyboard focus stays on the audio lane: the next audio item, else the main track.
      if (had)
        setTimeout(() => {
          if (document.activeElement && document.activeElement !== document.body) return;
          (
            document.querySelector<HTMLElement>('.tk-aclip') ?? document.querySelector<HTMLElement>('.tk-track')
          )?.focus();
        }, 0);
    }
    return done;
  }
  const clip = selectedClip.peek();
  const index = selectedIndex.peek();
  if (!clip) return false;
  const done = commit((p) => deleteItem(p, clip.id));
  if (done) {
    selectClip(null);
    afterDelete?.(index);
  }
  return done;
}

/** F-003.R4: duplicate the selected clip right after it; the original stays selected. */
export function duplicateSelected(): boolean {
  if (selectedText.peek()) return duplicateSelectedText();
  const audio = selectedAudio.peek();
  if (audio) return commit((p) => duplicateAudio(p, audio.id, nextItemId));
  const clip = selectedClip.peek();
  if (!clip) return false;
  return commit((p) => duplicateClip(p, clip.id, nextItemId));
}

/** F-011.R3 / RULE-20 M: mute or unmute the selected video clip or audio clip. */
export function toggleMuteSelected(): boolean {
  const audio = selectedAudio.peek();
  const clip = selectedClip.peek();
  const target = audio ?? (clip?.kind === 'video' ? clip : null);
  if (!target) return false;
  const muted = target.muted === true;
  return commit((p) => setMuted(p, target.id, !muted));
}

/** RULE-20 Edit keys of F-003: true when the action applied (the key is then taken from the browser). */
export function runArrangeAction(action: Action, repeat = false): boolean {
  // RULE-20: within its scope (MOD-Keys checked it) the tool takes Alt+Left/Right and Mod+D even with
  // nothing selected (a no-op), so they never fall through to the browser's Back or Bookmark. Delete or
  // Backspace is taken only when it deletes. A held (repeating) Delete or Mod+D acts once.
  switch (action) {
    case 'delete':
      return repeat
        ? selectedClip.peek() !== null || selectedAudio.peek() !== null || selectedText.peek() !== null
        : deleteSelected();
    // RULE-20: T adds a text layer (F-010); a held T acts once.
    case 'add-text':
      if (!repeat) addTextAndEdit();
      return true;
    case 'duplicate':
      if (!repeat) duplicateSelected();
      return true;
    case 'move-earlier':
    case 'move-later':
      moveSelected(action === 'move-earlier' ? 'earlier' : 'later');
      return true;
    case 'move-earlier-second':
    case 'move-later-second': {
      // RULE-20 (Q93): Shift+Alt moves a text layer or an audio clip 1 s; for a main-track clip Shift makes
      // no difference, so it moves one place like Alt+Left/Right and the key is taken.
      if (selectedText.peek()) {
        const second = project.peek().frame.frameRate;
        moveTextBy(action === 'move-earlier-second' ? -second : second);
        return true;
      }
      if (!selectedAudio.peek()) {
        moveSelected(action === 'move-earlier-second' ? 'earlier' : 'later');
        return true;
      }
      const second = project.peek().frame.frameRate;
      moveAudioBy(action === 'move-earlier-second' ? -second : second);
      return true;
    }
    case 'mute': {
      // A held M acts once; with no video or audio clip selected the browser keeps the key.
      const clip = selectedClip.peek();
      if (repeat) return selectedAudio.peek() !== null || clip?.kind === 'video';
      return toggleMuteSelected();
    }
    // F-004 (RULE-20): S or Mod+B splits, I / O start / end the selected item at the playhead. Within the
    // scope the keys are taken even when nothing applies (Mod+B never reaches the browser); a held key acts
    // once.
    case 'split':
      if (!repeat) splitHere();
      return true;
    case 'set-in':
    case 'set-out':
      if (!repeat) trimHere(action === 'set-in' ? 'start' : 'end');
      return true;
    default:
      return false;
  }
}

/** Called with the deleted clip's index (the timeline then keeps keyboard focus on the track). */
let afterDelete: ((index: number) => void) | null = null;
export function onDeleted(fn: ((index: number) => void) | null): void {
  afterDelete = fn;
}

/**
 * The DOM binder for the arrange keys (RULE-20 scope: no field edited, no dialog or menu, no control
 * that uses the key). Takes a key from the browser only when it acted.
 */
export function bindArrangeKeys(doc: Document = document): () => void {
  const mac = isMac(navigator.platform || navigator.userAgent);
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing) return;
    const action = resolveKey(e, scopeOf(focusInfo(doc.activeElement), e.code), mac);
    if (action && runArrangeAction(action, e.repeat)) e.preventDefault();
  };
  doc.addEventListener('keydown', onKey);
  return () => doc.removeEventListener('keydown', onKey);
}
