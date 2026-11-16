// MOD-Audio — the music picker's audition (F-011.R1, ADR-0008 §7): a one-voice plan of the bundled track
// streamed through the same mixer, the project's plan kept meanwhile; the main-thread controller's own
// generation and position, with fakes.
import { describe, expect, it } from 'vitest';
import {
  auditionVoice,
  bankOf,
  pcmSource,
  Playback,
  render,
  soundSourceIds,
  Streamer,
  type AudioEnv,
  type FromWorkletNode,
  type ToAudioWorker,
  type ToWorklet,
} from '../../src/audio';
import { voices } from '../../src/plan';
import { audio, proj, S, video } from '../support/project';
import { hash, material, SR } from '../support/audio';

function fakePort() {
  const sent: ToWorklet[] = [];
  const port = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    postMessage: (m: ToWorklet) => sent.push(m),
    played(gen: number, played: number) {
      port.onmessage?.({ data: { type: 'played', gen, played } } as MessageEvent);
    },
  };
  return { port, sent };
}

const blocksOf = (sent: ToWorklet[], gen: number) =>
  sent.filter((m): m is Extract<ToWorklet, { type: 'block' }> => m.type === 'block' && m.gen === gen);

describe('MOD-Audio audition (audio worker)', () => {
  const project = proj({ clips: [video('a', 3)] });
  const TRACK = 'track-x';
  const trackLen = 2 * SR;
  const sources = bankOf(
    new Map([
      ['src-a', pcmSource(material(5, 1), material(5, 2))],
      [TRACK, pcmSource(material(2, 3), material(2, 4))],
    ]),
  );

  it('F-011.R1 ADR-0008 §7 the audition streams the bundled track from its start through the same mixer and ends at its end', () => {
    const { port, sent } = fakePort();
    const s = new Streamer(sources);
    s.connect(port);
    s.setProject(project);
    s.audition(TRACK, trackLen, 3);
    expect(s.auditioning).toBe(true);
    expect(sent[0]).toEqual({ type: 'flush', gen: 3, from: 0 });
    for (let played = 0; !sent.some((m) => m.type === 'end'); played += 4096) port.played(3, played);
    const L = new Float32Array(trackLen);
    const R = new Float32Array(trackLen);
    for (const m of blocksOf(sent, 3)) {
      L.set(m.L, m.from);
      R.set(m.R, m.from);
    }
    const [eL, eR] = render([auditionVoice(TRACK, trackLen)], sources, trackLen, 0, trackLen);
    expect(hash(L, R)).toBe(hash(eL, eR));
    expect(sent.at(-1)).toEqual({ type: 'end', gen: 3, at: trackLen });
  });

  it('F-011.R1 an edit during the audition is kept for later; stopping restores the project paused at the playhead', () => {
    const { port, sent } = fakePort();
    const s = new Streamer(sources);
    s.connect(port);
    s.setProject(project);
    s.audition(TRACK, trackLen, 1);
    const longer = proj({ clips: [video('a', 4)] });
    s.setProject(longer);
    s.seek(2 * S, 2); // ignored while auditioning
    expect(blocksOf(sent, 2)).toEqual([]);
    s.stopAudition(1 * S, 3);
    expect(s.auditioning).toBe(false);
    expect(sent.at(-1)).toEqual({ type: 'flush', gen: 3, from: SR });
    // Playing again plays the edited project from where the playhead is.
    s.play(1 * S, 4);
    port.played(4, 0);
    const first = blocksOf(sent, 4)[0]!;
    const [eL] = render(voices(longer), sources, 4 * SR, SR, first.L.length);
    expect(Array.from(first.L)).toEqual(Array.from(eL));
  });

  it('F-011.R1 playing the project ends the audition', () => {
    const { port, sent } = fakePort();
    const s = new Streamer(sources);
    s.connect(port);
    s.setProject(project);
    s.audition(TRACK, trackLen, 1);
    s.play(0, 2);
    expect(s.auditioning).toBe(false);
    const first = blocksOf(sent, 2)[0]!;
    const [eL] = render(voices(project), sources, 3 * SR, 0, first.L.length);
    expect(Array.from(first.L)).toEqual(Array.from(eL));
  });

  it('F-011.R5 Q87 the sound decoded is every source with sound plus each bundled track an audio clip plays', () => {
    const p = proj({
      clips: [video('a', 3)],
      audioClips: [audio('m', 0, 2, { sourceId: 'placeholder-pad' }), audio('n', 2, 3)],
    });
    // A bundled track is not one of the project's sources (ENT-MusicTrack); the video has sound.
    const withSound = {
      ...p,
      sources: p.sources.filter((s) => s.id !== 'placeholder-pad').map((s) => ({ ...s, hasSound: true })),
    };
    expect(soundSourceIds(withSound).sort()).toEqual(['placeholder-pad', 'src-a', 'src-n'].sort());
  });
});

function fakeEnv() {
  const ctx = {
    state: 'running',
    sampleRate: SR,
    currentTime: 0,
    destination: {},
    audioWorklet: { addModule: async () => undefined },
    resume: () => Promise.resolve(),
    close: async () => undefined,
    addEventListener: () => undefined,
  };
  const node = {
    port: {
      onmessage: null as ((e: MessageEvent<FromWorkletNode>) => void) | null,
      postMessage: () => undefined,
    },
    connect: () => undefined,
    disconnect: () => undefined,
  };
  const env: AudioEnv = {
    createContext: () => ctx,
    createNode: () => node,
    createChannel: () => ({ port1: {} as MessagePort, port2: {} as MessagePort }),
    audioSession: () => undefined,
    onPageReturn: () => undefined,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    now: () => 0,
  };
  const toWorker: ToAudioWorker[] = [];
  const worker = { postMessage: (m: ToAudioWorker) => void toWorker.push(m) };
  const fromWorklet = (m: FromWorkletNode) => node.port.onmessage?.({ data: m } as MessageEvent<FromWorkletNode>);
  return { ctx, env, worker, toWorker, fromWorklet };
}

describe('MOD-Audio audition (main thread)', () => {
  it('F-011.R1 the audition has its own generation: a seek or pause meanwhile tells the worker nothing, Stop resumes the project at the playhead', async () => {
    const f = fakeEnv();
    const p = new Playback(f.worker, '/w.js', f.env);
    let ended = 0;
    p.onAuditionEnded = () => ended++;
    await p.audition('track-x', 2 * S);
    expect(f.toWorker.at(-1)).toEqual({ type: 'audio:audition', trackId: 'track-x', length: 2 * SR, gen: 1 });
    expect(p.auditioning).toBe('track-x');
    const before = f.toWorker.length;
    p.seek(3 * S);
    p.pause();
    expect(f.toWorker.length).toBe(before);
    f.fromWorklet({ type: 'position', gen: 1, sample: 0, frame: 0 });
    f.ctx.currentTime = 0.5;
    expect(p.auditionTime()).toBe(0.5 * S);
    expect(p.now()).toBe(3 * S); // the project's clock stays at the playhead
    p.stopAudition();
    expect(f.toWorker.at(-1)).toEqual({ type: 'audio:auditionStop', t: 3 * S, gen: 2 });
    expect(p.auditioning).toBeNull();
    expect(ended).toBe(1);
  });

  it('F-011.R1 the track playing to its end stops the audition; playing the project replaces it', async () => {
    const f = fakeEnv();
    const p = new Playback(f.worker, '/w.js', f.env);
    let ended = 0;
    p.onAuditionEnded = () => ended++;
    await p.audition('track-x', S);
    f.fromWorklet({ type: 'ended', gen: 1, sample: SR });
    expect(p.auditioning).toBeNull();
    expect(f.toWorker.at(-1)?.type).toBe('audio:auditionStop');
    expect(ended).toBe(1);
    await p.audition('track-y', S);
    await p.play(0);
    expect(p.auditioning).toBeNull();
    expect(ended).toBe(2);
    expect(f.toWorker.at(-1)).toMatchObject({ type: 'audio:play', from: 0 });
  });
});
