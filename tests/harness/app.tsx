// App harness (test-only, tests/harness/app.html; adapters/tests.md "Device support"): boots the real
// MOD-App `main()` and workers with the browser's device, except the engine worker's effects check,
// which the address can replace (a worker's globals can't be changed from a test):
//   ?effects=fast     the chain draws and is fast enough (no slow-device notice; F-001 tests)
//   ?effects=slow     the chain draws, then the timed result is below 30 fps (F-023.AC6)
//   ?effects=fail     the effect chain cannot be drawn (RULE-22 missing_effects after the codec probe)
//   ?effects=pending  no answer (and no timeout) until the test calls `window.appHarness.draw()`
//   ?gate=N           (F-001.R6) the analysis worker gets the first N probe requests; later ones are held
//                     until `window.appHarness.release()`, so a test can watch a file being checked
// `window.appHarness.project()` reads the session's project (the timeline view is F-003) and `undo()`
// takes one RULE-13 step back (the Undo button is F-014).
// The codec interfaces and WebGL2 are tested on the production build instead, by changing them on the
// page before it loads (the presence check and the codec probe run on the main thread).
import '../../src/app/styles/index.css';
import { queued } from '../../src/app/adding';
import { main } from '../../src/app/app';
import { browserDevice, type DeviceDeps, type EffectsRun } from '../../src/app/device';
import { workers } from '../../src/app/workers';
import { layoutOf } from '../../src/core';
import { history, playhead, project, undo } from '../../src/project';

/** The session's project as a test reads it (times in seconds). */
export interface ProjectSummary {
  readonly sources: readonly { readonly name: string; readonly kind: string }[];
  readonly clips: readonly { readonly source: string; readonly start: number }[];
  readonly audio: readonly { readonly source: string; readonly start: number; readonly end: number }[];
  readonly steps: number;
}

declare global {
  interface Window {
    appHarness: {
      draw(): void;
      workers(): number;
      project(): ProjectSummary;
      undo(): void;
      setPlayhead(seconds: number): void;
      release(): void;
      queued(): number;
    };
  }
}

const params = new URLSearchParams(location.search);
const effects = params.get('effects');
const real = browserDevice(() => workers.get('engine'));
let draw: () => void = () => undefined;

// ?gate=N — hold probe requests after the first N (F-001.AC8: the second file stays "being checked").
const held: (() => void)[] = [];
const gate = Number(params.get('gate') ?? NaN);
if (Number.isInteger(gate)) {
  const post = Worker.prototype.postMessage as (this: Worker, ...args: unknown[]) => void;
  let probes = 0;
  Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
    if ((args[0] as { type?: string } | null)?.type === 'probe' && ++probes > gate) {
      held.push(() => post.apply(this, args));
      return;
    }
    post.apply(this, args);
  } as Worker['postMessage'];
}

const S = 1_000_000;
function summary(): ProjectSummary {
  const p = project.value;
  const name = (id: string) => p.sources.find((s) => s.id === id)?.name ?? id;
  const spans = layoutOf(p).spans;
  return {
    sources: p.sources.map((s) => ({ name: s.name, kind: s.kind })),
    clips: p.clips.map((c, i) => ({
      source: name(c.sourceId),
      start: Math.round((spans[i]!.startFrame / p.frame.frameRate) * 1000) / 1000,
    })),
    audio: p.audioClips.map((a) => ({
      source: name(a.sourceId),
      start: a.start / S,
      end: (a.start + a.out - a.in) / S,
    })),
    steps: history.value.past.length,
  };
}

window.appHarness = {
  draw: () => draw(),
  workers: () => workers.size,
  project: summary,
  undo,
  setPlayhead: (seconds) => (playhead.value = Math.round(seconds * S)),
  release: () => held.splice(0).forEach((f) => f()),
  queued: () => queued.value,
};

const fixed = (ok: boolean, slow: boolean): EffectsRun => ({
  drawn: Promise.resolve(ok),
  timed: Promise.resolve({ slow }),
});

const device: DeviceDeps = {
  ...real,
  ...(effects === 'pending' ? { timeouts: { drawnMs: 600_000, timedMs: 600_000 } } : {}),
  effects: () => {
    if (effects === 'fast') return fixed(true, false);
    if (effects === 'slow') return fixed(true, true);
    if (effects === 'fail') return fixed(false, false);
    if (effects === 'pending') {
      return {
        drawn: new Promise<boolean>((r) => (draw = () => r(true))),
        timed: new Promise(() => undefined),
      };
    }
    return real.effects();
  },
};

void main({ device });
