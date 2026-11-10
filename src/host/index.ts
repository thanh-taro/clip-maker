// MOD-Host — theme, language, the host contract and the service worker
// (specs/40-technical/modules/MOD-Host.md, ADR-0002 §4, ADR-0014, ADR-0015). Only this module reaches
// the parent window or the service worker (lint-enforced). Adapted from the sibling image-annotator.
// Portal tool contract: one `taro:ready`; settings only from an allowed origin and the parent; never
// `autofocus` — a control is focused only on the window's first `focus` event while the body has it.
import { signal } from '@preact/signals';
import { language, type Language } from '../copy';
import { acceptSettings, READY_MESSAGE, readyTarget, type Settings, type Theme } from './messages';

export { loadFonts } from './fonts';
export { matchLanguage, resolveLanguage } from './language';
export { acceptSettings, READY_MESSAGE, readyTarget } from './messages';
export type { Settings, Theme } from './messages';
export { canShareFile, type ShareNavigator } from './share';
export { registerOffline, SW_URL, type OfflineDeps } from './offline';

/** The compiled-in allow-list of host origins (HOST_ORIGINS, vite.config.ts; RULE-17, NFR-09). */
export const HOST_ORIGINS: readonly string[] = __HOST_ORIGINS__;

/** The current theme, as the boot script set it on <html data-theme>. */
export const theme = signal<Theme>(
  typeof document !== 'undefined' && document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark',
);
/** Embedded in a host frame, or standalone (PRN-05). */
export const embedded = signal(false);

let started = false;
/** True once the theme came from the host (address or message): the device preference no longer applies. */
let hostOwnsTheme = false;

function addressParams(): URLSearchParams {
  try {
    return new URLSearchParams(location.search);
  } catch {
    return new URLSearchParams();
  }
}

// Implements: F-019.R1 (switch live, no reload; the theme never touches the picture, INV-05).
function setTheme(next: Theme): void {
  theme.value = next;
  if (document.documentElement.dataset['theme'] !== next) document.documentElement.dataset['theme'] = next;
}

// Implements: F-022.R2 (switch live; nothing reloads).
function setLanguage(next: Language): void {
  language.value = next;
  document.documentElement.lang = next;
}

function apply(settings: Settings): void {
  if (settings.type === 'taro:theme') {
    hostOwnsTheme = true;
    setTheme(settings.value);
  } else {
    setLanguage(settings.value);
  }
}

/**
 * Starts the host contract after first render: follows the device preference while the host has not
 * set a theme, accepts origin-checked settings messages and posts the single ready signal.
 * `focusFirst` is focused on the window's first `focus` event, only if the body still has focus
 * (portal tool contract; never `autofocus`, never taking focus from the host).
 */
export function initHost(focusFirst?: () => HTMLElement | null): void {
  if (started) return;
  started = true;

  const fromAddress = addressParams().get('theme');
  hostOwnsTheme = fromAddress === 'light' || fromAddress === 'dark';
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    if (!hostOwnsTheme) setTheme(e.matches ? 'light' : 'dark');
  });

  // Implements: F-019.R6 (focus enters only when the host moves it after ready, or on a click or Tab).
  // WebKit refuses focus() in a cross-origin frame without a user gesture: there the tool's document
  // keeps focus (keys reach the tool) with no control focused.
  if (focusFirst) {
    window.addEventListener(
      'focus',
      () => {
        if (document.activeElement === document.body) focusFirst()?.focus();
      },
      { once: true },
    );
  }

  embedded.value = window.parent !== window;
  if (!embedded.value) return;

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const settings = acceptSettings(event, HOST_ORIGINS, window.parent);
    if (settings) apply(settings);
  });

  // Implements: RULE-17 / INV-08 — one ready signal, no content, to the parent's origin only.
  const target = readyTarget(location.ancestorOrigins?.[0], document.referrer, HOST_ORIGINS);
  if (target) window.parent.postMessage(READY_MESSAGE, target);
}
