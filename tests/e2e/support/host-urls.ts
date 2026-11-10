// Fixed origins of the multi-origin host harness (RULE-17 frame tests, adapters/tests.md; pattern from
// the sibling image-annotator). Two browser origins on one machine come from pairing `localhost` with
// `127.0.0.1` and from distinct ports (HOST_PORT_BASE, per worktree; tests/e2e/support/ports.ts). The
// harness (host-harness.mjs) builds the tool with HOST_ORIGINS = HOST_ALLOWED and serves it with its
// real `_headers`, so frame-ancestors and the compiled-in allow-list are both exercised.
import { HOST_PORT_BASE, OFFLINE_PORT_BASE } from './ports';

export const HOST_PORTS = {
  hostAllowed: HOST_PORT_BASE,
  toolAllowed: HOST_PORT_BASE + 1,
  hostOther: HOST_PORT_BASE + 2,
  toolEmpty: HOST_PORT_BASE + 3,
  toolBoth: HOST_PORT_BASE + 4,
} as const;

/** The one allowed host origin: a stub of the TaroKit portal's tool page. */
export const HOST_ALLOWED = `http://localhost:${HOST_PORTS.hostAllowed}`;
/** The tool, built with HOST_ORIGINS = HOST_ALLOWED. */
export const TOOL_ALLOWED = `http://127.0.0.1:${HOST_PORTS.toolAllowed}`;
/** A host origin not in the allow-list. */
export const HOST_OTHER = `http://localhost:${HOST_PORTS.hostOther}`;
/**
 * The same build served with frame-ancestors 'none', as an empty allow-list deploys. A header-only
 * shortcut: its compiled-in allow-list is still [HOST_ALLOWED] (a real HOST_ORIGINS="" build is
 * checked in tests/unit/host.contract.test.ts).
 */
export const TOOL_EMPTY = `http://127.0.0.1:${HOST_PORTS.toolEmpty}`;
/**
 * The same build served with frame-ancestors allowing HOST_ALLOWED and HOST_OTHER: HOST_OTHER can embed
 * it, but its compiled-in allow-list is only [HOST_ALLOWED], so the tool's own origin check is exercised.
 */
export const TOOL_BOTH = `http://127.0.0.1:${HOST_PORTS.toolBoth}`;

export interface HostOptions {
  readonly theme?: 'light' | 'dark';
  readonly lang?: string;
  /** false: the frame without the downloads and leave-page grants. */
  readonly grants?: boolean;
  /** false: the frame without the optional web-share grant (RULE-17). */
  readonly share?: boolean;
  /** false: the host never moves focus into the tool after the ready signal. */
  readonly focus?: boolean;
}

/**
 * The stub portal page embedding `tool` in `#tool`, with `theme` and `lang` in the tool's address as
 * the portal does (RULE-17; taro-kit MOD-ToolHost embeddedSrc).
 */
export function hostPageUrl(host: string, tool: string, o: HostOptions = {}): string {
  const q = new URLSearchParams();
  if (o.theme) q.set('theme', o.theme);
  if (o.lang !== undefined) q.set('lang', o.lang);
  const query = q.toString();
  const page = new URLSearchParams({ tool: query ? `${tool}/?${query}` : `${tool}/` });
  if (o.grants === false) page.set('grants', '0');
  if (o.share === false) page.set('share', '0');
  if (o.focus === false) page.set('focus', '0');
  return `${host}/host.html?${page.toString()}`;
}

/**
 * The offline harness (F-021, tests/e2e/support/offline-servers.mjs), one set of servers per engine so
 * request logs, the "server down" switch and published versions never mix: `tool` — the tool built for
 * HOST_ALLOWED; `update` — the same, for the test that publishes version 2; `harness` — the export
 * harness page built for production with the offline worker.
 */
export function offlineServer(browserName: string, which: 'tool' | 'update' | 'harness' = 'tool'): string {
  const engine = browserName === 'webkit' ? 3 : 0;
  const offset = { tool: 0, update: 1, harness: 2 }[which];
  return `http://127.0.0.1:${OFFLINE_PORT_BASE + engine + offset}`;
}
