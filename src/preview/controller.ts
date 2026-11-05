// MOD-Preview — the main-thread preview controller the UI binds to (F-002 builds the screen): it owns
// the preview element's canvas, transfers it to the engine worker once, sizes it (CSS size × device
// pixel ratio, shorter side ≤ 1080), and drives frame ticks from the audio clock — the picture follows
// the sound (ADR-0003 §3, ADR-0008 §5). Play/pause/seek/scrub/step, the current time, the play state
// and the slow-device signal are exposed as signals.
// Implements: F-002.R1 (the preview surface), F-002.R2 (play from the playhead with sound, stop at the
// end; pause keeps the playhead), F-002.R3 (scrub → seeks, latest wins), F-002.R4 (step, start, end),
// F-002 edge cases (play at the end starts from 0; frames are skipped to keep sound in sync), RULE-22
// (slow device signal), NFR-03.
import { computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import {
  frameAspect,
  projectEnd,
  type EngineStats,
  type FromEngine,
  type Micros,
  type Project,
  type ToEngine,
} from '../core';
import { clampTime, pausedAt, playFrom, previewSize, stepTime } from './timing';

/** The master clock (MOD-Audio `Playback` satisfies it): project time being heard now. */
export interface PreviewClock {
  /** Starts sound from `from`; call inside the user's gesture (iOS starts audio only there). */
  play(from: Micros): Promise<void>;
  pause(): void;
  seek(t: Micros): void;
  now(): Micros;
}

/** The engine worker as the preview uses it. */
export interface EnginePort {
  postMessage(m: ToEngine, transfer?: Transferable[]): void;
  addEventListener(type: 'message', fn: (e: MessageEvent<FromEngine>) => void): void;
  removeEventListener(type: 'message', fn: (e: MessageEvent<FromEngine>) => void): void;
}

/** Browser services, injected so the controller is tested without a DOM. */
export interface PreviewEnv {
  requestFrame(fn: () => void): number;
  cancelFrame(id: number): void;
  devicePixelRatio(): number;
  /** Calls back with the element's CSS content size now and whenever it changes; returns a stop function. */
  observeSize(element: HTMLElement, fn: (width: number, height: number) => void): () => void;
  /** The element's canvas (created when missing), handed to the engine once. */
  canvasOf(element: HTMLElement): HTMLCanvasElement;
}

export function browserPreviewEnv(): PreviewEnv {
  return {
    requestFrame: (fn) => requestAnimationFrame(fn),
    cancelFrame: (id) => cancelAnimationFrame(id),
    devicePixelRatio: () => window.devicePixelRatio || 1,
    observeSize(element, fn) {
      const ro = new ResizeObserver(([entry]) => {
        const box = entry?.contentRect;
        if (box) fn(box.width, box.height);
      });
      ro.observe(element);
      const r = element.getBoundingClientRect();
      fn(r.width, r.height);
      return () => ro.disconnect();
    },
    canvasOf(element) {
      const found = element.querySelector('canvas');
      if (found) return found;
      const c = document.createElement('canvas');
      element.append(c);
      return c;
    },
  };
}

export type PlayState = 'paused' | 'playing';

export interface PreviewSignals {
  readonly project: ReadonlySignal<Project>;
}

export interface PreviewController {
  /** The playhead (µs): the clock while playing, the paused or sought time otherwise. */
  readonly time: ReadonlySignal<Micros>;
  readonly state: ReadonlySignal<PlayState>;
  /** The project end (µs). */
  readonly duration: ReadonlySignal<Micros>;
  /** RULE-22: effects too slow or a source decoding slower than real time (COPY-notice.slow_device). */
  readonly slowDevice: ReadonlySignal<boolean>;
  /** The last frame the engine put on screen. */
  readonly shown: ReadonlySignal<{ readonly t: Micros; readonly frameIndex: number; readonly exact: boolean } | null>;
  /** True while playback waits for a picture (cleared by the next exact frame). */
  readonly stalled: ReadonlySignal<boolean>;
  /** The preview's WebGL context was lost and could not be recovered. */
  readonly failed: ReadonlySignal<boolean>;
  play(): void;
  pause(): void;
  toggle(): void;
  /** Move the playhead (click, drag, scrub); while playing, play continues from there. */
  seek(t: Micros): void;
  /** n frames back (negative) or forward. */
  step(n: number): void;
  toStart(): void;
  toEnd(): void;
  /** RULE-08 compare hold on a clip (null releases it). */
  setCompare(clipId: string | null): void;
  /** Engine statistics (NFR-03 measurement and tests). */
  stats(): Promise<EngineStats>;
  dispose(): void;
}

export interface PreviewDeps {
  readonly engine: EnginePort;
  readonly clock: PreviewClock;
  readonly env?: PreviewEnv;
}

/** Implements: MOD-Preview `mountPreview(element, signals)`. */
export function mountPreview(element: HTMLElement, signals: PreviewSignals, deps: PreviewDeps): PreviewController {
  const env = deps.env ?? browserPreviewEnv();
  const { engine, clock } = deps;
  const time = signal<Micros>(0);
  const state = signal<PlayState>('paused');
  const slowDevice = signal(false);
  const shown = signal<{ t: Micros; frameIndex: number; exact: boolean } | null>(null);
  const stalled = signal(false);
  const failed = signal(false);
  const duration = computed(() => projectEnd(signals.project.value));
  const statsWaiters: ((s: EngineStats) => void)[] = [];
  let frameId: number | null = null;

  const onMessage = (e: MessageEvent<FromEngine>): void => {
    const m = e.data;
    switch (m.type) {
      case 'engine:frameShown':
        shown.value = { t: m.t, frameIndex: m.frameIndex, exact: m.exact };
        if (m.exact) stalled.value = false;
        return;
      case 'engine:stalled':
        stalled.value = true;
        return;
      case 'engine:slowSource':
        slowDevice.value = true;
        return;
      case 'engine:effects':
        if (!m.ok || m.slow) slowDevice.value = true;
        return;
      case 'engine:contextFailed':
        failed.value = true;
        return;
      case 'engine:contextRestored':
        failed.value = false;
        return;
      case 'engine:stats':
        for (const w of statsWaiters.splice(0)) w(m.stats);
        return;
      default:
        return;
    }
  };
  engine.addEventListener('message', onMessage);

  // The canvas goes to the engine worker once (ADR-0003 §2), at the element's size.
  const canvas = env.canvasOf(element);
  let box = { width: 1, height: 1 };
  let lastSize = '';
  const sizeFor = (): ReturnType<typeof previewSize> =>
    previewSize(box.width, box.height, env.devicePixelRatio(), frameAspect(signals.project.value));
  const applySize = (): void => {
    if (!lastSize) return; // not transferred yet
    const s = sizeFor();
    canvas.style.width = `${s.cssWidth}px`;
    canvas.style.height = `${s.cssHeight}px`;
    const key = `${s.width}x${s.height}`;
    if (key === lastSize) return;
    lastSize = key;
    engine.postMessage({ type: 'engine:resize', width: s.width, height: s.height });
  };
  const stopObserving = env.observeSize(element, (width, height) => {
    box = { width, height };
    applySize();
  });
  const first = sizeFor();
  const offscreen = canvas.transferControlToOffscreen();
  engine.postMessage({ type: 'engine:canvas', canvas: offscreen, width: first.width, height: first.height }, [
    offscreen,
  ]);
  lastSize = `${first.width}x${first.height}`;
  canvas.style.width = `${first.cssWidth}px`;
  canvas.style.height = `${first.cssHeight}px`;

  // Every project change reaches the engine; a shorter project pulls the playhead in.
  const stopProject = effect(() => {
    const project = signals.project.value;
    engine.postMessage({ type: 'engine:setProject', project });
    applySize();
    const end = projectEnd(project);
    if (time.peek() > end) seekTo(end);
  });

  function stopLoop(): void {
    if (frameId !== null) env.cancelFrame(frameId);
    frameId = null;
  }

  // While playing: one tick per display frame, at the time being heard (the picture follows the sound).
  function loop(): void {
    frameId = null;
    if (state.peek() !== 'playing') return;
    const end = duration.peek();
    const t = clock.now();
    if (t >= end) {
      // F-002.R2: playback stops at the project end.
      clock.pause();
      state.value = 'paused';
      time.value = end;
      engine.postMessage({ type: 'engine:seek', t: end });
      return;
    }
    time.value = t;
    engine.postMessage({ type: 'engine:tick', t, playing: true });
    frameId = env.requestFrame(loop);
  }

  function seekTo(t: Micros): void {
    const at = clampTime(t, duration.peek());
    time.value = at;
    if (state.peek() === 'playing') clock.seek(at);
    engine.postMessage({ type: 'engine:seek', t: at });
  }

  const controller: PreviewController = {
    time,
    state,
    duration,
    slowDevice,
    shown,
    stalled,
    failed,
    play() {
      if (state.peek() === 'playing') return;
      const from = playFrom(time.peek(), duration.peek());
      if (duration.peek() <= 0) return;
      time.value = from;
      state.value = 'playing';
      void clock.play(from); // inside the caller's gesture (Playback.unlock runs synchronously)
      stopLoop();
      frameId = env.requestFrame(loop);
    },
    pause() {
      if (state.peek() !== 'playing') return;
      stopLoop();
      clock.pause();
      state.value = 'paused';
      const rate = signals.project.peek().frame.frameRate;
      const at = pausedAt(clock.now(), rate, duration.peek());
      time.value = at;
      engine.postMessage({ type: 'engine:seek', t: at });
    },
    toggle() {
      if (state.peek() === 'playing') controller.pause();
      else controller.play();
    },
    seek: seekTo,
    step(n) {
      const rate = signals.project.peek().frame.frameRate;
      seekTo(stepTime(time.peek(), n, rate, duration.peek()));
    },
    toStart: () => seekTo(0),
    toEnd: () => seekTo(duration.peek()),
    setCompare(clipId) {
      engine.postMessage({ type: 'engine:compare', clipId });
    },
    stats() {
      return new Promise((resolve) => {
        statsWaiters.push(resolve);
        engine.postMessage({ type: 'engine:stats' });
      });
    },
    dispose() {
      stopLoop();
      if (state.peek() === 'playing') clock.pause();
      state.value = 'paused';
      stopProject();
      stopObserving();
      engine.removeEventListener('message', onMessage);
    },
  };
  return controller;
}
