// MOD-App playback wiring (F-002): the preview controller bound to MOD-Project's playhead (the binding
// F-003's timeline uses), the engine and audio workers fed with the session's project and sources,
// RULE-20 playback keys dispatched to the controller, and the slow-device signal followed into the
// session notice (F-023.AC7, build question 62).
import { computed, signal, type ReadonlySignal } from '@preact/signals';
import { afterEach, describe, expect, it } from 'vitest';
import {
  auditionTrack,
  connectPreview,
  feedWorkers,
  musicFailed,
  musicIds,
  overlayOpen,
  runAction,
} from '../../src/app/playback';
import { notices, resetNotices } from '../../src/app/notice-stack';
import { dragging } from '../../src/app/MediaInput';
import { resetDeviceSession, slowNotice } from '../../src/app/device';
import type { ToAudioWorker } from '../../src/audio';
import {
  frameStart,
  projectEnd,
  type EngineMedia,
  type Micros,
  type Project,
  type Source,
  type ToEngine,
} from '../../src/core';
import { stepTime, type PlayState } from '../../src/preview';
import { audio, photo, proj, S, video } from '../support/project';

/** A controller with the real playhead maths and no engine. */
function fakeController(project: ReadonlySignal<Project>) {
  const time = signal<Micros>(0);
  const state = signal<PlayState>('paused');
  const duration = computed(() => projectEnd(project.value));
  const calls: string[] = [];
  const clamp = (t: Micros) => Math.min(Math.max(0, t), duration.peek());
  return {
    time,
    state,
    duration,
    slowDevice: signal(false),
    calls,
    seek(t: Micros) {
      calls.push(`seek ${t}`);
      time.value = clamp(t);
    },
    step(n: number) {
      calls.push(`step ${n}`);
      time.value = stepTime(time.peek(), n, project.peek().frame.frameRate, duration.peek());
    },
    toggle() {
      calls.push('toggle');
      state.value = state.peek() === 'playing' ? 'paused' : 'playing';
    },
    toStart() {
      calls.push('start');
      time.value = 0;
    },
    toEnd() {
      calls.push('end');
      time.value = duration.peek();
    },
  };
}

afterEach(() => resetDeviceSession());

describe('MOD-App playhead binding (F-002.R3, for F-003)', () => {
  it('F-002.R3 the controller time drives MOD-Project’s playhead, and a playhead set elsewhere seeks the preview', () => {
    const project = signal(proj({ clips: [video('a', 10)] }));
    const ctl = fakeController(project);
    const playhead = signal<Micros>(4 * S); // set before mounting (F-001 places audio at the playhead)
    const stop = connectPreview(ctl, { playhead });
    expect(ctl.time.value).toBe(4 * S);
    expect(ctl.calls).toEqual([`seek ${4 * S}`]);

    // Playing or stepping moves the controller: the playhead follows, without a seek back.
    ctl.time.value = 5 * S;
    expect(playhead.value).toBe(5 * S);
    expect(ctl.calls).toHaveLength(1);

    // The timeline (F-003) or undo (RULE-13) moves the playhead: the preview seeks there.
    playhead.value = 7 * S;
    expect(ctl.calls.at(-1)).toBe(`seek ${7 * S}`);
    expect(ctl.time.value).toBe(7 * S);

    // A playhead past the end is pulled back to the end the controller allows.
    playhead.value = 30 * S;
    expect(ctl.time.value).toBe(10 * S);
    expect(playhead.value).toBe(10 * S);

    stop();
    ctl.time.value = 1 * S;
    expect(playhead.value).toBe(10 * S);
  });

  it('F-023.AC7 the preview’s slow-device signal shows COPY-notice.slow_device once (watchSlow wired by F-002)', () => {
    const project = signal(proj({ clips: [video('a', 10)] }));
    const ctl = fakeController(project);
    const stop = connectPreview(ctl, { playhead: signal(0) });
    expect(slowNotice.value).toBe(false);
    ctl.slowDevice.value = true;
    expect(slowNotice.value).toBe(true);
    stop();
  });
});

describe('MOD-App playback keys (RULE-20)', () => {
  it('F-002.AC5 Right at 2.000 s at 30 fps moves to 2 s + 1 frame; Shift+Right one second; Home/End', () => {
    const project = signal(proj({ clips: [video('a', 10)] }));
    const ctl = fakeController(project);
    ctl.time.value = 2 * S;
    expect(runAction(ctl, 'frame-forward', 30)).toBe(true);
    expect(ctl.time.value).toBe(2 * S + frameStart(1, 30));
    expect(runAction(ctl, 'frame-back', 30)).toBe(true);
    expect(ctl.time.value).toBe(2 * S);
    runAction(ctl, 'second-forward', 30);
    expect(ctl.time.value).toBe(3 * S);
    runAction(ctl, 'second-back', 30);
    expect(ctl.time.value).toBe(2 * S);
    runAction(ctl, 'go-end', 30);
    expect(ctl.time.value).toBe(10 * S);
    runAction(ctl, 'go-start', 30);
    expect(ctl.time.value).toBe(0);
    runAction(ctl, 'play-pause', 30);
    expect(ctl.state.value).toBe('playing');
  });

  it('RULE-20 with nothing to play (no main-track clip) the keys do nothing and keep the browser default', () => {
    const project = signal(proj({ audioClips: [audio('m', 0, 5)] }));
    const ctl = fakeController(project);
    expect(runAction(ctl, 'play-pause', 30)).toBe(false);
    expect(runAction(ctl, 'frame-forward', 30)).toBe(false);
    expect(runAction(ctl, 'escape', 30)).toBe(false);
    expect(ctl.calls).toEqual([]);
  });
});

describe('MOD-App Esc (RULE-20, CMP-Preview)', () => {
  it('RULE-20 Esc does one thing: an open drop overlay, dialog, popover or menu takes it before the maximised preview', () => {
    const doc = (open: string | null) =>
      ({ querySelector: (sel: string) => (open && sel.includes(open) ? {} : null) }) as unknown as Document;
    expect(overlayOpen(doc(null))).toBe(false);
    expect(overlayOpen(doc('[role="dialog"]'))).toBe(true);
    expect(overlayOpen(doc('dialog[open]'))).toBe(true);
    expect(overlayOpen(doc('[role="menu"]'))).toBe(true);
    dragging.value = true;
    expect(overlayOpen(doc(null))).toBe(true);
    dragging.value = false;
  });
});

describe('MOD-App worker feed (F-002.R1/R2)', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const bitmap = { photo: true } as unknown as ImageBitmap;
  const file = new Blob(['x']);
  const media = async (s: Source): Promise<EngineMedia | null> =>
    s.kind === 'video'
      ? { id: s.id, kind: 'video', file }
      : s.kind === 'photo'
        ? { id: s.id, kind: 'photo', bitmap }
        : { id: s.id, kind: 'audio', file };

  const changes = (msgs: ToEngine[]) =>
    msgs.filter((m): m is Extract<ToEngine, { type: 'engine:mediaChanges' }> => m.type === 'engine:mediaChanges');

  it('ADR-0009 §7 the engine gets only new sources (audio sources too, for the sound feed) and the ids of removed ones, never the whole list again', async () => {
    const project = signal(proj({ clips: [video('a', 4), photo('p', 3)], audioClips: [audio('m', 0, 5)] }));
    const engine: ToEngine[] = [];
    const looked: string[] = [];
    const stop = feedWorkers({
      project,
      engine: { postMessage: (m) => engine.push(m) },
      audio: { postMessage: () => undefined },
      media: (s) => {
        looked.push(s.id);
        return media(s);
      },
    });
    await flush();
    expect(engine.filter((m) => m.type === 'engine:media')).toEqual([]);
    // Each new source travels once, as soon as it is ready.
    expect(changes(engine).flatMap((m) => m.add)).toEqual([
      { id: 'src-a', kind: 'video', file },
      { id: 'src-p', kind: 'photo', bitmap },
      { id: 'src-m', kind: 'audio', file },
    ]);
    expect(changes(engine).flatMap((m) => m.remove)).toEqual([]);
    const sentSoFar = changes(engine).length;

    // An edit that keeps the sources sends nothing.
    project.value = { ...project.value, clips: [...project.value.clips] };
    await flush();
    expect(changes(engine)).toHaveLength(sentSoFar);

    // A new source: only it travels.
    project.value = proj({ clips: [video('a', 4), photo('p', 3), video('b', 2)], audioClips: [audio('m', 0, 5)] });
    await flush();
    expect(changes(engine).at(-1)).toEqual({
      type: 'engine:mediaChanges',
      add: [{ id: 'src-b', kind: 'video', file }],
      remove: [],
    });

    // Sources leaving the project leave the engine by id (ADR-0009 §7).
    project.value = proj({ clips: [video('a', 4)] });
    await flush();
    expect(changes(engine).at(-1)).toEqual({
      type: 'engine:mediaChanges',
      add: [],
      remove: ['src-p', 'src-m', 'src-b'],
    });
    expect(looked).toEqual(['src-a', 'src-p', 'src-m', 'src-b']);
    stop();
  });

  it('F-011.R5 Q87 the bundled tracks audio clips play, and the one auditioned, reach the engine as audio files once', async () => {
    const track = 'placeholder-pad';
    // A bundled track is not one of the project's sources (ENT-MusicTrack).
    const base = proj({ clips: [video('a', 4)], audioClips: [audio('m', 0, 2, { sourceId: track })] });
    const project = signal({ ...base, sources: base.sources.filter((s) => s.id !== track) });
    const audition = signal<string | null>(null);
    const engine: ToEngine[] = [];
    const read: string[] = [];
    const music = async (id: string) => {
      read.push(id);
      return file;
    };
    expect(musicIds(project.value, 'placeholder-chords')).toEqual([track, 'placeholder-chords']);
    const stop = feedWorkers({
      project,
      engine: { postMessage: (m) => engine.push(m) },
      audio: { postMessage: () => undefined },
      media,
      music,
      audition,
    });
    await flush();
    expect(changes(engine).flatMap((m) => m.add)).toEqual([
      { id: 'src-a', kind: 'video', file },
      { id: track, kind: 'audio', file },
    ]);
    audition.value = 'placeholder-chords';
    await flush();
    expect(changes(engine).at(-1)).toEqual({
      type: 'engine:mediaChanges',
      add: [{ id: 'placeholder-chords', kind: 'audio', file }],
      remove: [],
    });
    audition.value = null;
    await flush();
    expect(changes(engine).at(-1)).toEqual({ type: 'engine:mediaChanges', add: [], remove: ['placeholder-chords'] });
    expect(read).toEqual([track, 'placeholder-chords']);
    stop();
  });

  it('F-011.R7 a bundled track whose read fails is reported, and read again on Play (retry)', async () => {
    const track = 'placeholder-pad';
    const project = signal(proj({ clips: [video('a', 4)] }));
    const audition = signal<string | null>(null);
    const retry = signal(false);
    const engine: ToEngine[] = [];
    const failed: string[] = [];
    let fail = true;
    const music = async (id: string) => {
      if (fail) throw new Error('NetworkError');
      return new Blob([id]);
    };
    const stop = feedWorkers({
      project,
      engine: { postMessage: (m) => engine.push(m) },
      audio: { postMessage: () => undefined },
      media,
      music,
      audition,
      onMusicFailed: (id) => failed.push(id),
      retry,
    });
    audition.value = track;
    await flush();
    expect(failed).toEqual([track]);
    expect(changes(engine).flatMap((m) => m.add.map((x) => x.id))).toEqual(['src-a']);
    // Play: the read is tried again and the track reaches the engine.
    fail = false;
    retry.value = true;
    await flush();
    expect(changes(engine).flatMap((m) => m.add.map((x) => x.id))).toEqual(['src-a', track]);
    expect(failed).toEqual([track]);
    stop();
  });

  it('F-011.R1 an auditioned track whose read fails stops its preview and shows COPY-notice.music_unavailable', () => {
    resetNotices();
    auditionTrack.value = 'placeholder-pad';
    musicFailed('placeholder-pad');
    expect(auditionTrack.value).toBeNull();
    expect(notices.value.map((n) => [n.kind, n.tag])).toEqual([['warning', 'music_unavailable']]);
    expect(notices.value[0]!.text()).toBe("This track couldn't be loaded. Try again.");
    // A project's track failing leaves another audition alone.
    auditionTrack.value = 'placeholder-chords';
    musicFailed('placeholder-pad');
    expect(auditionTrack.value).toBe('placeholder-chords');
    auditionTrack.value = null;
    resetNotices();
  });

  it('F-002.R2 every project change reaches the audio worker, whose mix the preview plays', async () => {
    const project = signal(proj({ clips: [video('a', 4)] }));
    const audioMsgs: ToAudioWorker[] = [];
    const stop = feedWorkers({
      project,
      engine: { postMessage: () => undefined },
      audio: { postMessage: (m) => audioMsgs.push(m) },
      media,
    });
    expect(audioMsgs).toEqual([{ type: 'audio:setProject', project: project.value }]);
    const next = proj({ clips: [video('a', 4), video('b', 2)] });
    project.value = next;
    expect(audioMsgs.at(-1)).toEqual({ type: 'audio:setProject', project: next });
    stop();
    project.value = proj();
    expect(audioMsgs).toHaveLength(2);
  });

  it('F-002.R1 a slow lookup for a source removed meanwhile is never sent; one re-added meanwhile is sent once', async () => {
    const project = signal(proj({ clips: [video('a', 4)] }));
    const engine: ToEngine[] = [];
    let release: () => void = () => undefined;
    const slow = (s: Source) =>
      s.id === 'src-a'
        ? new Promise<EngineMedia>((r) => (release = () => r({ id: s.id, kind: 'video', file })))
        : media(s);
    const stop = feedWorkers({
      project,
      engine: { postMessage: (m) => engine.push(m) },
      audio: { postMessage: () => undefined },
      media: slow,
    });
    project.value = proj({ clips: [photo('p', 3)] });
    await flush();
    release();
    await flush();
    expect(changes(engine)).toEqual([
      { type: 'engine:mediaChanges', add: [{ id: 'src-p', kind: 'photo', bitmap }], remove: [] },
    ]);

    // Removed and back again (undo) while its lookup runs: added once.
    project.value = proj({ clips: [photo('p', 3), video('a', 4)] });
    project.value = proj({ clips: [photo('p', 3)] });
    project.value = proj({ clips: [photo('p', 3), video('a', 4)] });
    release();
    await flush();
    const adds = changes(engine).flatMap((m) => m.add.map((x) => x.id));
    expect(adds).toEqual(['src-p', 'src-a']);
    stop();
  });
});
