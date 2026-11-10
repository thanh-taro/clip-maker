// Per-worktree e2e ports, so several checkouts (parallel builders) can run the suites at once without
// colliding or attaching to another checkout's servers. Every port is above 20000, clear of WebKit's
// blocked-port list (all ≤ 10080). Environment overrides: E2E_PORT (preview), E2E_HOST_PORT_BASE
// (the host harness of ADR-0016), E2E_OFFLINE_PORT_BASE (the offline harness), E2E_MEDIA_PORT.
import { fileURLToPath } from 'node:url';

/** FNV-1a over this checkout's path: stable per worktree, different between worktrees. */
function checkoutHash(): number {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  let h = 0x811c9dc5;
  for (let i = 0; i < root.length; i++) {
    h ^= root.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 2000;
}

const fromEnv = (name: string): number | null => {
  const v = Number(process.env[name]);
  return Number.isInteger(v) && v > 0 ? v : null;
};

/** `pnpm preview` port for the default suite: 30000–31999 unless E2E_PORT is set. */
export const PREVIEW_PORT = fromEnv('E2E_PORT') ?? 30000 + checkoutHash();

/** First of the five host-harness ports: 20000–29995 (step 5) unless E2E_HOST_PORT_BASE is set. */
export const HOST_PORT_BASE = fromEnv('E2E_HOST_PORT_BASE') ?? 20000 + checkoutHash() * 5;

/**
 * First of the six offline-harness ports (F-021; tests/e2e/support/offline-servers.mjs): 34000–45999
 * (step 6) unless E2E_OFFLINE_PORT_BASE is set.
 */
export const OFFLINE_PORT_BASE = fromEnv('E2E_OFFLINE_PORT_BASE') ?? 34000 + checkoutHash() * 6;

/** Vite dev server of the media harness (tests/harness): 32000–33999 unless E2E_MEDIA_PORT is set. */
export const MEDIA_HARNESS_PORT = fromEnv('E2E_MEDIA_PORT') ?? 32000 + checkoutHash();
