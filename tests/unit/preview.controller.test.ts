// MOD-Preview controller with a fake engine port, clock and browser services: the canvas goes to the
// engine once at a capped size, ticks follow the clock while playing (the picture follows the sound),
// play stops at the end, pause keeps the playhead, step/start/end, slow-device signal (RULE-22).
import { signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import type { FromEngine, Micros, Project, ToEngine } from '../../src/core';
import { mountPreview, previewSize, stepTime, playFrom, pausedAt, type PreviewEnv } from '../../src/preview';
import { proj, S, video } from '../support/project';

class FakeClock {
  t: Micros = 0;
  playing = false;
  failPlay = false;
  calls: string[] = [];
  onInterrupted: (() => void) | null = null;
  async play(from: Micros): Promise<void> {
    this.calls.push(`play ${from}`);
    if (this.failPlay) throw new Error('audio could not start');
    this.t = from;
    this.playing = true;
  }
  pause(): void {
    this.calls.push('pause');
    this.playing = false;
  }
  seek(t: Micros): void {
    this.calls.push(`seek ${t}`);
    this.t = t;
  }
  now(): Micros {
    return this.t;
  }
}

function setup(project: Project = proj({ clips: [video('a', 4)] })) {
  const sent: { m: ToEngine; transfer?: Transferable[] }[] = [];
  let listener: ((e: MessageEvent<FromEngine>) => void) | null = null;
  const engine = {
    postMessage: (m: ToEngine, transfer?: Transferable[]) => sent.push(transfer ? { m, transfer } : { m }),
    addEventListener: (_: 'message', fn: (e: MessageEvent<FromEngine>) => void) => {
      listener = fn;
    },
    removeEventListener: () => {
      listener = null;
    },
  };
  const frames: (() => void)[] = [];
  let sizeCb: ((w: number, h: number) => void) | null = null;
  const offscreen = { offscreen: true };
  let transfers = 0;
  // A canvas can be handed over once; a removed one is replaced by a fresh one (as `canvasOf` does).
  const makeCanvas = () => {
    let done = false;
    const c = {
      removed: false,
      style: {} as Record<string, string>,
      transferControlToOffscreen: () => {
        if (done) throw new Error('InvalidStateError: already transferred');
        done = true;
        transfers++;
        return offscreen;
      },
      remove: () => {
        c.removed = true;
      },
    };
    return c;
  };
  let canvas = makeCanvas();
  const env: PreviewEnv = {
    requestFrame: (fn) => frames.push(fn),
    cancelFrame: () => undefined,
    devicePixelRatio: () => 2,
    observeSize: (_el, fn) => {
      sizeCb = fn;
      fn(800, 450);
      return () => undefined;
    },
    canvasOf: () => {
      if (canvas.removed) canvas = makeCanvas();
      return canvas as unknown as HTMLCanvasElement;
    },
  };
  const clock = new FakeClock();
  const project$ = signal(project);
  const element = {} as HTMLElement;
  const ctl = mountPreview(element, { project: project$ }, { engine, clock, env });
  return {
    ctl,
    remount: () => mountPreview(element, { project: project$ }, { engine, clock, env }),
    clock,
    sent,
    project$,
    get canvas() {
      return canvas;
    },
    transfers: () => transfers,
    resize: (w: number, h: number) => sizeCb?.(w, h),
    emit: (m: FromEngine) => listener?.({ data: m } as MessageEvent<FromEngine>),
    /** Runs the pending animation frames once. */
    frame: () => frames.splice(0).forEach((f) => f()),
    of: <T extends ToEngine['type']>(type: T) =>
      sent.filter((s) => s.m.type === type).map((s) => s.m as Extract<ToEngine, { type: T }>),
  };
}

describe('MOD-Preview surface', () => {
  it('F-002.R1 the canvas is transferred to the engine once, at CSS size × DPR with the shorter side ≤ 1080', () => {
    const r = setup();
    expect(r.transfers()).toBe(1);
    const c = r.of('engine:canvas');
    expect(c).toHaveLength(1);
    expect([c[0]!.width, c[0]!.height]).toEqual([1600, 900]);
    expect(r.sent.find((s) => s.m.type === 'engine:canvas')!.transfer).toHaveLength(1);
    r.resize(1600, 900);
    expect(r.of('engine:resize').at(-1)).toEqual({ type: 'engine:resize', width: 1920, height: 1080 });
    expect(r.canvas.style['width']).toBe('1600px');
  });

  it('F-002.R1 every project change is sent to the engine', () => {
    const r = setup();
    r.project$.value = proj({ clips: [video('a', 4), video('b', 2)] });
    expect(r.of('engine:setProject')).toHaveLength(2);
  });
});

describe('MOD-Preview playback (F-002.R2)', () => {
  it('F-002.R2 play starts the sound clock at the playhead and ticks follow the clock', () => {
    const r = setup();
    r.ctl.seek(S);
    r.ctl.play();
    expect(r.clock.calls).toContain(`play ${S}`);
    expect(r.ctl.state.value).toBe('playing');
    r.clock.t = S + 400_000;
    r.frame();
    expect(r.of('engine:tick').at(-1)).toEqual({ type: 'engine:tick', t: S + 400_000, playing: true });
    expect(r.ctl.time.value).toBe(S + 400_000);
  });

  it('F-002.R2 playback stops at the project end with the playhead at the end', () => {
    const r = setup();
    r.ctl.play();
    r.clock.t = 4 * S + 10;
    r.frame();
    expect(r.ctl.state.value).toBe('paused');
    expect(r.ctl.time.value).toBe(4 * S);
    expect(r.clock.calls).toContain('pause');
  });

  it('F-002.AC3 pause keeps the playhead on the paused frame (the start of the frame shown)', () => {
    const r = setup();
    r.ctl.play();
    r.clock.t = 1_234_567;
    r.frame();
    r.ctl.pause();
    expect(r.ctl.state.value).toBe('paused');
    expect(r.ctl.time.value).toBe(pausedAt(1_234_567, 30, 4 * S));
    expect(r.of('engine:seek').at(-1)!.t).toBe(r.ctl.time.value);
  });

  it('F-002 play at the project end starts from 0', () => {
    const r = setup();
    r.ctl.toEnd();
    r.ctl.play();
    expect(r.clock.calls).toContain('play 0');
  });

  it('F-002.R3 seeking while playing moves the sound clock; while paused it asks the engine for the frame', () => {
    const r = setup();
    r.ctl.seek(2 * S);
    expect(r.of('engine:seek').at(-1)!.t).toBe(2 * S);
    r.ctl.play();
    r.ctl.seek(3 * S);
    expect(r.clock.calls).toContain(`seek ${3 * S}`);
    r.ctl.seek(99 * S);
    expect(r.ctl.time.value).toBe(4 * S);
  });

  it('F-002.R4 step moves one frame; start and end jump', () => {
    const r = setup();
    r.ctl.seek(2 * S);
    r.ctl.step(1);
    expect(r.ctl.time.value).toBe(2 * S + 33_333);
    r.ctl.step(-2);
    expect(r.ctl.time.value).toBe(2 * S - 33_334);
    r.ctl.toEnd();
    expect(r.ctl.time.value).toBe(4 * S);
    r.ctl.toStart();
    expect(r.ctl.time.value).toBe(0);
  });

  it('RULE-22 a slow source or slow effects raise the slow-device signal', () => {
    const r = setup();
    expect(r.ctl.slowDevice.value).toBe(false);
    r.emit({ type: 'engine:slowSource', id: 'src-a' });
    expect(r.ctl.slowDevice.value).toBe(true);
    const s = setup();
    s.emit({ type: 'engine:effects', ok: true, fps: 20, slow: true });
    expect(s.ctl.slowDevice.value).toBe(true);
  });

  it('MOD-Preview frames shown, stalls and context failure are signalled', () => {
    const r = setup();
    r.emit({ type: 'engine:stalled', t: 0 });
    expect(r.ctl.stalled.value).toBe(true);
    r.emit({ type: 'engine:frameShown', t: 0, frameIndex: 0, exact: true });
    expect(r.ctl.stalled.value).toBe(false);
    expect(r.ctl.shown.value).toEqual({ t: 0, frameIndex: 0, exact: true });
    r.emit({ type: 'engine:contextFailed' });
    expect(r.ctl.failed.value).toBe(true);
  });

  it('RULE-08 the compare hold is sent to the engine', () => {
    const r = setup();
    r.ctl.setCompare('a');
    r.ctl.setCompare(null);
    expect(r.of('engine:compare').map((m) => m.clipId)).toEqual(['a', null]);
  });

  it('MOD-Preview a shorter project pulls the playhead in', () => {
    const r = setup();
    r.ctl.seek(3 * S);
    r.project$.value = proj({ clips: [video('a', 2)] });
    expect(r.ctl.time.value).toBe(2 * S);
  });
});

describe('MOD-Preview timing maths', () => {
  it('F-002.R1 the preview size fits the frame aspect in the element, capped at 1080 on the shorter side', () => {
    expect(previewSize(800, 800, 1, 16 / 9)).toMatchObject({ width: 800, height: 450 });
    expect(previewSize(400, 800, 3, 9 / 16)).toMatchObject({ width: 1080, height: 1920 });
    expect(previewSize(100, 100, 1, 1)).toMatchObject({ width: 100, height: 100, cssWidth: 100 });
  });

  it('F-002.R4 steps land on frame starts and stop at 0 and at the end', () => {
    expect(stepTime(2 * S, 1, 30, 10 * S)).toBe(2 * S + 33_333);
    expect(stepTime(0, -1, 30, 10 * S)).toBe(0);
    expect(stepTime(10 * S, 1, 30, 10 * S)).toBe(10 * S);
    expect(stepTime(2 * S + 10, 1, 25, 10 * S)).toBe(2 * S + 40_000);
  });

  it('F-002 play from the end starts at 0; elsewhere at the playhead', () => {
    expect(playFrom(5 * S, 5 * S)).toBe(0);
    expect(playFrom(2 * S, 5 * S)).toBe(2 * S);
  });
});

describe('MOD-Preview lifecycle and clock failures (E3 review)', () => {
  it('MOD-Preview after dispose the transferred canvas is removed, so mounting again works with a fresh one', () => {
    const r = setup();
    const first = r.canvas;
    r.ctl.dispose();
    expect(first.removed).toBe(true);
    const again = r.remount();
    expect(r.transfers()).toBe(2);
    expect(r.canvas).not.toBe(first);
    again.dispose();
  });

  it('F-002.R2 when the sound cannot start, playback returns to paused', async () => {
    const r = setup();
    r.clock.failPlay = true;
    r.ctl.play();
    await new Promise((res) => setTimeout(res, 0));
    expect(r.ctl.state.value).toBe('paused');
    expect(r.of('engine:seek').length).toBeGreaterThan(0);
  });

  it('F-002 a system interruption of the sound pauses playback (Play resumes it)', () => {
    const r = setup();
    r.ctl.play();
    r.clock.t = 1_500_000;
    r.clock.onInterrupted?.();
    expect(r.ctl.state.value).toBe('paused');
    expect(r.ctl.time.value).toBe(1_500_000);
    r.ctl.play();
    expect(r.ctl.state.value).toBe('playing');
  });
});
