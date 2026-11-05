// MOD-App / MOD-Build — the in-tool licence notices (F-020.R4): what the view lists is decided at build
// time from the dependency registry and MOD-Core's music catalog, so it can be checked without a browser.
import { describe, expect, it } from 'vitest';
import type { MusicTrack } from '../../src/core';
import { MUSIC_TRACKS } from '../../src/core';
import { NOTICE_CODE, NOTICE_FONTS } from '../../src/app/notices.gen';
import { noticeSections } from '../../src/app/notices';
// @ts-expect-error -- plain ESM build script without type declarations
import { findInstalled, isActive, isShipped, readRegistry } from '../../scripts/lib/registry.mjs';

interface Row {
  readonly names: readonly string[];
  readonly id: string;
}

/** Every npm package the registry says is shipped (runtime or asset) and that is installed. */
const shipped = (): string[] =>
  (readRegistry() as Row[])
    .filter((r) => isActive(r) && isShipped(r))
    .flatMap((r) => r.names)
    .filter((name) => findInstalled(name) !== null);

const tracks: readonly MusicTrack[] = [
  { id: 'm1', title: 'Morning Walk', source: 'freemusicarchive.org/music/x', licence: 'CC0 1.0', duration: 1 },
  { id: 'm2', title: 'Night Market', source: 'archive.org/details/y', licence: 'Public domain', duration: 2 },
];

describe('F-020 licence notices', () => {
  it('F-020.AC4 the notices list every shipped dependency and typeface of the registry, each with title, source and licence', () => {
    const listed = [...NOTICE_FONTS, ...NOTICE_CODE].map((r) => r.source.replace('npmjs.com/package/', ''));
    expect(listed.sort()).toEqual(shipped().sort());
    for (const r of [...NOTICE_FONTS, ...NOTICE_CODE]) {
      expect(r.title.trim(), r.source).not.toBe('');
      expect(r.licence.trim(), r.source).not.toBe('');
    }
    // The five typefaces (DEP-06..10) by family name, not as code.
    expect(NOTICE_FONTS.map((r) => r.title)).toEqual([
      'Manrope',
      'JetBrains Mono',
      'Anton',
      'Playfair Display',
      'Nunito',
    ]);
    expect(NOTICE_CODE.some((r) => r.source.includes('@fontsource'))).toBe(false);
  });

  it('F-020.AC4 RULE-12 every bundled music track is listed with its title, source and licence', () => {
    const music = noticeSections(tracks).find((s) => s.heading === 'music.title');
    expect(music?.rows).toEqual([
      { title: 'Morning Walk', source: 'freemusicarchive.org/music/x', licence: 'CC0 1.0' },
      { title: 'Night Market', source: 'archive.org/details/y', licence: 'Public domain' },
    ]);
    // The shipped catalog is the default: every track of MOD-Core is in the view.
    const shippedMusic = noticeSections().find((s) => s.heading === 'music.title');
    expect(shippedMusic?.rows.length).toBe(MUSIC_TRACKS.length);
  });

  it('F-020.R4 the sections are typefaces, code and music, in that order (CMP-StatusBar)', () => {
    expect(noticeSections(tracks).map((s) => s.heading)).toEqual(['notices.fonts', 'notices.code', 'music.title']);
  });
});
