// MOD-Host — the host contract's message checks as pure functions (RULE-17, ADR-0002 §4, ADR-0014
// outcome, MOD-Host "Portal tool contract"). Adapted from the sibling image-annotator.
// Implements: F-019 (accept settings only from an allowed origin and the embedding page; a repeat is
// simply "apply this value"), INV-08 (the ready signal is the only outbound message and carries no
// content), F-022.R2 / RULE-18 (unsupported language values are ignored).
import type { Language } from '../copy';
import { matchLanguage } from './language';

export type Theme = 'light' | 'dark';

/** An accepted settings message. */
export type Settings = { type: 'taro:theme'; value: Theme } | { type: 'taro:language'; value: Language };

/** The only message the tool ever sends the host (RULE-17, INV-08): no content. */
export const READY_MESSAGE = Object.freeze({ type: 'taro:ready' as const });

/** The parts of a `MessageEvent` the checks read. */
export interface IncomingMessage {
  readonly data: unknown;
  readonly origin: string;
  readonly source: unknown;
}

/**
 * The settings carried by `event`, or null when it must be ignored: its origin is not in the
 * allow-list, it does not come from the embedding page (`parent`), or its type or value is not one
 * the contract defines.
 */
export function acceptSettings(event: IncomingMessage, allow: readonly string[], parent: unknown): Settings | null {
  if (!allow.includes(event.origin)) return null;
  if (event.source == null || event.source !== parent) return null;
  const data = event.data;
  if (typeof data !== 'object' || data === null) return null;
  const { type, value } = data as { type?: unknown; value?: unknown };
  if (type === 'taro:theme' && (value === 'light' || value === 'dark')) return { type, value };
  if (type === 'taro:language') {
    const lang = matchLanguage(value);
    return lang ? { type, value: lang } : null;
  }
  return null;
}

/** The serialised origin of a URL, or null. */
function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const o = new URL(url).origin;
    return o === 'null' ? null : o;
  } catch {
    return null;
  }
}

/**
 * The one origin the ready signal goes to, never `'*'` (MOD-Host spike rule, ADR-0014 outcome): the
 * parent's origin from `location.ancestorOrigins[0]` (Chromium, WebKit) or `document.referrer`
 * (Firefox), only if it is in the allow-list; otherwise null (no signal).
 */
export function readyTarget(
  ancestorOrigin: string | undefined | null,
  referrer: string | undefined | null,
  allow: readonly string[],
): string | null {
  const candidate = originOf(ancestorOrigin) ?? originOf(referrer);
  return candidate && allow.includes(candidate) ? candidate : null;
}
