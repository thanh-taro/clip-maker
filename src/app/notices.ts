// MOD-App — the in-tool licence notices (F-020.R4, CMP-StatusBar "licence notices view"). The rows are
// compiled into the page (scripts/gen-notices.mjs → notices.gen.ts; platform-mapping "Licence notices
// in the tool"), so the view opens offline and makes no request. Bundled music (ENT-MusicTrack,
// RULE-12) is listed from MOD-Core's catalog with each track's title, source and licence.
import { MUSIC_TRACKS, type MusicTrack } from '../core';
import { NOTICE_CODE, NOTICE_FONTS } from './notices.gen';

/** One row of a notices table: COPY-notices.col_title, col_source, col_licence. */
export interface NoticeRow {
  readonly title: string;
  readonly source: string;
  readonly licence: string;
}

export interface NoticeSection {
  /** The section heading (COPY-notices.fonts, COPY-notices.code, COPY-music.title). */
  readonly heading: 'notices.fonts' | 'notices.code' | 'music.title';
  readonly rows: readonly NoticeRow[];
}

// Implements: F-020.R4 — every shipped typeface, code package and bundled music track.
export function noticeSections(tracks: readonly MusicTrack[] = MUSIC_TRACKS): readonly NoticeSection[] {
  return [
    { heading: 'notices.fonts', rows: NOTICE_FONTS },
    { heading: 'notices.code', rows: NOTICE_CODE },
    {
      heading: 'music.title',
      rows: tracks.map(({ title, source, licence }) => ({ title, source, licence })),
    },
  ];
}
