// MOD-Core — the tool's one Trusted Types policy (ADR-0014 as amended by QA-3, NFR-09).
// The page CSP sets `require-trusted-types-for 'script'; trusted-types clip-maker`, so every script URL
// sink (the dedicated workers' `new Worker(url)` and the offline worker's registration) takes a value from
// this policy. It creates script URLs only, and only for the tool's own origin: no `blob:`, `data:` or
// other origin can become a worker or service-worker script. There is no HTML or script policy, so an HTML
// sink (`innerHTML` and the like) or a string evaluated as code always throws.
// Where the engine has no Trusted Types (`trustedTypes` absent), the checked URL is returned as a string.

/** The policy name, as allow-listed by the CSP's `trusted-types` directive (scripts/gen-headers.mjs). */
export const TRUSTED_TYPES_POLICY = 'clip-maker';

interface ScriptUrlPolicy {
  createScriptURL(url: string): unknown;
}
interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createScriptURL(url: string): string }): ScriptUrlPolicy;
}

/** The page's (or worker's) address, for resolving relative script paths; null outside a browser. */
function here(): URL | null {
  const href = (globalThis as { location?: { href: string } }).location?.href;
  return href ? new URL(href) : null;
}

/**
 * Is `url` a script of the tool's own origin? Resolved against the current address; only http(s) URLs
 * whose origin equals the current origin pass (never `blob:`, `data:`, `javascript:` or another origin).
 * With no address (unit tests in Node), only a root-relative path passes.
 */
export function ownScriptUrl(url: string, base: URL | null = here()): string | null {
  if (!base) return /^\/(?![/\\])/.test(url) ? url : null;
  let u: URL;
  try {
    u = new URL(url, base);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.origin !== base.origin) return null;
  return u.href;
}

let policy: ScriptUrlPolicy | null | undefined;

function getPolicy(): ScriptUrlPolicy | null {
  if (policy !== undefined) return policy;
  const tt = (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes;
  policy = tt
    ? tt.createPolicy(TRUSTED_TYPES_POLICY, {
        createScriptURL(url: string): string {
          if (ownScriptUrl(url) === null) throw new TypeError(`Trusted Types: not a script of this tool: ${url}`);
          return url;
        },
      })
    : null;
  return policy;
}

/**
 * A script URL for a worker or the service worker, through the tool's Trusted Types policy. Typed as a
 * string because the DOM typings take `string | URL` (the value is a TrustedScriptURL where supported).
 * The URL itself is passed on unchanged; anything but a script of the tool's own origin throws.
 */
export function scriptUrl(url: string): string {
  const p = getPolicy();
  if (p) return p.createScriptURL(url) as string;
  if (ownScriptUrl(url) === null) throw new TypeError(`not a script of this tool: ${url}`);
  return url;
}

/** Tests only: forget the created policy. */
export function resetTrustedTypesForTests(): void {
  policy = undefined;
}
