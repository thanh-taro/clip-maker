// App harness (test-only, tests/harness/app.html; adapters/tests.md "Device support"): boots the real
// MOD-App `main()` and workers with the browser's device, except the engine worker's effects check,
// which the address can replace (a worker's globals can't be changed from a test):
//   ?effects=slow     the chain draws, then the timed result is below 30 fps (F-023.AC6)
//   ?effects=fail     the effect chain cannot be drawn (RULE-22 missing_effects after the codec probe)
//   ?effects=pending  no answer (and no timeout) until the test calls `window.appHarness.draw()`
// The codec interfaces and WebGL2 are tested on the production build instead, by changing them on the
// page before it loads (the presence check and the codec probe run on the main thread).
import '../../src/app/styles/index.css';
import { main } from '../../src/app/app';
import { browserDevice, type DeviceDeps, type EffectsRun } from '../../src/app/device';
import { workers } from '../../src/app/workers';

declare global {
  interface Window {
    appHarness: { draw(): void; workers(): number };
  }
}

const effects = new URLSearchParams(location.search).get('effects');
const real = browserDevice(() => workers.get('engine'));
let draw: () => void = () => undefined;
window.appHarness = { draw: () => draw(), workers: () => workers.size };

const fixed = (ok: boolean, slow: boolean): EffectsRun => ({
  drawn: Promise.resolve(ok),
  timed: Promise.resolve({ slow }),
});

const device: DeviceDeps = {
  ...real,
  ...(effects === 'pending' ? { timeouts: { drawnMs: 600_000, timedMs: 600_000 } } : {}),
  effects: () => {
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
