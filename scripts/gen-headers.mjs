// Boot script + HOST_ORIGINS + TOOL_ORIGIN → `public/_headers` (Cloudflare static assets syntax,
// ADR-0014, MOD-Build). Copied from the sibling image-annotator and adapted to ADR-0014:
// `connect-src 'self'` (D-032; only MOD-Assets fetches, manifest paths only), `media-src 'none'`,
// no 'wasm-unsafe-eval', no `blob:` in any source list, `fullscreen=(self)` and `web-share=(self)`,
// and Access-Control-Allow-Origin on the hashed modules (worker and worklet; iOS standalone refused
// the same-origin worklet over CORS, ADR-0014 outcome).
// HOST_ORIGINS: space-separated origins allowed to frame the tool (default https://tarokit.app;
// empty → 'none'). The same list is compiled into MOD-Host by vite.config.ts.
import { abs, emit, GENERATED_HEADER } from './lib/util.mjs';
import { BOOT_SOURCE, bootScriptHash } from './lib/boot.mjs';

const OUT = abs('public/_headers');
export const DEFAULT_HOST_ORIGINS = 'https://tarokit.app';
/** A3: the production address of the tool. */
export const DEFAULT_TOOL_ORIGIN = 'https://clip-maker.tarokit.app';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * One origin entry as a serialised origin, or an Error explaining why it is refused (NFR-09,
 * RULE-17: the list feeds frame-ancestors and the compiled-in allow-list, so a wildcard, keyword,
 * path or stray directive must never reach either). https only; http for local hosts.
 */
export function normaliseOrigin(entry) {
  if (/['";*]/.test(entry) || entry === 'null') return new Error(`not an origin: ${entry}`);
  let url;
  try {
    url = new URL(entry);
  } catch {
    return new Error(`not an origin: ${entry}`);
  }
  const local = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !local) return new Error(`not https: ${entry}`);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    return new Error(`origin must have no path, query or credentials: ${entry}`);
  }
  if (url.origin.toLowerCase() !== entry.toLowerCase().replace(/\/$/, '')) {
    return new Error(`not a serialised origin: ${entry} (did you mean ${url.origin}?)`);
  }
  return url.origin;
}

/** Parses a HOST_ORIGINS value; throws (failing gen and build) on any refused entry. */
export function parseHostOrigins(value) {
  const out = [];
  const errors = [];
  for (const entry of value.split(/[\s,]+/).filter(Boolean)) {
    const origin = normaliseOrigin(entry);
    if (origin instanceof Error) errors.push(origin.message);
    else if (!out.includes(origin)) out.push(origin);
  }
  if (errors.length) throw new Error(`HOST_ORIGINS refused: ${errors.join('; ')}`);
  return out;
}

export function hostOrigins() {
  return parseHostOrigins(process.env.HOST_ORIGINS ?? DEFAULT_HOST_ORIGINS);
}

export function toolOrigin() {
  const o = normaliseOrigin(process.env.TOOL_ORIGIN || DEFAULT_TOOL_ORIGIN);
  if (o instanceof Error) throw new Error(`TOOL_ORIGIN refused: ${o.message}`);
  return o;
}

export function pageCsp(origins = hostOrigins()) {
  return [
    "default-src 'none'",
    `script-src 'self' '${bootScriptHash()}'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "worker-src 'self'",
    "connect-src 'self'",
    "media-src 'none'",
    "manifest-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${origins.length ? origins.join(' ') : "'none'"}`,
  ].join('; ');
}

/**
 * Permissions-Policy (ADR-0014): full screen and web share for itself (a host's `allow=` can
 * delegate them, F-002.R7, RULE-17); every other powerful feature denied explicitly, the clipboard
 * included (paste uses the `paste` event, which needs no permission).
 */
export const PERMISSIONS_POLICY = [
  'fullscreen=(self)',
  'web-share=(self)',
  'clipboard-read=()',
  'clipboard-write=()',
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'hid=()',
  'serial=()',
  'bluetooth=()',
  'midi=()',
  'display-capture=()',
  'screen-wake-lock=()',
  'idle-detection=()',
  'local-fonts=()',
  'browsing-topics=()',
  'storage-access=()',
  'publickey-credentials-get=()',
  'publickey-credentials-create=()',
  'otp-credentials=()',
  'accelerometer=()',
  'gyroscope=()',
  'magnetometer=()',
  'xr-spatial-tracking=()',
  'window-management=()',
].join(', ');

export const SW_CSP = "default-src 'none'; connect-src 'self'";

/**
 * The `_headers` rules for an allow-list and tool origin. Also used by the e2e host harness
 * (tests/e2e/support/host-harness.mjs), which serves a build allow-listing a local stub portal.
 */
export function headersRules(origins = hostOrigins(), tool = toolOrigin()) {
  return `/*
  Content-Security-Policy: ${pageCsp(origins)}
  Permissions-Policy: ${PERMISSIONS_POLICY}
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Cache-Control: no-cache
/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
  Access-Control-Allow-Origin: ${tool}
/sw.js
  ! Content-Security-Policy
  Content-Security-Policy: ${SW_CSP}
`;
}

export function genHeaders({ check }) {
  const out = `# ${GENERATED_HEADER(BOOT_SOURCE + ', HOST_ORIGINS and TOOL_ORIGIN', 'scripts/gen-headers.mjs')}
# Every matching rule applies; "! Name" detaches a header set by an earlier rule.
${headersRules()}`;
  return emit(OUT, out, { check });
}
