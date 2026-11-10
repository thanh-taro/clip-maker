// MOD-App `main()` (specs/40-technical/modules/MOD-App.md): boots after the inline script. Resolves the
// starting language (the same result the boot script put on <html lang>), runs the RULE-22 start-up
// check (F-023, ./device.ts), then renders SCR-Editor or SCR-Unsupported. MOD-Host starts the host
// contract (one ready signal) before the check, and every typeface loads after the first render
// (ADR-0012 §2). The workers start only when the device passed the codec part of the check; the engine
// worker's "the effect chain drew" answer then lets media in, or turns the screen unsupported and stops
// every worker. The timed effects result only shows the slow-device notice.
import { render } from 'preact';
import { embedded, initHost, loadFonts, registerOffline, resolveLanguage, setLanguage } from '../host';
import { browserDevice, device, finishCheck, openingCheck, type DeviceDeps } from './device';
import { Shell } from './Shell';
import { Unsupported } from './Unsupported';
import { preloadWorklet, startWorkers, stopWorkers, workers } from './workers';

/** The product name stays as written in every language (copy.md rules). */
const TITLE = 'Clip Maker';

/** Performance marks around the start-up check (F-023.R4, NFR-02 measurement). */
export const MARK_START = 'tk-device-check-start';
export const MARK_DONE = 'tk-device-checked';
/** The timed effects result has arrived (or timed out): the slow-device notice is decided. */
export const MARK_TIMED = 'tk-effects-timed';

export interface MainOptions {
  /** The device to check; the browser's by default. Test pages pass fakes (adapters/tests.md). */
  readonly device?: DeviceDeps;
}

function App({ remember }: { remember: (el: HTMLElement | null) => void }) {
  const d = device.value;
  return d.status === 'unsupported' ? (
    <Unsupported missing={d.missing} headingRef={remember} />
  ) : (
    <Shell addRef={remember} />
  );
}

export async function main(options: MainOptions = {}): Promise<void> {
  const address = (() => {
    try {
      return new URLSearchParams(location.search).get('lang');
    } catch {
      return null;
    }
  })();
  // Implements: F-022.R1/R3 — RULE-18's address → browser → en-US, before anything renders, and the
  // page marked with it (even if the boot script did not run). Host messages switch it later (MOD-Host).
  setLanguage(resolveLanguage(address, navigator.languages ?? [navigator.language]));
  document.title = TITLE;

  // Implements: F-023.R1/R4 — the check runs before anything can be added and makes no request.
  let first: HTMLElement | null = null;
  const remember = (el: HTMLElement | null) => {
    first = el;
  };
  // The host contract starts before the check awaits anything, so its first-focus listener is never
  // missed and the ready signal never waits on the device (F-019.R6, RULE-17).
  initHost(() => first);

  // Implements: F-023.R1/R4 — the check runs before anything can be added and makes no request.
  performance.mark(MARK_START);
  const deps = options.device ?? browserDevice(() => workers.get('engine'));
  const opening = await openingCheck(deps);

  const root = document.getElementById('app');
  if (root) render(<App remember={remember} />, root);

  if (opening.status === 'drawing-check') {
    startWorkers();
    preloadWorklet();
  }
  registerOffline();
  void loadFonts();

  // Focus after a render. Standalone, SCR-Unsupported's heading is focused on load. Embedded, focus waits
  // for the host (F-019.R6); if the host already moved focus into the tool before this render (it may,
  // right after the ready signal), the first control or heading takes it now, as MOD-Host would have.
  const focusAfterRender = () => {
    const free = document.hasFocus() && document.activeElement === document.body;
    const unsupported = device.peek().status === 'unsupported';
    if ((!embedded.peek() && unsupported) || (embedded.peek() && free)) first?.focus();
  };
  focusAfterRender();

  const { status, timed } = await finishCheck(deps);
  void timed.then(() => performance.mark(MARK_TIMED));
  if (status.status === 'unsupported' && opening.status === 'drawing-check') {
    // RULE-22: the effect chain can't be drawn — no media, so no workers and no scratch session.
    stopWorkers();
    await new Promise((r) => setTimeout(r, 0)); // the screen re-renders on the next task
    focusAfterRender();
  }
  performance.mark(MARK_DONE);
}
