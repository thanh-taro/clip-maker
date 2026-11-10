// MOD-Host — the offline service worker, built to the stable, unhashed path /sw.js (ADR-0015,
// scripts/lib/offline.mjs). Hand-written, no dependency, adapted from the suite's worker
// (image-annotator). Classic script: it imports only ./offline-policy, which nothing in the page
// imports, so the bundle inlines it (a module shared with the page fails the build).
// Implements: F-021.R1 — `install` precaches every file of the build's asset manifest (scripts, worker
// and worklet modules, styles, typefaces, looks, music, notices, the page), each checked against its
// hash; a failed precache fails the install and is retried on the next online open (ADR-0015).
// Implements: F-021.R2 — the only fetches are the precache and the browser's own requests it forwards:
// the page network first (the version check while the tool is being opened), files cache first.
// Implements: F-021.R3 — no `skipWaiting` and no `clients.claim`: a new version installs into its own
// cache and waits until no open tab runs the old one; it takes over on the next open, and only then
// are older versions' caches deleted. Nothing is ever reloaded. Cache Storage is the only storage used.
import {
  cacheKey,
  cacheName,
  fileHash,
  MANIFEST_PATH,
  readManifest,
  routeOf,
  staleCaches,
  storedPath,
  PAGE_KEY_PATH,
} from './offline-policy';

// Minimal service-worker typings (the DOM lib is in scope; the WebWorker lib would clash).
interface ExtendableEvent extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(r: Response | Promise<Response>): void;
}
interface WorkerScope {
  readonly location: { readonly origin: string };
  addEventListener(type: 'install' | 'activate', fn: (e: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', fn: (e: FetchEvent) => void): void;
}
const scope = self as unknown as WorkerScope;
const ORIGIN = scope.location.origin;

/** This build's version, stamped by scripts/lib/offline.mjs (the asset manifest's version). */
const VERSION = '__TK_OFFLINE_VERSION__';
const CACHE = cacheName(VERSION);

const usable = (r: Response) => r.ok && r.type === 'basic' && !r.redirected;

/** A copy of `path` already stored by an earlier version (unchanged files keep their hashed names). */
async function earlier(key: string, want: string): Promise<Response | null> {
  const hit = await caches.match(key);
  if (!hit) return null;
  return (await fileHash(await hit.clone().arrayBuffer(), crypto.subtle)) === want ? hit : null;
}

/** Fetches and stores every file of this version's manifest; throws when any is missing or altered. */
async function precache(): Promise<void> {
  const res = await fetch(MANIFEST_PATH, { cache: 'no-store' });
  if (!usable(res)) throw new Error('offline: no manifest');
  const body = await res.clone().json();
  const manifest = readManifest(body, VERSION);
  if (!manifest) throw new Error('offline: the manifest is not this version’s');
  const cache = await caches.open(CACHE);
  for (const [path, want] of Object.entries(manifest.files)) {
    const key = ORIGIN + storedPath(path);
    if (await cache.match(key)) continue;
    const kept = await earlier(key, want);
    if (kept) {
      await cache.put(key, kept);
      continue;
    }
    // The page revalidates; hashed files may come from the HTTP cache (they are immutable).
    const got = await fetch(key, { cache: storedPath(path) === PAGE_KEY_PATH ? 'no-cache' : 'default' });
    if (!usable(got)) throw new Error(`offline: ${path} did not load`);
    if ((await fileHash(await got.clone().arrayBuffer(), crypto.subtle)) !== want)
      throw new Error(`offline: ${path} is not this version’s`);
    await cache.put(key, got);
  }
  // The manifest last: MOD-Assets reads it through the worker, and its presence marks a full copy.
  await cache.put(ORIGIN + MANIFEST_PATH, res);
}

scope.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

// Implements: F-021.R3 — this version takes over only once no tab runs an older one (the browser
// activates a waiting worker then); the older versions' files go with it.
scope.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of staleCaches(await caches.keys(), CACHE)) await caches.delete(name);
    })(),
  );
});

scope.addEventListener('fetch', (event) => {
  const req = event.request;
  const route = routeOf(req, ORIGIN);
  if (!route) return;
  const key = cacheKey(req.url, ORIGIN);
  if (route === 'page') {
    // Network first: with a connection the open gets the published page (a newer version's page loads
    // its own files from the network until its worker has cached them); without one, or on an error
    // page, this version's stored page opens, matched ignoring the address query.
    event.respondWith(
      (async () => {
        const stored = async () =>
          (await (await caches.open(CACHE)).match(key, { ignoreSearch: true })) ??
          (await caches.match(key, { ignoreSearch: true }));
        let res: Response;
        try {
          res = await fetch(req);
        } catch {
          return (await stored()) ?? Response.error();
        }
        return res.ok ? res : ((await stored()) ?? res);
      })(),
    );
    return;
  }
  // Files: this version's copy, then an earlier version's (same hashed name, same bytes), then the network.
  event.respondWith(
    (async () => (await (await caches.open(CACHE)).match(key)) ?? (await caches.match(key)) ?? fetch(req))(),
  );
});
