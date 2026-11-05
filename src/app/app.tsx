// MOD-App `main()` (specs/40-technical/modules/MOD-App.md): boots after the inline script. Resolves the
// starting language (the same result the boot script put on <html lang>), runs the RULE-22 start-up
// check (F-023, ./device.ts), then renders SCR-Editor or SCR-Unsupported. After the first render
// MOD-Host starts the host contract (one ready signal) and loads every typeface (ADR-0012 §2); the
// workers start only when the device passed the codec part of the check, and the engine worker then
// runs the timed effects check before any media is accepted.
import { render } from 'preact';
import { language } from '../copy';
import { embedded, initHost, loadFonts, registerOffline, resolveLanguage } from '../host';
import { browserDevice, device, finishCheck, openingCheck, type DeviceDeps } from './device';
import { Shell } from './Shell';
import { Unsupported } from './Unsupported';
import { preloadWorklet, startWorkers, workers } from './workers';

/** The product name stays as written in every language (copy.md rules). */
const TITLE = 'Clip Maker';

/** Performance marks around the start-up check (F-023.R4, NFR-02 measurement). */
export const MARK_START = 'tk-device-check-start';
export const MARK_DONE = 'tk-device-checked';

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
  language.value = resolveLanguage(address, navigator.languages ?? [navigator.language]);
  // Implements: F-022.R1 (mark the page language even if the boot script did not run).
  document.documentElement.lang = language.value;
  document.title = TITLE;

  // Implements: F-023.R1/R4 — the check runs before anything can be added and makes no request.
  performance.mark(MARK_START);
  const deps = options.device ?? browserDevice(() => workers.get('engine'));
  const opening = await openingCheck(deps);

  let first: HTMLElement | null = null;
  const remember = (el: HTMLElement | null) => {
    first = el;
  };
  const root = document.getElementById('app');
  if (root) render(<App remember={remember} />, root);

  if (opening.status === 'drawing-check') {
    startWorkers();
    preloadWorklet();
  }
  initHost(() => first);
  registerOffline();
  void loadFonts();

  // SCR-Unsupported: the heading is focused on load. Embedded, focus waits for the host (F-019.R6).
  const focusHeading = () => {
    if (!embedded.peek() && device.peek().status === 'unsupported') first?.focus();
  };
  focusHeading();

  await finishCheck(deps);
  focusHeading();
  performance.mark(MARK_DONE);
}
