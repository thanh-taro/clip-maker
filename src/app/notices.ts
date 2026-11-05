// MOD-App — the in-tool licence notices (F-020.R4, CMP-StatusBar "licence notices view"). The rows are
// compiled into the page (scripts/gen-notices.mjs → notices.gen.ts; platform-mapping "Licence notices
// in the tool"), so the view opens offline and makes no request. Bundled music (ENT-MusicTrack,
// RULE-12) is listed from MOD-Core's catalog with each track's title, source and licence.
import { MUSIC_TRACKS, type MusicTrack } from '../core';
import { NOTICE_CODE, NOTICE_FONTS, NOTICE_TEXTS } from './notices.gen';

/** One row of a notices table: COPY-notices.col_title, col_source, col_licence. */
export interface NoticeRow {
  readonly title: string;
  readonly source: string;
  readonly licence: string;
}

/** A notice a licence requires to be shown with the work, in full (e.g. DEP-11's Feather MIT notice). */
export interface NoticeText {
  readonly title: string;
  readonly text: string;
}

export interface NoticeSection {
  /** The section heading (COPY-notices.fonts, COPY-notices.code, COPY-music.title). */
  readonly heading: 'notices.fonts' | 'notices.code' | 'music.title';
  readonly rows: readonly NoticeRow[];
  /** Required notices shown under the table. */
  readonly texts: readonly NoticeText[];
}

// Implements: F-020.R4 — every shipped typeface, code package, asset and bundled music track.
export function noticeSections(tracks: readonly MusicTrack[] = MUSIC_TRACKS): readonly NoticeSection[] {
  return [
    { heading: 'notices.fonts', rows: NOTICE_FONTS, texts: [] },
    { heading: 'notices.code', rows: NOTICE_CODE, texts: NOTICE_TEXTS },
    {
      heading: 'music.title',
      rows: tracks.map(({ title, source, licence }) => ({ title, source, licence })),
      texts: [],
    },
  ];
}
