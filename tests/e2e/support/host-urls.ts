// Fixed origins of the multi-origin host harness (RULE-17 frame tests, adapters/tests.md; pattern from
// the sibling image-annotator). Two browser origins on one machine come from pairing `localhost` with
// `127.0.0.1` and from distinct ports (HOST_PORT_BASE, per worktree; tests/e2e/support/ports.ts). The
// harness (host-harness.mjs) builds the tool with HOST_ORIGINS = HOST_ALLOWED and serves it with its
// real `_headers`, so frame-ancestors and the compiled-in allow-list are both exercised.
import { HOST_PORT_BASE } from './ports';

export const HOST_PORTS = {
  hostAllowed: HOST_PORT_BASE,
  toolAllowed: HOST_PORT_BASE + 1,
  hostOther: HOST_PORT_BASE + 2,
  toolEmpty: HOST_PORT_BASE + 3,
} as const;

/** The one allowed host origin: a stub of the TaroKit portal's tool page. */
export const HOST_ALLOWED = `http://localhost:${HOST_PORTS.hostAllowed}`;
/** The tool, built with HOST_ORIGINS = HOST_ALLOWED. */
export const TOOL_ALLOWED = `http://127.0.0.1:${HOST_PORTS.toolAllowed}`;
/** A host origin not in the allow-list. */
export const HOST_OTHER = `http://localhost:${HOST_PORTS.hostOther}`;
/** The same build served with an empty allow-list (frame-ancestors 'none'): standalone only. */
export const TOOL_EMPTY = `http://127.0.0.1:${HOST_PORTS.toolEmpty}`;

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
