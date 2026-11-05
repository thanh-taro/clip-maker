// App harness (test-only, tests/harness/app.html; adapters/tests.md "Device support"): boots the real
// MOD-App `main()` and workers with the browser's device, except the timed effects check of the engine
// worker, which the address can replace (a worker's globals can't be changed from the test):
//   ?effects=slow   the effect chain draws, but below 30 fps (F-023.AC6)
//   ?effects=fail   the effect chain cannot be drawn (RULE-22 missing_effects after the codec probe)
// The codec interfaces and WebGL2 are tested on the production build instead, by changing them on the
// page before it loads (the presence check and the codec probe run on the main thread).
import '../../src/app/styles/index.css';
import { main } from '../../src/app/app';
import { browserDevice, type DeviceDeps } from '../../src/app/device';
import { workers } from '../../src/app/workers';

const effects = new URLSearchParams(location.search).get('effects');
const real = browserDevice(() => workers.get('engine'));

const device: DeviceDeps = {
  ...real,
  effects: async () => {
    if (effects === 'slow') return { ok: true, slow: true };
    if (effects === 'fail') return { ok: false, slow: false };
    return real.effects();
  },
};

void main({ device });
