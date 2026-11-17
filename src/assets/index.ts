// MOD-Assets — looks, music and the asset manifest from the tool's own origin
// (specs/40-technical/modules/MOD-Assets.md, ADR-0013, ADR-0014, ADR-0015). The only module allowed to
// call `fetch` (lint-enforced), and only for same-origin paths listed in the build-generated asset
// manifest: GET, no query string, no body. Built: the guard (F-021), the manifest read, the bundled
// music files (F-011) and the looks (F-008: each look's 33³ PNG strip, read at start-up after the first
// render, ADR-0013 §5).
import { LOOK_IDS, LOOKS, MUSIC_TRACKS, type LookGroup, type LookId, type MusicTrack } from '../core';
import { LOOK_FILES } from './looks.gen';
import { MUSIC_FILES } from './music.gen';

export { LOOK_FILES } from './looks.gen';
export { MUSIC_FILES, PLACEHOLDER_MUSIC } from './music.gen';

/** The build-generated manifest of every file the tool can need (ADR-0015). */
export const MANIFEST_PATH = '/asset-manifest.json';

/**
 * Is `path` one the tool may fetch? Implements: NFR-01 / ADR-0014 (own files only): a root-relative
 * path with no scheme, host, query or fragment, listed in the manifest (ADR-0015).
 */
export function mayFetch(path: string, manifest: ReadonlySet<string>): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  if (/[?#\\]/.test(path)) return false;
  return path === MANIFEST_PATH || manifest.has(path);
}

/** F-011.R6: the bundled tracks (ENT-MusicTrack) — title, source, licence and duration. */
export const musicTracks = (): readonly MusicTrack[] => MUSIC_TRACKS;

/** The fetch MOD-Assets uses (injected in tests). */
export type Fetcher = (path: string) => Promise<{ ok: boolean; status: number; blob(): Promise<Blob> }>;

const getOwn: Fetcher = (p) => fetch(p, { method: 'GET', credentials: 'same-origin' });

/**
 * The dev server (`pnpm dev`, and the app and media test harnesses on it) builds no asset manifest
 * (ADR-0015: the build writes it), so there the compiled-in music paths stand in for it (build question
 * 113). Never in a build (`vite build`, the e2e suite's `pnpm preview`) or in unit tests.
 */
const DEV_SERVER = import.meta.env.MODE === 'development';

let manifestRead: Promise<ReadonlySet<string>> | null = null;
const musicCache = new Map<string, Promise<Blob>>();

/**
 * The files listed in the build-generated asset manifest (ADR-0015), read once per session by GET from
 * its own-origin path (the service worker answers offline). A failed read is tried again next time.
 */
export function manifestFiles(fetcher: Fetcher = getOwn): Promise<ReadonlySet<string>> {
  if (DEV_SERVER) return Promise.resolve(new Set([...Object.values(MUSIC_FILES), ...Object.values(LOOK_FILES)]));
  if (!manifestRead) {
    const got = fetcher(MANIFEST_PATH).then(async (r) => {
      if (!r.ok) throw new Error(`NetworkError: ${MANIFEST_PATH} answered ${r.status}`);
      const data = JSON.parse(await (await r.blob()).text()) as { files?: unknown } | null;
      if (!data || typeof data.files !== 'object' || data.files === null)
        throw new Error(`NotFoundError: ${MANIFEST_PATH} lists no files`);
      return new Set(Object.keys(data.files)) as ReadonlySet<string>;
    });
    got.catch(() => {
      if (manifestRead === got) manifestRead = null;
    });
    manifestRead = got;
  }
  return manifestRead;
}

/**
 * Implements: F-011.R7, NFR-01 — bundled track `id`'s file from the tool's own origin: a GET of its
 * compiled-in path, and only when the loaded asset manifest lists it (like every file MOD-Assets reads);
 * the service worker serves it from the offline precache (ADR-0015). Kept for the session after the
 * first read; a failed read is tried again next time.
 */
export function musicBlob(id: string, fetcher: Fetcher = getOwn): Promise<Blob> {
  const path = MUSIC_FILES[id];
  if (!path) return Promise.reject(new Error(`NotFoundError: no bundled track ${id}`));
  let got = musicCache.get(id);
  if (!got) {
    got = manifestFiles(fetcher).then(async (files) => {
      if (!mayFetch(path, files)) throw new Error(`NotFoundError: ${path} is not in the asset manifest`);
      const r = await fetcher(path);
      if (!r.ok) throw new Error(`NetworkError: ${path} answered ${r.status}`);
      return r.blob();
    });
    got.catch(() => musicCache.delete(id));
    musicCache.set(id, got);
  }
  return got;
}

/** Decodes a look strip into its 33³ table (MOD-Compositor `decodeLookStrip` in the app; fakes in tests). */
export type StripDecoder = (png: Blob) => Promise<Uint8Array>;

/** A bundled look: id, group (looks.md) and its 33³ RGBA table (ADR-0007 §3). */
export interface LookData {
  readonly id: LookId;
  readonly group: LookGroup;
  readonly table: Uint8Array;
}

const lookCache = new Map<LookId, Promise<LookData>>();

/**
 * Implements: RULE-09 (the bundled looks), F-008 (data), ADR-0013 §5, NFR-01 — every look's strip from the
 * tool's own origin: a GET of its compiled-in path, only when the asset manifest lists it, decoded into
 * its table. Each look is read once per session; the result is in looks.md order and leaves out the looks
 * that could not be read, which are tried again on the next call.
 */
export async function looks(decode: StripDecoder, fetcher: Fetcher = getOwn): Promise<readonly LookData[]> {
  const read = (id: LookId): Promise<LookData> => {
    let got = lookCache.get(id);
    if (!got) {
      const path = LOOK_FILES[id];
      got = manifestFiles(fetcher).then(async (files) => {
        if (!path || !mayFetch(path, files))
          throw new Error(`NotFoundError: ${path ?? id} is not in the asset manifest`);
        const r = await fetcher(path);
        if (!r.ok) throw new Error(`NetworkError: ${path} answered ${r.status}`);
        return { id, group: LOOKS[id].group, table: await decode(await r.blob()) };
      });
      got.catch(() => lookCache.delete(id));
      lookCache.set(id, got);
    }
    return got;
  };
  const all = await Promise.allSettled(LOOK_IDS.map(read));
  return all.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}

/** Test reset (one page = one session in the app). */
export function resetAssetsSession(): void {
  manifestRead = null;
  musicCache.clear();
  lookCache.clear();
}

/** The track's bytes (MOD-Assets public surface). */
export const musicBytes = async (id: string): Promise<ArrayBuffer> => (await musicBlob(id)).arrayBuffer();
