// MOD-Assets — the bundled music (F-011.R6/R7, NFR-01, NFR-10, DEP-14): the catalogue from the checked pack,
// and the files read only from the tool's own compiled-in paths, once per session.
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM build script without type declarations
import { musicPack, MUSIC_BUDGET } from '../../scripts/gen-music-manifest.mjs';
import { MUSIC_FILES, mayFetch, musicBlob, musicTracks, PLACEHOLDER_MUSIC } from '../../src/assets';
import { MUSIC_TRACKS } from '../../src/core';

describe('MOD-Assets bundled music', () => {
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

  it('F-011.R7 NFR-01 a track is read from its own-origin path only, by GET, once per session', async () => {
    const id = MUSIC_TRACKS[0]!.id;
    const asked: string[] = [];
    const fetcher = async (path: string) => {
      asked.push(path);
      return { ok: true, status: 200, blob: async () => new Blob(['m4a']) };
    };
    const a = await musicBlob(id, fetcher);
    const b = await musicBlob(id, fetcher);
    expect(a).toBe(b);
    expect(asked).toEqual([MUSIC_FILES[id]]);
    expect(mayFetch(MUSIC_FILES[id]!, new Set())).toBe(true);
    expect(mayFetch(`${MUSIC_FILES[id]!}?x=1`, new Set())).toBe(false);
    await expect(musicBlob('not-a-track', fetcher)).rejects.toThrow(/NotFoundError/);
    expect(asked).toHaveLength(1);
  });

  it('F-011.R7 a failed read is tried again the next time', async () => {
    const id = MUSIC_TRACKS[1]!.id;
    let n = 0;
    const fetcher = async () => {
      n++;
      return n === 1
        ? { ok: false, status: 503, blob: async () => new Blob() }
        : { ok: true, status: 200, blob: async () => new Blob(['ok']) };
    };
    await expect(musicBlob(id, fetcher)).rejects.toThrow(/NetworkError/);
    await expect(musicBlob(id, fetcher)).resolves.toBeInstanceOf(Blob);
    expect(n).toBe(2);
  });
});
