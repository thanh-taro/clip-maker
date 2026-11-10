// MOD-Host — registers the offline service worker (ADR-0015). Only MOD-Host touches the service worker
// (lint-enforced). The tool shows nothing about it: a refused or failed registration leaves the tool
// working online, and a failed precache is retried by the browser on the next online open.

/** The worker's stable, unhashed address (scripts/lib/offline.mjs). */
export const SW_URL = '/sw.js';

export interface OfflineDeps {
  /** `navigator.serviceWorker`, absent where the browser offers none (or in an opaque frame). */
  readonly container: Pick<ServiceWorkerContainer, 'register'> | undefined;
  /** False on the dev server and test pages, which have no /sw.js. */
  readonly production: boolean;
  /** Calls `fn` once the page has loaded (after first render and the start-up fetches). */
  readonly afterLoad: (fn: () => void) => void;
}

function browserDeps(): OfflineDeps {
  let container: OfflineDeps['container'];
  try {
    container = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined;
  } catch {
    container = undefined; // A sandboxed frame without allow-same-origin throws on access.
  }
  return {
    container,
    production: import.meta.env.PROD,
    afterLoad: (fn) => {
      if (document.readyState === 'complete') fn();
      else addEventListener('load', fn, { once: true });
    },
  };
}

/**
 * Registers /sw.js after the page has loaded. Implements: F-021.R1 (the worker precaches every file on
 * the first visit), F-021.R2 (`updateViaCache: 'none'`: the browser's version check while the tool is
 * opened always asks for the current /sw.js, and the page itself makes no other request for it),
 * F-021.R3 (nothing here listens for a new worker or reloads the page).
 */
export function registerOffline(deps: OfflineDeps = browserDeps()): void {
  const { container } = deps;
  if (!deps.production || !container) return;
  deps.afterLoad(() => {
    container.register(SW_URL, { scope: '/', type: 'classic', updateViaCache: 'none' }).catch(() => undefined);
  });
}
