// MOD-Audio — the audio worker's streamer over windowed decoding (ADR-0008 §5/§6): Play waits until the
// sound at the playhead is decoded (the worklet's clock does not move before the first block), a paused
// playhead is decoded ahead, the streamed samples equal the export render of the same decoded sound, and
// a decode that stalls is not waited for longer than STALL_MS.
import { describe, expect, it } from 'vitest';
import {
  bankOf,
  endSampleOf,
  pcmSource,
  renderOffline,
  SoundBank,
  STALL_MS,
  Streamer,
  type ToWorklet,
} from '../../src/audio';
import { voices } from '../../src/plan';
import { proj, S, video } from '../support/project';
import { fakeDecoders, fakeFeed, settle, type FakeTrack } from '../support/sound-feed';
import { hash } from '../support/audio';

const SR = 48_000;

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

const blocks = (sent: ToWorklet[]) =>
  sent.filter((m): m is Extract<ToWorklet, { type: 'block' }> => m.type === 'block');

const t44: FakeTrack = {
  rate: 44_100,
  frames: 1024,
  priming: 2112,
  length: 44_100 * 6,
  channels: 2,
  sample: (n, c) => (n < 0 ? 0.9 : Math.fround(0.4 * Math.sin(n * 0.0627 + c))),
};

function rig() {
  const tracks = { 'src-a': t44 };
  let streamer: Streamer | null = null;
  const bank = new SoundBank(fakeFeed(tracks), fakeDecoders(tracks), () => streamer?.decoded());
  bank.setSources(['src-a']);
  const { port, sent } = fakePort();
  streamer = new Streamer(bank.get, undefined, undefined, bank);
  streamer.connect(port);
  const project = proj({ clips: [video('a', 5, { speedPct: 150 })] });
  streamer.setProject(project);
  return { bank, streamer, port, sent, project };
}

describe('MOD-Audio streamer over windowed decoding', () => {
  it('F-002.R2 Play waits for the decoded sound at the playhead, then streams the same samples as the export render', async () => {
    const { bank, streamer, port, sent, project } = rig();
    streamer.play(1 * S, 1);
    expect(sent).toEqual([{ type: 'flush', gen: 1, from: SR }]); // nothing to play yet: the clock waits
    await settle();
    const first = blocks(sent)[0]!;
    expect(first.from).toBe(SR);
    for (let played = 0; played < 2 * SR; played += 4096) {
      port.played(1, played);
      await settle(5);
    }
    // The export path: the same decoded sound, rendered offline from a bank decoding from the start.
    const tracks = { 'src-a': t44 };
    const whole = new SoundBank(fakeFeed(tracks), fakeDecoders(tracks));
    whole.setSources(['src-a']);
    const all = [{ sourceId: 'src-a', from: -SR, to: 10 * SR }];
    whole.want(all);
    await whole.until(all);
    const end = endSampleOf(project);
    const [L, R] = [new Float32Array(end), new Float32Array(end)];
    renderOffline(voices(project), whole.get, end, (l, r, at) => (L.set(l, at), R.set(r, at)));
    const got = blocks(sent);
    const n = got.reduce((s, b) => s + b.L.length, 0);
    const [gL, gR] = [new Float32Array(n), new Float32Array(n)];
    for (const b of got) {
      gL.set(b.L, b.from - SR);
      gR.set(b.R, b.from - SR);
    }
    // After a seek the limiter pre-rolls 1 s, as in ADR-0008 §5 (≤ 6e-8 from a continuous render).
    let diff = 0;
    for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(gL[i]! - L[SR + i]!), Math.abs(gR[i]! - R[SR + i]!));
    expect(diff).toBeLessThan(1e-6);
    expect(bank.cursors).toBe(1);
  });

  it('F-002.R2 a paused playhead is decoded ahead, so Play streams at once', async () => {
    const { bank, streamer, sent } = rig();
    streamer.seek(2 * S, 1);
    await settle();
    expect(bank.ready([{ sourceId: 'src-a', from: 3 * SR, to: 3.5 * SR }])).toBe(true);
    streamer.play(2 * S, 2);
    expect(blocks(sent)[0]?.from).toBe(2 * SR);
  });

  it('INV-02 the streamer renders the same samples whether the sound was given whole or decoded', async () => {
    const { port, sent, project, streamer } = rig();
    streamer.play(0, 1);
    await settle();
    for (let played = 0; !sent.some((m) => m.type === 'end'); played += 4096) {
      port.played(1, played);
      await settle(3);
    }
    // The same track as one decoded array (what `audio:pcm` gives).
    const n = SR * 6;
    const tracks = { 'src-a': t44 };
    const whole = new SoundBank(fakeFeed(tracks), fakeDecoders(tracks));
    whole.setSources(['src-a']);
    whole.want([{ sourceId: 'src-a', from: -SR, to: n }]);
    await whole.until([{ sourceId: 'src-a', from: -SR, to: n }]);
    const [WL, WR] = [new Float32Array(n), new Float32Array(n)];
    whole.get('src-a')!.read(0, WL, WR);
    const given = new Streamer(bankOf(new Map([['src-a', pcmSource(WL, WR)]])));
    const other = fakePort();
    given.connect(other.port);
    given.setProject(project);
    given.play(0, 1);
    for (let played = 0; !other.sent.some((m) => m.type === 'end'); played += 4096) other.port.played(1, played);
    const join = (s: ToWorklet[]) => {
      const b = blocks(s);
      const len = b.reduce((x, m) => x + m.L.length, 0);
      const [L, R] = [new Float32Array(len), new Float32Array(len)];
      for (const m of b) {
        L.set(m.L, m.from);
        R.set(m.R, m.from);
      }
      return hash(L, R);
    };
    expect(join(sent)).toBe(join(other.sent));
  });

  it('MOD-Audio a block waits at most STALL_MS for its sound, then plays (that sound silent)', () => {
    const timers: (() => void)[] = [];
    const { port, sent } = fakePort();
    const s = new Streamer(
      () => undefined,
      undefined,
      undefined,
      { want: () => undefined, ready: () => false },
      { setTimeout: (f, ms) => (expect(ms).toBe(STALL_MS), timers.push(f)), clearTimeout: () => undefined },
    );
    s.connect(port);
    s.setProject(proj({ clips: [video('a', 2)] }));
    s.play(0, 1);
    expect(blocks(sent)).toHaveLength(0);
    expect(timers).toHaveLength(1);
    timers.shift()!();
    expect(blocks(sent).length).toBeGreaterThan(0);
    expect(s.stalls).toBe(1);
  });
});
