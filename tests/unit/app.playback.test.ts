// MOD-App playback wiring (F-002): the preview controller bound to MOD-Project's playhead (the binding
// F-003's timeline uses), the engine and audio workers fed with the session's project and sources,
// RULE-20 playback keys dispatched to the controller, and the slow-device signal followed into the
// session notice (F-023.AC7, build question 62).
import { computed, signal, type ReadonlySignal } from '@preact/signals';
import { afterEach, describe, expect, it } from 'vitest';
import { connectPreview, feedWorkers, runAction } from '../../src/app/playback';
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

describe('MOD-App worker feed (F-002.R1/R2)', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const bitmap = { photo: true } as unknown as ImageBitmap;
  const file = new Blob(['x']);
  const media = async (s: Source): Promise<EngineMedia | null> =>
    s.kind === 'video'
      ? { id: s.id, kind: 'video', file }
      : s.kind === 'photo'
        ? { id: s.id, kind: 'photo', bitmap }
        : null;

  it('F-002.R1 the engine gets the project’s video files and photo bitmaps, once per change of the source set', async () => {
    const project = signal(proj({ clips: [video('a', 4), photo('p', 3)], audioClips: [audio('m', 0, 5)] }));
    const engine: ToEngine[] = [];
    const audioMsgs: ToAudioWorker[] = [];
    const stop = feedWorkers({
      project,
      engine: { postMessage: (m) => engine.push(m) },
      audio: { postMessage: (m) => audioMsgs.push(m) },
      media,
    });
    await flush();
    const sent = engine.filter((m) => m.type === 'engine:media');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      type: 'engine:media',
      media: [
        { id: 'src-a', kind: 'video', file },
        { id: 'src-p', kind: 'photo', bitmap },
      ],
    });

    // An edit that keeps the sources sends no new media (the engine keeps its decoders).
    project.value = { ...project.value, clips: project.value.clips.slice(0, 1).concat(project.value.clips.slice(1)) };
    await flush();
    expect(engine.filter((m) => m.type === 'engine:media')).toHaveLength(1);

    // A source leaving the project leaves the engine's media too (ADR-0009 §7).
    project.value = proj({ clips: [video('a', 4)] });
    await flush();
    const last = engine.filter((m) => m.type === 'engine:media').at(-1);
    expect(last).toEqual({ type: 'engine:media', media: [{ id: 'src-a', kind: 'video', file }] });
    stop();
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

  it('F-002.R1 a slower lookup that finishes after a newer change never overwrites the newer media', async () => {
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
    const sent = engine.filter((m) => m.type === 'engine:media');
    expect(sent).toEqual([{ type: 'engine:media', media: [{ id: 'src-p', kind: 'photo', bitmap }] }]);
    stop();
  });
});
