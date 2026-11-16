// MOD-Assets — looks, music and the asset manifest from the tool's own origin
// (specs/40-technical/modules/MOD-Assets.md, ADR-0013, ADR-0014, ADR-0015). The only module allowed to
// call `fetch` (lint-enforced), and only for same-origin paths listed in the build-generated asset
// manifest: GET, no query string, no body. Built: the guard (F-021) and the bundled music files (F-011);
// looks come with F-008.
import { MUSIC_TRACKS, notImplemented, type LookId, type MusicTrack } from '../core';
import { MUSIC_FILES } from './music.gen';

export { MUSIC_FILES, PLACEHOLDER_MUSIC } from './music.gen';

/** The build-generated manifest of every file the tool can need (ADR-0015). */
export const MANIFEST_PATH = '/asset-manifest.json';

/** The bundled music files' own-origin paths, compiled into the tool (each is also in the manifest). */
const MUSIC_PATHS: ReadonlySet<string> = new Set(Object.values(MUSIC_FILES));

/**
 * Is `path` one the tool may fetch? Implements: NFR-01 / ADR-0014 (own files only): a root-relative
 * path with no scheme, host, query or fragment, listed in the manifest or one of the bundled music files
 * compiled into the tool (F-011.R7).
 */
export function mayFetch(path: string, manifest: ReadonlySet<string>): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  if (/[?#\\]/.test(path)) return false;
  return path === MANIFEST_PATH || manifest.has(path) || MUSIC_PATHS.has(path);
}

export const looks = (): Promise<readonly LookId[]> => notImplemented('MOD-Assets looks');

/** F-011.R6: the bundled tracks (ENT-MusicTrack) — title, source, licence and duration. */
export const musicTracks = (): readonly MusicTrack[] => MUSIC_TRACKS;

/** The fetch MOD-Assets uses (injected in tests). */
export type Fetcher = (path: string) => Promise<{ ok: boolean; status: number; blob(): Promise<Blob> }>;

const musicCache = new Map<string, Promise<Blob>>();

/**
 * Implements: F-011.R7, NFR-01 — bundled track `id`'s file from the tool's own origin: a GET of its
 * compiled-in path, nothing else; the service worker serves it from the offline precache (ADR-0015), so
 * once the tool has been visited it needs no network. Kept for the session after the first read.
 */
export function musicBlob(
  id: string,
  fetcher: Fetcher = (p) => fetch(p, { method: 'GET', credentials: 'same-origin' }),
): Promise<Blob> {
  const path = MUSIC_FILES[id];
  if (!path || !mayFetch(path, new Set())) return Promise.reject(new Error(`NotFoundError: no bundled track ${id}`));
  let got = musicCache.get(id);
  if (!got) {
    got = fetcher(path).then(async (r) => {
      if (!r.ok) throw new Error(`NetworkError: ${path} answered ${r.status}`);
      return r.blob();
    });
    // A failed read is tried again next time.
    got.catch(() => musicCache.delete(id));
    musicCache.set(id, got);
  }
  return got;
}

/** The track's bytes (MOD-Assets public surface). */
export const musicBytes = async (id: string): Promise<ArrayBuffer> => (await musicBlob(id)).arrayBuffer();
