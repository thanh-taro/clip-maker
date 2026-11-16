// MOD-App music and sound (F-011): CMP-MusicPicker's "no audio room" set stays the same object while the
// playhead moves without changing it, so the picker does not re-render every frame while playing.
import { effect } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import { EMPTY_HISTORY, history, playhead, project, selection } from '../../src/project';
import { noRoom } from '../../src/app/sound';
import { S, audio, proj, video } from '../support/project';

describe('MOD-App music picker', () => {
  it('CMP-MusicPicker the no-audio-room set is the same object while its contents stay the same', () => {
    project.value = proj({ clips: [video('A', 4)], audioClips: [audio('m', 2, 4)] });
    history.value = EMPTY_HISTORY;
    selection.value = [];
    playhead.value = 0;
    let runs = 0;
    const stop = effect(() => {
      void noRoom.value;
      runs++;
    });
    const first = noRoom.value;
    expect(first.size).toBe(0);
    // Playing: the playhead moves every frame; nothing about the room changes.
    for (let i = 1; i <= 30; i++) playhead.value = i * 33_333;
    expect(noRoom.value).toBe(first);
    expect(runs).toBe(1);
    // Over the audio clip that reaches the project end no track fits: a new set, once.
    playhead.value = 3 * S;
    const full = noRoom.value;
    expect(full).not.toBe(first);
    expect(full.size).toBeGreaterThan(0);
    expect(runs).toBe(2);
    stop();
  });
});
