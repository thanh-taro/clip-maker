// MOD-Engine controller with fake decoders and a fake compositor: ticks and seeks paint the frame plan
// (latest wins), the end of the project, skipped frames while playing, slow sources (RULE-22), source
// errors, context-loss recovery (ADR-0006 outcome rule 6), release (ADR-0003 §5).
import { describe, expect, it } from 'vitest';
import type { EngineMedia, FromEngine, Project, ToEngine } from '../../src/core';
import {
  BUDGETS,
  Engine,
  runKeys,
  SLOW_PAINTS,
  type EngineDeps,
  type SlotLike,
  type VideoSourceLike,
} from '../../src/engine';
import {
  FakeCompositor,
  FakeFrame,
  fakeSlot,
  type DecoderLog,
  type DecoderOptions,
  type TrackOptions,
} from '../support/engine';
import { photo, proj, S, video } from '../support/project';

const ts30 = (k: number): number => Math.floor((k * 1_000_000) / 30);

interface Rig {
  engine: Engine;
  comp: FakeCompositor;
  events: FromEngine[];
  send(m: ToEngine): Promise<void>;
  shown(): Extract<FromEngine, { type: 'engine:frameShown' }>[];
}

function source(track: TrackOptions, slot?: () => SlotLike): VideoSourceLike {
  return {
    rotation: 0,
    frameUs: 1_000_000 / track.rate,
    keySpacing: track.gop / track.rate,
    newSlot: slot ?? (() => fakeSlot(track) as unknown as SlotLike),
    close: () => undefined,
  };
}

function rig(
  project: Project,
  opts: {
    open?: EngineDeps['openVideo'];
    media?: EngineMedia[];
    now?: () => number;
    coarseCopy?: EngineDeps['coarseCopy'];
  } = {},
): Rig {
  const comp = new FakeCompositor();
  const events: FromEngine[] = [];
  const engine = new Engine({
    post: (m) => events.push(m),
    createCompositor: () => comp,
    openVideo: opts.open ?? (async () => source({ rate: 30, frames: 300, gop: 30 })),
    effectsCheck: async (onDrawn) => {
      onDrawn?.(true);
      return { ok: true, fps: 45, slow: false };
    },
    coarseCopy:
      opts.coarseCopy ??
      (async (f) => ({ width: 64, height: 36, close: () => undefined, timestamp: f.timestamp }) as never),
    budget: BUDGETS.laptop,
    phone: false,
    now: opts.now ?? (() => performance.now()),
  });
  const media: EngineMedia[] =
    opts.media ??
    project.sources.map((s) => ({ id: s.id, kind: 'video' as const, file: new Blob([new Uint8Array(1)]) }));
  const send = async (m: ToEngine): Promise<void> => {
    engine.handle(m);
    await engine.settled();
  };
  engine.handle({
    type: 'engine:canvas',
    canvas: { width: 0, height: 0 } as unknown as OffscreenCanvas,
    width: 640,
    height: 360,
  });
  engine.handle({ type: 'engine:media', media });
  engine.handle({ type: 'engine:setProject', project });
  return {
    engine,
    comp,
    events,
    send,
    shown: () =>
      events.filter((e): e is Extract<FromEngine, { type: 'engine:frameShown' }> => e.type === 'engine:frameShown'),
  };
}

const twoClips = (): Project => proj({ clips: [video('a', 5), video('b', 5)] });

describe('MOD-Engine ticks and seeks', () => {
  it('F-002.R1 a tick paints the plan of its frame with the source frame for that time and reports it shown', async () => {
    const r = rig(twoClips());
    await r.send({ type: 'engine:tick', t: ts30(40) + 5, playing: false });
    const last = r.comp.paints.at(-1)!;
    expect(last.frameIndex).toBe(40);
    expect(last.frames).toEqual([ts30(40)]);
    expect(r.shown().at(-1)).toEqual({ type: 'engine:frameShown', t: ts30(40), frameIndex: 40, exact: true });
  });

  it('F-002.R1 the second clip shows its own source time (in point plus elapsed time)', async () => {
    const r = rig(proj({ clips: [video('a', 2), video('b', 6, {}, 1)] }));
    await r.send({ type: 'engine:seek', t: 2 * S + ts30(3) });
    expect(r.comp.paints.at(-1)!.frames).toEqual([S + ts30(3)]);
  });

  it('F-002.R3 scrubbing coalesces seeks: the latest wins and is the one left on screen', async () => {
    const r = rig(twoClips());
    for (let k = 10; k < 90; k += 7) r.engine.handle({ type: 'engine:seek', t: ts30(k) });
    r.engine.handle({ type: 'engine:seek', t: ts30(123) });
    await r.engine.settled();
    expect(r.comp.paints.length).toBeLessThan(14);
    expect(r.comp.paints.at(-1)!.frameIndex).toBe(123);
    expect(r.shown().at(-1)!.exact).toBe(true);
  });

  it('INV-07 at or past the project end the last frame stays on screen', async () => {
    const r = rig(twoClips());
    await r.send({ type: 'engine:seek', t: 20 * S });
    expect(r.comp.paints.at(-1)!.frameIndex).toBe(299);
  });

  it('F-002.R1 a source whose media arrives after the project is drawn once it arrives (the app sends media later)', async () => {
    const project = proj({ clips: [video('a', 5)] });
    const r = rig(project, { media: [] });
    await r.send({ type: 'engine:seek', t: ts30(10) });
    expect(r.shown().at(-1)).toMatchObject({ frameIndex: 10, exact: false });
    await r.send({
      type: 'engine:media',
      media: [{ id: 'src-a', kind: 'video', file: new Blob([new Uint8Array(1)]) }],
    });
    expect(r.comp.paints.at(-1)!.frames).toEqual([ts30(10)]);
    expect(r.shown().at(-1)).toMatchObject({ frameIndex: 10, exact: true });
  });

  it('ADR-0009 §7 media changes posted through structuredClone keep the decoders and slots of sources that stay', async () => {
    const track = { rate: 30, frames: 300, gop: 30 };
    const opened: string[] = [];
    const closedA = { n: 0 };
    const slot = (id: string) => () => {
      const s = fakeSlot(track) as unknown as SlotLike;
      const close = s.close.bind(s);
      s.close = () => {
        if (id === 'src-a') closedA.n++;
        close();
      };
      return s;
    };
    const opensOfA = () => opened.filter((id) => id === 'src-a').length;
    const fileA = new Blob([new Uint8Array(1)]);
    const r = rig(proj({ clips: [video('a', 5)] }), {
      media: [],
      open: async (id) => {
        opened.push(id);
        return source(track, slot(id));
      },
    });
    // What the main thread posts arrives structured-cloned (new Blob and bitmap objects every time).
    const post = (m: ToEngine) => r.send(structuredClone(m));
    await post({ type: 'engine:mediaChanges', add: [{ id: 'src-a', kind: 'video', file: fileA }], remove: [] });
    await r.send({ type: 'engine:seek', t: ts30(10) });
    expect(opened).toEqual(['src-a']);
    expect(r.shown().at(-1)).toMatchObject({ frameIndex: 10, exact: true });

    // Another source arrives, then leaves: src-a is never reopened and its slot never closed.
    const two = proj({ clips: [video('a', 5), video('b', 5)] });
    await r.send({ type: 'engine:setProject', project: two });
    await post({ type: 'engine:mediaChanges', add: [{ id: 'src-b', kind: 'video', file: fileA }], remove: [] });
    await r.send({ type: 'engine:seek', t: ts30(5 * 30 + 20) });
    expect(r.shown().at(-1)).toMatchObject({ exact: true });
    await r.send({ type: 'engine:setProject', project: proj({ clips: [video('a', 5)] }) });
    await post({ type: 'engine:mediaChanges', add: [], remove: ['src-b'] });
    await r.send({ type: 'engine:seek', t: ts30(12) });
    expect(opened).toEqual(['src-a', 'src-b']);
    expect(closedA.n).toBe(0);
    expect(r.shown().at(-1)).toMatchObject({ frameIndex: 12, exact: true });

    // A full list re-posted through structuredClone keeps the same sources too (a source id's file never changes).
    await post({ type: 'engine:media', media: [{ id: 'src-a', kind: 'video', file: fileA }] });
    await r.send({ type: 'engine:seek', t: ts30(14) });
    expect(opensOfA()).toBe(1);
    expect(closedA.n).toBe(0);
  });

  it('F-002.R1 an empty project paints the background and reports the frame', async () => {
    const r = rig(proj({}));
    await r.send({ type: 'engine:seek', t: 0 });
    expect(r.comp.paints.at(-1)!.frames).toEqual([]);
  });

  it('F-002.R1 a photo clip paints its bitmap', async () => {
    const bitmap = { width: 1200, height: 1600, close: () => undefined };
    const p = proj({ clips: [photo('p', 3)] });
    const r = rig(p, { media: [{ id: 'src-p', kind: 'photo', bitmap: bitmap as unknown as ImageBitmap }] });
    await r.send({ type: 'engine:seek', t: S });
    expect(r.comp.paints.at(-1)!.frames).toEqual([-1]);
  });

  it('F-002 playing ticks inside one frame paint once; frames passed over are counted as skipped', async () => {
    const r = rig(twoClips());
    await r.send({ type: 'engine:tick', t: ts30(0), playing: true });
    await r.send({ type: 'engine:tick', t: ts30(0) + 1000, playing: true });
    expect(r.comp.paints.length).toBe(1);
    await r.send({ type: 'engine:tick', t: ts30(5), playing: true });
    r.engine.handle({ type: 'engine:stats' });
    const stats = r.events.at(-1) as Extract<FromEngine, { type: 'engine:stats' }>;
    expect(stats.stats.skipped).toBe(4);
    expect(stats.stats.painted).toBe(2);
  });
});

describe('RULE-22 slow sources and errors', () => {
  it('RULE-22 a source that keeps showing older frames while playing is reported slow once', async () => {
    const lagging: SlotLike = {
      frameAt: async (t) => ({ frame: new FakeFrame(Math.max(0, t - 200_000)), exact: false, restarted: false }),
      prefetch: async () => undefined,
      peek: () => null,
      close: () => undefined,
      onFrame: null,
      openFrames: 0,
      stats: { restarts: 0, flushes: 0 },
    };
    let now = 0;
    const r = rig(twoClips(), {
      open: async () => source({ rate: 30, frames: 300, gop: 30 }, () => lagging),
      now: () => now,
    });
    for (let k = 0; k < SLOW_PAINTS + 5; k++) {
      now += 33;
      await r.send({ type: 'engine:tick', t: ts30(k), playing: true });
    }
    expect(r.events.filter((e) => e.type === 'engine:slowSource')).toEqual([
      { type: 'engine:slowSource', id: 'src-a' },
    ]);
    // The newest frame is still shown while sound plays on.
    expect(r.comp.paints.at(-1)!.frames[0]).toBe(ts30(SLOW_PAINTS + 4) - 200_000);
  });

  it('RULE-22 a source that cannot be opened is reported once and the frame still paints', async () => {
    const r = rig(twoClips(), { open: async () => Promise.reject(new Error('codec')) });
    await r.send({ type: 'engine:seek', t: 0 });
    await r.send({ type: 'engine:seek', t: ts30(3) });
    expect(r.events.filter((e) => e.type === 'engine:sourceError')).toEqual([
      { type: 'engine:sourceError', id: 'src-a' },
    ]);
    expect(r.comp.paints.at(-1)!.frames).toEqual([null]);
  });
});

describe('ADR-0006 outcome rule 6: context loss', () => {
  it('MOD-Engine on a lost context the compositor recovers and the current frame is painted again', async () => {
    const r = rig(twoClips());
    await r.send({ type: 'engine:seek', t: ts30(15) });
    const before = r.comp.paints.length;
    r.comp.loseContext();
    await new Promise((res) => setTimeout(res, 20));
    await r.engine.settled();
    expect(r.events.map((e) => e.type)).toContain('engine:contextLost');
    expect(r.events.map((e) => e.type)).toContain('engine:contextRestored');
    expect(r.comp.paints.length).toBe(before + 1);
    expect(r.comp.paints.at(-1)!.frameIndex).toBe(15);
  });

  it('MOD-Engine when recovery fails after the retries the preview reports it', async () => {
    const r = rig(twoClips());
    await r.send({ type: 'engine:seek', t: 0 });
    r.comp.recoverOk = false;
    r.comp.loseContext();
    await new Promise((res) => setTimeout(res, 20));
    expect(r.events.map((e) => e.type)).toContain('engine:contextFailed');
  });
});

describe('MOD-Engine messages', () => {
  it('RULE-08 compare, text bitmaps and the overlay reach the paint', async () => {
    const r = rig(twoClips());
    const bitmap = { width: 10, height: 10, close: () => undefined } as unknown as ImageBitmap;
    await r.send({ type: 'engine:setTextBitmaps', bitmaps: { t1: { bitmap, s: 360 } } });
    await r.send({ type: 'engine:compare', clipId: 'a' });
    await r.send({ type: 'engine:overlay', overlay: { lines: [] } });
    const last = r.comp.paints.at(-1)!;
    expect(last.compare).toBe('a');
    expect(last.texts).toBe(1);
    expect(r.comp.overlays).toBeGreaterThan(0);
  });

  it('RULE-22 the effects check runs in the engine and answers with the measured rate', async () => {
    const r = rig(twoClips());
    r.engine.handle({ type: 'engine:effectsCheck' });
    await new Promise((res) => setTimeout(res, 1));
    expect(r.events.find((e) => e.type === 'engine:effects')).toEqual({
      type: 'engine:effects',
      ok: true,
      fps: 45,
      slow: false,
    });
  });

  it('RULE-22 the engine answers "the chain drew" before the timed result', async () => {
    const r = rig(twoClips());
    r.engine.handle({ type: 'engine:effectsCheck' });
    await new Promise((res) => setTimeout(res, 1));
    const kinds = r.events.filter((e) => e.type.startsWith('engine:effects')).map((e) => e.type);
    expect(kinds).toEqual(['engine:effectsDrawn', 'engine:effects']);
    expect(r.events.find((e) => e.type === 'engine:effectsDrawn')).toEqual({ type: 'engine:effectsDrawn', ok: true });
  });

  it('ADR-0003 release closes every decoder and frame before an export', async () => {
    const r = rig(twoClips());
    await r.send({ type: 'engine:seek', t: ts30(40) });
    const open = FakeFrame.open;
    expect(r.engine.stats().openFrames).toBeGreaterThan(0);
    const held = r.engine.stats().openFrames;
    r.engine.handle({ type: 'engine:release' });
    expect(r.engine.stats().openFrames).toBe(0);
    expect(FakeFrame.open).toBe(open - held);
  });

  it('MOD-Engine resize and looks repaint with the new state', async () => {
    const r = rig(twoClips());
    await r.send({ type: 'engine:seek', t: 0 });
    const n = r.comp.paints.length;
    await r.send({ type: 'engine:resize', width: 320, height: 180 });
    expect(r.comp.width).toBe(320);
    await r.send({ type: 'engine:looks', tables: { x: new Uint8Array(4) } });
    expect(r.comp.looks).toBe(1);
    expect(r.comp.paints.length).toBe(n + 2);
  });
});

/** A source whose slots each keep their own decode log. */
function logged(track: TrackOptions, dec: DecoderOptions, logs: DecoderLog[]): VideoSourceLike {
  return source(track, () => {
    const log: DecoderLog = { decoded: [], restarts: 0, flushes: 0 };
    logs.push(log);
    return fakeSlot(track, dec, log) as unknown as SlotLike;
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('MOD-Engine review fixes (E3)', () => {
  it('F-002.R1 changes arriving during an in-flight seek are painted, and the queued seek is not lost', async () => {
    const r = rig(twoClips(), {
      open: async () =>
        source(
          { rate: 30, frames: 300, gop: 30 },
          () => fakeSlot({ rate: 30, frames: 300, gop: 30 }, { delayMs: 10 }) as unknown as SlotLike,
        ),
    });
    await r.send({ type: 'engine:seek', t: 0 });
    r.engine.handle({ type: 'engine:seek', t: ts30(40) }); // in flight
    await sleep(2);
    r.engine.handle({ type: 'engine:seek', t: ts30(80) }); // queued
    r.engine.handle({ type: 'engine:compare', clipId: 'a' }); // arrives during the render
    await r.engine.settled();
    expect(r.comp.paints.at(-1)).toMatchObject({ frameIndex: 80, compare: 'a' });
    // Paused at the same frame, an edit during the render is still painted.
    r.engine.handle({ type: 'engine:seek', t: ts30(20) });
    await sleep(2);
    r.engine.handle({ type: 'engine:compare', clipId: null });
    await r.engine.settled();
    expect(r.comp.paints.at(-1)).toMatchObject({ frameIndex: 20, compare: null });
  });

  it('F-002.R3 a seek while playing restarts at the target keyframe (no decoding through the gap)', async () => {
    const logs: DecoderLog[] = [];
    const track = { rate: 30, frames: 900, gop: 30 };
    const r = rig(proj({ clips: [video('a', 30)] }), { open: async () => logged(track, { delayMs: 2 }, logs) });
    await r.send({ type: 'engine:tick', t: 0, playing: true });
    r.engine.handle({ type: 'engine:tick', t: ts30(1), playing: true });
    r.engine.handle({ type: 'engine:seek', t: ts30(400) });
    r.engine.handle({ type: 'engine:tick', t: ts30(400) + 1000, playing: true }); // replaces the seek, stays one
    await r.engine.settled();
    await sleep(30);
    const decoded = logs.flatMap((l) => l.decoded);
    expect(decoded.some((t) => t > ts30(60) && t < ts30(390))).toBe(false);
    expect(decoded).toContain(ts30(390));
  });

  it('MOD-Engine a cut within one source warms its own decoder and never shows the removed footage', async () => {
    const logs: DecoderLog[] = [];
    const track = { rate: 30, frames: 300, gop: 30 };
    const p = proj({ clips: [video('a', 2, { sourceId: 'src-x' }), video('b', 7, { sourceId: 'src-x' }, 5)] });
    expect(new Set(runKeys(p.clips).values()).size).toBe(2);
    const r = rig(p, { open: async () => logged(track, { delayMs: 3 }, logs) });
    for (let k = 0; k < 60; k += 2) await r.send({ type: 'engine:tick', t: ts30(k), playing: true });
    await sleep(40);
    expect(logs.length).toBe(2); // the next clip's decoder is warm before the cut
    await r.send({ type: 'engine:tick', t: ts30(60), playing: true });
    expect(r.comp.paints.at(-1)!.frames).toEqual([5 * S]);
    expect(r.shown().at(-1)!.exact).toBe(true);
    const decoded = logs.flatMap((l) => l.decoded);
    expect(decoded.some((t) => t > 2.5 * S && t < 5 * S)).toBe(false);
  });

  it('F-009 while playing, a cross-fade whose second frame is missing keeps the previous picture; paused it paints background-only', async () => {
    const p = proj({ clips: [video('a', 4, { crossFadeNext: S }), video('b', 4)] });
    const r = rig(p, {
      open: async (id) =>
        id === 'src-b' ? Promise.reject(new Error('codec')) : source({ rate: 30, frames: 300, gop: 30 }),
    });
    await r.send({ type: 'engine:tick', t: ts30(80), playing: true });
    const n = r.comp.paints.length;
    await r.send({ type: 'engine:tick', t: ts30(100), playing: true });
    expect(r.comp.paints.length).toBe(n);
    expect(r.events.some((e) => e.type === 'engine:stalled')).toBe(true);
    await r.send({ type: 'engine:seek', t: ts30(100) });
    expect(r.comp.paints.at(-1)!.frames).toEqual([ts30(100), null]);
  });

  it('ADR-0003 release during an in-flight render neither paints nor reports a source error', async () => {
    const r = rig(twoClips(), {
      open: async () =>
        source(
          { rate: 30, frames: 300, gop: 30 },
          () => fakeSlot({ rate: 30, frames: 300, gop: 30 }, { delayMs: 30 }) as unknown as SlotLike,
        ),
    });
    await r.send({ type: 'engine:seek', t: 0 });
    const n = r.comp.paints.length;
    r.engine.handle({ type: 'engine:seek', t: ts30(50) });
    await sleep(5);
    r.engine.handle({ type: 'engine:release' });
    await r.engine.settled();
    await sleep(60);
    expect(r.events.some((e) => e.type === 'engine:sourceError')).toBe(false);
    expect(r.comp.paints.length).toBe(n);
  });

  it('RULE-22 one transient decoder error does not refuse the source; repeated failures do', async () => {
    const track = { rate: 30, frames: 300, gop: 30 };
    const once = rig(twoClips(), {
      open: async () => source(track, () => fakeSlot(track, { failDecoders: 1 }) as unknown as SlotLike),
    });
    await once.send({ type: 'engine:seek', t: ts30(12) });
    expect(once.events.some((e) => e.type === 'engine:sourceError')).toBe(false);
    expect(once.shown().at(-1)).toMatchObject({ frameIndex: 12, exact: true });
    const always = rig(twoClips(), {
      open: async () => source(track, () => fakeSlot(track, { failDecoders: 9 }) as unknown as SlotLike),
    });
    await always.send({ type: 'engine:seek', t: ts30(12) });
    expect(always.events.filter((e) => e.type === 'engine:sourceError')).toEqual([
      { type: 'engine:sourceError', id: 'src-a' },
    ]);
  });

  it('MOD-Engine a coarse copy finishing after its source was removed is closed', async () => {
    let made = 0;
    let closed = 0;
    const r = rig(twoClips(), {
      open: async () => source({ rate: 30, frames: 300, gop: 300 }),
      coarseCopy: async () => {
        made++;
        await sleep(40);
        return { width: 1, height: 1, close: () => closed++ };
      },
    });
    r.engine.handle({ type: 'engine:seek', t: ts30(50) });
    await sleep(5);
    r.engine.handle({ type: 'engine:media', media: [] }); // copies still in progress
    await r.engine.settled();
    await sleep(80);
    expect(made).toBeGreaterThan(0);
    expect(closed).toBe(made);
  });
});
