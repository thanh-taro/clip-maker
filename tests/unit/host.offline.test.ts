// MOD-Host / MOD-Build — the offline cache's naming, versioning and routing as pure functions (F-021,
// ADR-0015): the build's manifest version and its stamp in /sw.js, the per-version cache names, which
// caches a new version deletes, the manifest the worker accepts, and how requests are answered.
import { describe, expect, it, vi } from 'vitest';
import { registerOffline, SW_URL, type OfflineDeps } from '../../src/host';
import {
  base64url,
  CACHE_PREFIX,
  cacheKey,
  cacheName,
  fileHash,
  isManifestPath,
  isVersion,
  readManifest,
  routeOf,
  staleCaches,
  storedPath,
} from '../../src/host/offline-policy';
// @ts-expect-error -- plain ESM build script without type declarations
import { hash, manifestOf, stampVersion, VERSION_TOKEN } from '../../scripts/lib/offline.mjs';

const ORIGIN = 'https://clip-maker.tarokit.app';
const V1 = 'AbCdEfGh12345678';
const V2 = 'zyxw_-9876543210';
const files = {
  '/index.html': 'a'.repeat(16),
  '/assets/index-BbAMrX7-.js': 'b'.repeat(16),
  '/assets/manrope-latin-wght-normal-DHIcAJRg.woff2': 'c'.repeat(16),
  '/third-party-notices.txt': 'd'.repeat(16),
};
const get = (url: string, mode = 'cors', method = 'GET') => ({ method, url, mode });

describe('MOD-Host offline cache naming and versioning', () => {
  it('F-021.R3 each version has its own cache, named from the build version', () => {
    expect(cacheName(V1)).toBe(`${CACHE_PREFIX}${V1}`);
    expect(cacheName(V1)).not.toBe(cacheName(V2));
    expect(cacheName(V1).startsWith('clip-maker-offline-')).toBe(true);
    for (const bad of ['', 'short', '__TK_OFFLINE_VERSION__', 'AbCdEfGh1234567/', 'AbCdEfGh123456789'])
      expect(() => cacheName(bad)).toThrow();
    expect(isVersion(V2)).toBe(true);
  });

  it('F-021.R3 a version taking over deletes only the tool’s other caches', () => {
    const names = [cacheName(V1), cacheName(V2), 'someone-else', 'clip-maker-other'];
    expect(staleCaches(names, cacheName(V2))).toEqual([cacheName(V1)]);
    expect(staleCaches([cacheName(V2)], cacheName(V2))).toEqual([]);
  });

  it('ADR-0015 MOD-Build the manifest version changes exactly when a file changes, is added or removed', () => {
    const m = manifestOf(files) as { version: string; files: Record<string, string> };
    expect(isVersion(m.version)).toBe(true);
    expect(Object.keys(m.files)).toEqual(Object.keys(files).sort((a, b) => a.localeCompare(b)));
    // Order of discovery does not matter.
    const reversed = Object.fromEntries(Object.entries(files).reverse());
    expect(manifestOf(reversed).version).toBe(m.version);
    expect(manifestOf({ ...files, '/index.html': 'e'.repeat(16) }).version).not.toBe(m.version);
    expect(manifestOf({ ...files, '/assets/x-1.png': 'f'.repeat(16) }).version).not.toBe(m.version);
    const { ['/third-party-notices.txt']: _gone, ...fewer } = files;
    expect(manifestOf(fewer).version).not.toBe(m.version);
  });

  it('ADR-0015 MOD-Build the version is stamped into /sw.js, so a new build gives the browser a new worker', () => {
    const code = `const a="${VERSION_TOKEN}";cacheName("${VERSION_TOKEN}")`;
    expect(stampVersion(code, V1)).toBe(`const a="${V1}";cacheName("${V1}")`);
    expect(stampVersion(code, V1)).not.toBe(stampVersion(code, V2));
    expect(() => stampVersion('const a = 1', V1)).toThrow(/__TK_OFFLINE_VERSION__/);
  });

  it('ADR-0015 the worker checks files with the same hash the build wrote', async () => {
    for (const text of ['', 'a', 'ab', 'abc', 'Clip Maker ✓', 'x'.repeat(1000)]) {
      const bytes = new TextEncoder().encode(text);
      expect(await fileHash(bytes.slice().buffer, crypto.subtle)).toBe(hash(text));
    }
    const enc = (t: string) => base64url(new TextEncoder().encode(t));
    expect([enc('M'), enc('Ma'), enc('Man'), base64url(new Uint8Array([0xfb, 0xff]))]).toEqual([
      'TQ',
      'TWE',
      'TWFu',
      '-_8',
    ]);
  });
});

describe('MOD-Host offline manifest', () => {
  it('F-021.R1 the worker accepts its own version’s manifest of the tool’s own files', () => {
    expect(readManifest({ version: V1, files }, V1)).toEqual({ version: V1, files });
  });

  it('F-021.R1 a manifest of another version, malformed, without the page or naming other files is refused', () => {
    expect(readManifest({ version: V2, files }, V1)).toBeNull();
    expect(readManifest({ version: 1, files }, V1)).toBeNull();
    expect(readManifest(null, V1)).toBeNull();
    expect(readManifest({ version: V1, files: [] }, V1)).toBeNull();
    expect(readManifest({ version: V1, files: {} }, V1)).toBeNull();
    const { ['/index.html']: _page, ...noPage } = files;
    expect(readManifest({ version: V1, files: noPage }, V1)).toBeNull();
    for (const path of [
      'https://elsewhere.example/x.js',
      '//elsewhere.example/x.js',
      '/assets/x.js?v=1',
      '/assets/x.js#a',
      '/assets/../secret',
      '/assets/x.js.map',
      '/sw.js',
      '/asset-manifest.json',
      'assets/x.js',
    ]) {
      expect(isManifestPath(path), path).toBe(false);
      expect(readManifest({ version: V1, files: { ...files, [path]: 'g'.repeat(16) } }, V1), path).toBeNull();
    }
    expect(readManifest({ version: V1, files: { ...files, '/assets/x.js': 'short' } }, V1)).toBeNull();
    expect(isManifestPath('/assets/looks/teal-1a2b.png')).toBe(true);
  });

  it('F-021.R1 the page is stored under the address the tool is opened at', () => {
    expect(storedPath('/index.html')).toBe('/');
    expect(storedPath('/assets/index-BbAMrX7-.js')).toBe('/assets/index-BbAMrX7-.js');
  });
});

describe('MOD-Host offline routing', () => {
  it('F-021.R2 opening the tool goes to the network first (the version check), whatever the address query', () => {
    for (const url of [`${ORIGIN}/`, `${ORIGIN}/?theme=dark&lang=vi-VN`, `${ORIGIN}/index.html`])
      expect(routeOf(get(url, 'navigate'), ORIGIN), url).toBe('page');
    expect(cacheKey(`${ORIGIN}/?theme=dark&lang=vi-VN`, ORIGIN)).toBe(`${ORIGIN}/`);
    expect(cacheKey(`${ORIGIN}/index.html`, ORIGIN)).toBe(`${ORIGIN}/`);
  });

  it('F-021.R2 the tool’s own files are answered from the cache; nothing else is intercepted', () => {
    expect(routeOf(get(`${ORIGIN}/assets/engine.worker-DuA5T3-T.js`), ORIGIN)).toBe('file');
    expect(routeOf(get(`${ORIGIN}/asset-manifest.json`), ORIGIN)).toBe('file');
    expect(routeOf(get(`${ORIGIN}/third-party-notices.txt`), ORIGIN)).toBe('file');
    expect(cacheKey(`${ORIGIN}/assets/a-1.js`, ORIGIN)).toBe(`${ORIGIN}/assets/a-1.js`);
    for (const req of [
      get('https://elsewhere.example/assets/a-1.js'),
      get(`${ORIGIN}/assets/a-1.js`, 'cors', 'POST'),
      get(`${ORIGIN}/assets/a-1.js?x=1`),
      get(`${ORIGIN}/sw.js`),
      get(`${ORIGIN}/third-party-notices.txt`, 'navigate'),
      get(`${ORIGIN}/other`, 'navigate'),
      get(`blob:${ORIGIN}/0b1c`),
      get('data:text/plain,x'),
      get('not a url'),
    ])
      expect(routeOf(req, ORIGIN), `${req.method} ${req.url} ${req.mode}`).toBeNull();
  });
});

describe('MOD-Host registerOffline', () => {
  const deps = (over: Partial<OfflineDeps> = {}) => {
    const register = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration));
    let loaded: (() => void) | null = null;
    const d: OfflineDeps = {
      container: { register },
      production: true,
      afterLoad: (fn) => {
        loaded = fn;
      },
      ...over,
    };
    return { d, register, load: () => loaded?.() };
  };

  it('F-021.R1 F-021.R2 the worker is registered once the page has loaded, always checked against the network', () => {
    const { d, register, load } = deps();
    registerOffline(d);
    expect(register).not.toHaveBeenCalled();
    load();
    expect(register).toHaveBeenCalledWith(SW_URL, { scope: '/', type: 'classic', updateViaCache: 'none' });
  });

  it('MOD-Host no worker on the dev server or where the browser has none; a refusal is silent', async () => {
    const dev = deps({ production: false });
    registerOffline(dev.d);
    dev.load();
    expect(dev.register).not.toHaveBeenCalled();
    expect(() => registerOffline({ ...deps().d, container: undefined })).not.toThrow();
    const refused = vi.fn(() => Promise.reject(new Error('SecurityError')));
    const r = deps({ container: { register: refused } });
    registerOffline(r.d);
    r.load();
    await Promise.resolve();
    expect(refused).toHaveBeenCalledTimes(1);
  });
});
