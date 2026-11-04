// MOD-Assets — looks, music and the asset manifest from the tool's own origin
// (specs/40-technical/modules/MOD-Assets.md, ADR-0013, ADR-0014, ADR-0015). The only module allowed to
// call `fetch` (lint-enforced), and only for same-origin paths listed in the build-generated asset
// manifest: GET, no query string, no body. Phase 3.3 scaffold: the guard; loading comes with F-008,
// F-011 and F-021.
import { notImplemented, type LookId } from '../core';

/** The build-generated manifest of every file the tool can need (ADR-0015). */
export const MANIFEST_PATH = '/asset-manifest.json';

/**
 * Is `path` one the tool may fetch? Implements: NFR-01 / ADR-0014 (own files only): a root-relative
 * path with no scheme, host, query or fragment, listed in the manifest.
 */
export function mayFetch(path: string, manifest: ReadonlySet<string>): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  if (/[?#\\]/.test(path)) return false;
  return path === MANIFEST_PATH || manifest.has(path);
}

export const looks = (): Promise<readonly LookId[]> => notImplemented('MOD-Assets looks');
export const musicTracks = (): Promise<never[]> => notImplemented('MOD-Assets musicTracks');
export const musicBytes = (_id: string): Promise<ArrayBuffer> => notImplemented('MOD-Assets musicBytes');
