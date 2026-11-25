// MOD-App — sound (F-011): the actions behind CMP-Inspector's sound section (volume, mute, Mute original
// sound). Every change is one MOD-Project edit, so one RULE-13 undo step; a volume slider movement is one
// gesture (F-014 `beginGesture`, cut by undo and redo). Music comes only from the user's own audio files
// (D-052): COPY-action.music opens the file picker (./MediaInput.tsx `pickMusic`) and the pick goes through
// the F-001 intake (./adding.ts).
// Implements: F-011.R3 (volume 0–200 % and mute), F-011.R4 (Mute original sound as one step, and Unmute when
// all are muted).
import { computed } from '@preact/signals';
import { RULE_12 } from '../core';
import {
  allOriginalMuted,
  beginGesture,
  edit,
  muteOriginal,
  project,
  setMuted,
  setVolume,
  type Gesture,
} from '../project';
import { showResultNotices } from './adding';
import { selectedAudio, selectedClip } from './arrange';

/** The item whose sound the inspector shows: the selected video clip or audio clip, else null. */
export const soundTarget = computed<{ id: string; volume: number; muted: boolean; kind: 'video' | 'audio' } | null>(
  () => {
    const a = selectedAudio.value;
    if (a) return { id: a.id, volume: a.volume, muted: a.muted, kind: 'audio' };
    const c = selectedClip.value;
    if (c?.kind === 'video')
      return { id: c.id, volume: c.volume ?? RULE_12.defaultVolume, muted: c.muted === true, kind: 'video' };
    return null;
  },
);

/** F-011.R4: every main-track clip with sound is muted (the control then reads Unmute original sound). */
export const originalMuted = computed(() => allOriginalMuted(project.value));

/** F-011.R4 / RULE-12 (D-022): Mute original sound, or Unmute when all are muted; one undo step. */
export function toggleMuteAll(): boolean {
  const before = project.peek();
  showResultNotices(edit(muteOriginal));
  return project.peek() !== before;
}

/** F-011.R3: Mute toggles silence without losing the volume (RULE-12). */
export function setMute(id: string, muted: boolean): void {
  showResultNotices(edit((p) => setMuted(p, id, muted)));
}

/** A typed or stepped volume (field, keyboard on the slider): one step, clamped to 0–200 % (RULE-12). */
export function setVolumeOnce(id: string, volume: number): void {
  if (!Number.isFinite(volume)) return;
  showResultNotices(edit((p) => setVolume(p, id, volume)));
}

/**
 * F-011.R3 / CMP-Inspector "Behavior": a slider movement updates the preview live and is one undo step
 * (RULE-13). Begin on pointer down, `set` on each move, `end` on release. Undo or redo during the
 * movement cuts it (`onCut`), so the slider shows the restored value and later moves start a new step.
 */
export function volumeGesture(id: string, onCut: () => void): { set(volume: number): void; end(): void } {
  let g: Gesture | null = beginGesture(onCut);
  return {
    set(volume) {
      if (!g || !Number.isFinite(volume)) return;
      showResultNotices(g.edit((p) => setVolume(p, id, volume)));
    },
    end() {
      g?.end();
      g = null;
    },
  };
}
