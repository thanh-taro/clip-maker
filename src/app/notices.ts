// MOD-App — the in-tool licence notices (F-020.R4, CMP-StatusBar "licence notices view"). The rows are
// compiled into the page (scripts/gen-notices.mjs → notices.gen.ts; platform-mapping "Licence notices
// in the tool"), so the view opens offline and makes no request. The tool ships no music (D-052), so
// there is no music section.
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
  /** The section heading (COPY-notices.fonts, COPY-notices.code). */
  readonly heading: 'notices.fonts' | 'notices.code';
  readonly rows: readonly NoticeRow[];
  /** Required notices shown under the table. */
  readonly texts: readonly NoticeText[];
}

// Implements: F-020.R4 — every shipped typeface, code package and asset (no music, D-052).
export function noticeSections(): readonly NoticeSection[] {
  return [
    { heading: 'notices.fonts', rows: NOTICE_FONTS, texts: [] },
    { heading: 'notices.code', rows: NOTICE_CODE, texts: NOTICE_TEXTS },
  ];
}
