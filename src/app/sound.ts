// MOD-App — music and sound (F-011): the music picker's state (open, the one audition, Add at playhead),
// and the actions behind CMP-Inspector's sound section (volume, mute, Mute original sound). Every change
// is one MOD-Project edit, so one RULE-13 undo step; a volume slider movement is one gesture (F-014
// `beginGesture`, cut by undo and redo). Refusals (COPY-notice.no_audio_room) show as CMP-Notice.
// Implements: F-011.R1 (preview and place a bundled track per RULE-12), F-011.R3 (volume 0–200 % and mute),
// F-011.R4 (Mute original sound as one step, and Unmute when all are muted), CMP-MusicPicker "Behavior".
import { computed, signal } from '@preact/signals';
import { musicTracks } from '../assets';
import { RULE_12, type MusicTrack } from '../core';
import {
  addMusic,
  allOriginalMuted,
  beginGesture,
  edit,
  muteOriginal,
  playhead,
  project,
  selection,
  setMuted,
  setVolume,
  type Gesture,
} from '../project';
import { nextItemId, showResultNotices } from './adding';
import { selectedAudio, selectedClip } from './arrange';
import { auditionTrack, playback } from './playback';

/** CMP-MusicPicker is open (wide: the popover from Music; narrow: the Audio sheet). */
export const pickerOpen = signal(false);

/** F-011.R6: the bundled tracks the picker lists. */
export const tracks: readonly MusicTrack[] = musicTracks();

/**
 * CMP-MusicPicker "Behavior": Play preview auditions a track from its start; activating it again, another
 * track's preview, Stop preview or closing the picker stops it. Only one preview plays at a time.
 */
export function togglePreview(trackId: string): void {
  const clock = playback.peek()?.clock;
  if (!clock) return;
  if (auditionTrack.peek() === trackId) {
    stopPreview();
    return;
  }
  const track = tracks.find((t) => t.id === trackId);
  if (!track) return;
  // The project pauses first (the audition has the speakers); the picture stays where it is.
  playback.peek()?.ctl.pause();
  auditionTrack.value = trackId;
  void clock.audition(trackId, track.duration);
}

export function stopPreview(): void {
  if (auditionTrack.peek() === null) return;
  playback.peek()?.clock.stopAudition();
  auditionTrack.value = null;
}

export function openPicker(): void {
  pickerOpen.value = true;
}

/** Closing the picker stops its preview (CMP-MusicPicker "Behavior"). */
export function closePicker(): void {
  stopPreview();
  pickerOpen.value = false;
}

/**
 * CMP-MusicPicker "row / no audio room": the tracks that can't be placed at the playhead now (RULE-12:
 * less than 0.1 s free from the start point, or the playhead at or past the project end).
 */
let lastNoRoom: ReadonlySet<string> = new Set();
export const noRoom = computed<ReadonlySet<string>>(() => {
  const p = project.value;
  const at = playhead.value;
  const next = tracks.filter((t) => addMusic(p, t.id, at, () => 'probe', tracks).project === p).map((t) => t.id);
  // The playhead moves every frame while playing: the same set is returned so the picker does not re-render.
  if (next.length === lastNoRoom.size && next.every((id) => lastNoRoom.has(id))) return lastNoRoom;
  lastNoRoom = new Set(next);
  return lastNoRoom;
});

/**
 * F-011.R1: Add at playhead places the track per RULE-12 as one undo step, keeps the picker open and
 * selects the new audio clip. False when it was refused (COPY-notice.no_audio_room).
 */
export function addTrack(trackId: string): boolean {
  const before = project.peek();
  showResultNotices(edit((p) => addMusic(p, trackId, playhead.peek(), nextItemId, tracks)));
  const after = project.peek();
  if (after === before) return false;
  const known = new Set(before.audioClips.map((a) => a.id));
  const added = after.audioClips.find((a) => !known.has(a.id));
  if (added) selection.value = [added.id];
  return true;
}

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
