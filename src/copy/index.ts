// MOD-Copy — generated user-facing strings, active language, number, duration, size and plural
// formatting (specs/40-technical/modules/MOD-Copy.md, ADR-0002 §3). Copied from the sibling
// image-annotator. A dependency-free leaf: it imports no other module. The catalog is generated from
// copy.md by scripts/gen-copy.mjs (messages.gen.ts).
// Implements: RULE-18 (en-US default; numbers, durations, sizes and plurals in the active language),
// F-022.R1, F-022.R5. Formatting uses Intl only (platform-mapping "Numbers and durations"), never the
// network. It never formats anything that goes into an export (INV-05, F-022.R4).
import { signal } from '@preact/signals';
import {
  CATALOG,
  LANGUAGES,
  type Language,
  type MessageId,
  type MessageParams,
  type PluralForms,
} from './messages.gen';

export { LANGUAGES, type Language, type MessageId, type MessageParams, type PluralForms } from './messages.gen';

/** RULE-18: the default language. */
export const DEFAULT_LANGUAGE: Language = LANGUAGES[0];

/**
 * The active language; set by MOD-Host (address, browser, then accepted host messages). Components
 * that call `t()` while rendering read it, so a change re-renders them in place (F-022.R2).
 */
export const language = signal<Language>(DEFAULT_LANGUAGE);

/** The writing direction of every supported language (RULE-18: en-US and vi-VN are left to right). */
export const DIRECTION: { readonly [L in Language]: 'ltr' | 'rtl' } = { 'en-US': 'ltr', 'vi-VN': 'ltr' };

/** A number written for the active language (vi-VN `1.920`, `0,1`; F-022.R5). */
export function formatNumber(value: number, lang: Language = language.value): string {
  return new Intl.NumberFormat(lang).format(value);
}

type Args<K extends MessageId> = MessageParams[K] extends undefined ? [] : [params: MessageParams[K]];

/**
 * The text of a COPY string in the active language, with its placeholders filled. Numbers are
 * formatted for the language; a plural string picks its form by `{count}` (Intl.PluralRules).
 */
export function t<K extends MessageId>(id: K, ...args: Args<K>): string {
  return translate(language.value, id, ...args);
}

/** `t()` for an explicit language (tests and the language switch). */
export function translate<K extends MessageId>(lang: Language, id: K, ...args: Args<K>): string {
  return formatText(lang, CATALOG[lang][id], (args[0] ?? {}) as Record<string, string | number>);
}

/**
 * One catalog text in `lang` with its placeholders filled. Plural forms (`one: … · other: …` in
 * copy.md) are chosen by `{count}` with Intl.PluralRules, so vi-VN, which has one form, never changes;
 * number values are written the language's way (F-022.R5, AC7).
 */
export function formatText(
  lang: Language,
  entry: string | PluralForms,
  params: Readonly<Record<string, string | number>> = {},
): string {
  let text: string;
  if (typeof entry === 'string') text = entry;
  else {
    const category = new Intl.PluralRules(lang).select(Number(params['count']));
    text = entry[category] ?? entry.other;
  }
  return text.replace(/\{([a-zA-Z]\w*)\}/g, (whole, name: string) => {
    const v = params[name];
    if (v === undefined) return whole;
    return typeof v === 'number' ? formatNumber(v, lang) : v;
  });
}

const SECOND_US = 1_000_000;
/** RULE-15: 1 MB is 1,000,000 bytes. */
const MB = 1_000_000;

interface DurationFormatter {
  format(d: { hours?: number; minutes: number; seconds: number }): string;
}
type DurationFormatCtor = new (lang: string, options: Record<string, string>) => DurationFormatter;

/**
 * A duration or time position as `m:ss` (`h:mm:ss` from an hour, never reached under RULE-03's
 * 10 minutes), in whole seconds rounded down, written for `lang` (F-022.AC7 `1:05`). Uses
 * Intl.DurationFormat where present, else the same digits through Intl.NumberFormat (ADR-0002 §3).
 */
export function formatDuration(micros: number, lang: Language = language.value): string {
  const total = Math.max(0, Math.floor(micros / SECOND_US + 1e-9));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const DurationFormat = (Intl as unknown as { DurationFormat?: DurationFormatCtor }).DurationFormat;
  if (DurationFormat) {
    const options: Record<string, string> = hours
      ? { hours: 'numeric', minutes: '2-digit', seconds: '2-digit' }
      : { minutes: 'numeric', seconds: '2-digit' };
    return new DurationFormat(lang, options).format(hours ? { hours, minutes, seconds } : { minutes, seconds });
  }
  const whole = new Intl.NumberFormat(lang, { useGrouping: false });
  const two = new Intl.NumberFormat(lang, { minimumIntegerDigits: 2, useGrouping: false });
  return hours
    ? `${whole.format(hours)}:${two.format(minutes)}:${two.format(seconds)}`
    : `${whole.format(minutes)}:${two.format(seconds)}`;
}

/**
 * A size in bytes as megabytes (1 MB = 1,000,000 bytes, RULE-15) with at most one decimal, written for
 * `lang`: vi-VN `1.234,5`, en-US `1,234.5` (F-022.AC5). The unit comes from the COPY text (`{size} MB`).
 */
export function formatMB(bytes: number, lang: Language = language.value): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(bytes / MB);
}

// The preview's time code (m:ss plus a separate frame number, COPY-time.position notes) comes with F-002.
export const formatTimecode = (_micros: number, _rate: number): string => {
  throw new Error('not implemented yet: MOD-Copy formatTimecode (F-002)');
};
