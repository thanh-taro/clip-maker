// MOD-Assets — the bundled music (F-011.R6/R7, NFR-01, NFR-10, DEP-14): the catalogue from the checked pack,
// and the files read only from the tool's own compiled-in paths, once per session.
import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM build script without type declarations
import { musicPack, MUSIC_BUDGET } from '../../scripts/gen-music-manifest.mjs';
import {
  MANIFEST_PATH,
  MUSIC_FILES,
  mayFetch,
  musicBlob,
  musicTracks,
  PLACEHOLDER_MUSIC,
  resetAssetsSession,
  type Fetcher,
} from '../../src/assets';
import { MUSIC_TRACKS } from '../../src/core';

/** The own origin as the tests see it: the asset manifest lists `listed`; every request is recorded. */
function origin(
  listed: readonly string[],
  answer: (path: string, n: number) => { ok: boolean; status: number } = () => ({ ok: true, status: 200 }),
) {
  const asked: string[] = [];
  const fetcher: Fetcher = async (path) => {
    asked.push(path);
    if (path === MANIFEST_PATH) {
      const body = JSON.stringify({ version: 'v1', files: Object.fromEntries(listed.map((p) => [p, 'h'])) });
      return { ok: true, status: 200, blob: async () => new Blob([body]) };
    }
    const r = answer(path, asked.filter((p) => p === path).length);
    return { ...r, blob: async () => new Blob(['m4a']) };
  };
  return { asked, fetcher };
}

describe('MOD-Assets bundled music', () => {
  beforeEach(() => resetAssetsSession());

  it('F-011.R6 RULE-12 every bundled track has an id, title, source, licence and duration, from the checked pack', () => {
    const pack = musicPack() as { tracks: { id: string; durationUs: number; placeholder?: boolean }[]; total: number };
    expect(musicTracks()).toBe(MUSIC_TRACKS);
    expect(MUSIC_TRACKS.map((t) => t.id)).toEqual(pack.tracks.map((t) => t.id));
    for (const t of MUSIC_TRACKS) {
      for (const k of ['title', 'source', 'licence'] as const) expect(t[k].trim().length).toBeGreaterThan(0);
      expect(t.duration).toBeGreaterThan(0);
      expect(MUSIC_FILES[t.id]).toMatch(/^\/.+\.m4a$/);
    }
    expect(PLACEHOLDER_MUSIC).toEqual(pack.tracks.filter((t) => t.placeholder).map((t) => t.id));
  });

  it('NFR-10 the music pack is within its 10 MB budget', () => {
    expect(MUSIC_BUDGET).toBe(10_000_000);
    expect((musicPack() as { total: number }).total).toBeLessThanOrEqual(MUSIC_BUDGET);
  });

  it('F-011.R7 NFR-01 a track is read from its own-origin path only, by GET, once per session, after the asset manifest lists it', async () => {
    const id = MUSIC_TRACKS[0]!.id;
    const { asked, fetcher } = origin(Object.values(MUSIC_FILES));
    const a = await musicBlob(id, fetcher);
    const b = await musicBlob(id, fetcher);
    expect(a).toBe(b);
    expect(asked).toEqual([MANIFEST_PATH, MUSIC_FILES[id]]);
    // The guard: listed paths only; a compiled-in path alone is not enough (ADR-0015).
    expect(mayFetch(MUSIC_FILES[id]!, new Set())).toBe(false);
    expect(mayFetch(MUSIC_FILES[id]!, new Set([MUSIC_FILES[id]!]))).toBe(true);
    expect(mayFetch(`${MUSIC_FILES[id]!}?x=1`, new Set([`${MUSIC_FILES[id]!}?x=1`]))).toBe(false);
    await expect(musicBlob('not-a-track', fetcher)).rejects.toThrow(/NotFoundError/);
    expect(asked).toHaveLength(2);
  });

  it('NFR-01 ADR-0015 a track the asset manifest does not list is never requested', async () => {
    const [first, second] = MUSIC_TRACKS;
    const { asked, fetcher } = origin([MUSIC_FILES[first!.id]!]);
    await expect(musicBlob(second!.id, fetcher)).rejects.toThrow(/not in the asset manifest/);
    await expect(musicBlob(first!.id, fetcher)).resolves.toBeInstanceOf(Blob);
    // The manifest is read once for the session.
    expect(asked).toEqual([MANIFEST_PATH, MUSIC_FILES[first!.id]]);
  });

  it('F-011.R7 a failed read is tried again the next time', async () => {
    const id = MUSIC_TRACKS[1]!.id;
    const { asked, fetcher } = origin(Object.values(MUSIC_FILES), (_p, n) =>
      n === 1 ? { ok: false, status: 503 } : { ok: true, status: 200 },
    );
    await expect(musicBlob(id, fetcher)).rejects.toThrow(/NetworkError/);
    await expect(musicBlob(id, fetcher)).resolves.toBeInstanceOf(Blob);
    expect(asked.filter((p) => p === MUSIC_FILES[id])).toHaveLength(2);
  });

  it('F-011.R7 a failed manifest read is tried again the next time', async () => {
    const id = MUSIC_TRACKS[0]!.id;
    let n = 0;
    const fetcher: Fetcher = async (path) => {
      if (path === MANIFEST_PATH && ++n === 1) return { ok: false, status: 503, blob: async () => new Blob() };
      const body = path === MANIFEST_PATH ? JSON.stringify({ files: { [MUSIC_FILES[id]!]: 'h' } }) : 'm4a';
      return { ok: true, status: 200, blob: async () => new Blob([body]) };
    };
    await expect(musicBlob(id, fetcher)).rejects.toThrow(/NetworkError/);
    await expect(musicBlob(id, fetcher)).resolves.toBeInstanceOf(Blob);
    expect(n).toBe(2);
  });
});
