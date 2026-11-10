// MOD-Host — the offline cache policy as pure functions (no DOM, no worker globals), ADR-0015.
// Adapted from the sibling image-annotator's offline-policy. Imported only by the service worker entry
// (`sw.ts`) and the unit tests, so the bundler inlines it into /sw.js; it must stay self-contained
// (/sw.js shares no code with the page; scripts/lib/offline.mjs fails the build otherwise).
// Implements: F-021.R1 (every file of the build's asset manifest is precached, checked against its
// hash), F-021.R2 (only the tool's own files are routed or stored), F-021.R3 (one cache per version;
// a new version's cache is filled while it waits, and older ones are deleted when it takes over).

/** Prefix of every Cache Storage name the tool owns. */
export const CACHE_PREFIX = 'clip-maker-offline-';
/** The build's manifest of every file the tool can need (MOD-Build, scripts/lib/offline.mjs). */
export const MANIFEST_PATH = '/asset-manifest.json';
/** The page's manifest entry; it is stored under PAGE_KEY_PATH (the address the tool is opened at). */
export const PAGE_PATH = '/index.html';
export const PAGE_KEY_PATH = '/';
/** Length of a manifest hash: base64url SHA-256, truncated (scripts/lib/offline.mjs `hash`). */
export const HASH_LENGTH = 16;
/** Upper bound on manifest entries (the tool has a few dozen files; anything larger is not ours). */
export const MAX_FILES = 512;

/** The build's version string, as the build stamps it into /sw.js: base64url, HASH_LENGTH long. */
export function isVersion(v: unknown): v is string {
  return typeof v === 'string' && new RegExp(`^[A-Za-z0-9_-]{${HASH_LENGTH}}$`).test(v);
}

/** The Cache Storage name of one version (F-021.R3: each version keeps its own copy). */
export function cacheName(version: string): string {
  if (!isVersion(version)) throw new Error(`offline: not a version: ${version}`);
  return CACHE_PREFIX + version;
}

/**
 * The tool's caches other than `current`'s, deleted when `current` takes over (no other tab runs them).
 * None while `current` holds no full copy (its manifest is stored last): an older version activating
 * while a newer one is still installing must not delete the newer cache, nor leave no copy at all.
 */
export function staleCaches(names: readonly string[], current: string, currentComplete = true): string[] {
  if (!currentComplete || !names.includes(current)) return [];
  return names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== current);
}

export interface AssetManifest {
  readonly version: string;
  /** Root-relative path → hash, every file the tool can need. */
  readonly files: Readonly<Record<string, string>>;
}

const SEGMENT = '[A-Za-z0-9_][A-Za-z0-9._-]*';
const FILE_PATH = new RegExp(`^(?:/${SEGMENT})+$`);

/**
 * A path the manifest may list: the tool's own root-relative file (at the root or in a folder), with no
 * query, fragment, dot segments, source maps, the worker or the manifest itself.
 */
export function isManifestPath(path: string): boolean {
  return (
    FILE_PATH.test(path) &&
    !path.includes('..') &&
    !path.endsWith('.map') &&
    path !== '/sw.js' &&
    path !== MANIFEST_PATH
  );
}

/**
 * Validates the fetched manifest against the worker's own version: null when it is malformed, lists a
 * path that is not the tool's own, or belongs to another version (a new one published between the
 * worker and its manifest being fetched; the install fails and is retried on the next online open).
 */
export function readManifest(data: unknown, version: string): AssetManifest | null {
  if (typeof data !== 'object' || data === null) return null;
  const { version: v, files } = data as { version?: unknown; files?: unknown };
  if (v !== version || typeof files !== 'object' || files === null || Array.isArray(files)) return null;
  const entries = Object.entries(files as Record<string, unknown>);
  if (!entries.length || entries.length > MAX_FILES) return null;
  const out: Record<string, string> = {};
  for (const [path, hash] of entries) {
    if (!isManifestPath(path) || !isVersion(hash)) return null;
    out[path] = hash;
  }
  if (!(PAGE_PATH in out)) return null;
  return { version, files: out };
}

/** Where a manifest file is fetched and stored: the page under `/`, every other file at its path. */
export function storedPath(path: string): string {
  return path === PAGE_PATH ? PAGE_KEY_PATH : path;
}

/**
 * Cache keys (full URLs) a complete copy of `manifest` lacks: every file at its stored path, and the
 * manifest itself. The install checks this at its end and fails when anything is missing (the cache
 * was deleted or emptied meanwhile), so the browser retries it on the next online open.
 */
export function missingKeys(manifest: AssetManifest, cachedKeys: readonly string[], origin: string): string[] {
  const have = new Set(cachedKeys);
  const want = [...Object.keys(manifest.files).map((p) => origin + storedPath(p)), origin + MANIFEST_PATH];
  return want.filter((k) => !have.has(k));
}

const ownHttp = (u: URL, origin: string) => (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === origin;

export type Route = 'page' | 'file' | null;

/**
 * How the worker answers a request: `page` — network first with the stored page as the offline
 * fallback (the version check happens only here, while the tool is being opened, F-021.R2);
 * `file` — cache first; null — not intercepted (other origins, non-GET, a query on a file, other
 * navigations, the worker script).
 */
export function routeOf(req: { method: string; url: string; mode: string }, origin: string): Route {
  if (req.method !== 'GET') return null;
  let u: URL;
  try {
    u = new URL(req.url);
  } catch {
    return null;
  }
  if (!ownHttp(u, origin)) return null;
  if (req.mode === 'navigate') return u.pathname === PAGE_KEY_PATH || u.pathname === PAGE_PATH ? 'page' : null;
  if (u.search || u.pathname === '/sw.js') return null;
  return isManifestPath(u.pathname) || u.pathname === MANIFEST_PATH ? 'file' : null;
}

/**
 * The cache key of a routed request: the page has one key whatever its address, matched ignoring the
 * query, because the portal opens the tool with `?theme=` and `?lang=` (RULE-17); files by path.
 */
export function cacheKey(url: string, origin: string): string {
  const u = new URL(url);
  return origin + (u.pathname === PAGE_PATH ? PAGE_KEY_PATH : u.pathname);
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding (the encoding of the build's hashes, Node's `digest('base64url')`). */
export function base64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let k = 0; k < chars; k++) out += B64URL[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

/** The manifest hash of a file's bytes: SHA-256, base64url, the first HASH_LENGTH characters. */
export async function fileHash(data: ArrayBuffer, subtle: SubtleCrypto): Promise<string> {
  return base64url(new Uint8Array(await subtle.digest('SHA-256', data))).slice(0, HASH_LENGTH);
}
