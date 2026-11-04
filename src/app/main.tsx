// MOD-App entry (specs/40-technical/modules/MOD-App.md): `main()` boots after the inline script.
// Resolves the starting language (the same result the boot script put on <html lang>), runs the
// RULE-22 device check (scaffold: API presence, MOD-Codec), then renders SCR-Editor or
// SCR-Unsupported. After the first render MOD-Host starts the host contract (one ready signal) and
// loads every typeface (ADR-0012 §2); the workers start only when the device is supported.
import { render } from 'preact';
import './styles/index.css';
import { language } from '../copy';
import { detectFeatures, missingCapabilities } from '../codec';
import { initHost, loadFonts, registerOffline, resolveLanguage } from '../host';
import { Shell } from './Shell';
import { Unsupported } from './Unsupported';
import { preloadWorklet, startWorkers } from './workers';

/** The product name stays as written in every language (copy.md rules). */
const TITLE = 'Clip Maker';

export function main(): void {
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

  // Implements: F-023.R1 (scaffold) — a failed check shows what is missing and accepts no media.
  const missing = missingCapabilities(detectFeatures());
  let first: HTMLElement | null = null;
  const remember = (el: HTMLElement | null) => {
    first = el;
  };
  const root = document.getElementById('app');
  if (root) {
    render(
      missing.length ? <Unsupported missing={missing} headingRef={remember} /> : <Shell addRef={remember} />,
      root,
    );
  }
  if (!missing.length) {
    startWorkers();
    preloadWorklet();
  }
  initHost(() => first);
  registerOffline();
  void loadFonts();
}

main();
