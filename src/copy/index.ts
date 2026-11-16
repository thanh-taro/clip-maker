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

/**
 * A number field's shown text (style.md "Number fields"): the language's decimal mark, no group marks,
 * at most `fractionDigits` decimals, so the text reads back through `parseNumber`.
 */
export function formatField(value: number, lang: Language = language.value, fractionDigits = 0): string {
  return new Intl.NumberFormat(lang, { useGrouping: false, maximumFractionDigits: fractionDigits }).format(value);
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const numberPatterns = new Map<Language, { re: RegExp; group: string; decimal: string }>();

/** The language's decimal and group marks, from Intl's own parts (platform-mapping "Number fields"). */
function numberPattern(lang: Language): { re: RegExp; group: string; decimal: string } {
  let p = numberPatterns.get(lang);
  if (!p) {
    const parts = new Intl.NumberFormat(lang).formatToParts(12345.6);
    const group = parts.find((x) => x.type === 'group')?.value ?? ',';
    const decimal = parts.find((x) => x.type === 'decimal')?.value ?? '.';
    const g = escapeRe(group);
    const d = escapeRe(decimal);
    // Optional sign; digits, either plain or grouped in threes after a first group of one to three;
    // an optional decimal part. At least one digit somewhere (checked below).
    const re = new RegExp(`^([-−+]?)(\\d*|\\d{1,3}(?:${g}\\d{3})+)(?:${d}(\\d*))?$`);
    p = { re, group, decimal };
    numberPatterns.set(lang, p);
  }
  return p;
}

/**
 * A typed number read with the language's decimal and group marks (style.md "Number fields"; vi-VN
 * "50,5" is 50.5 and "1.000" is 1000). Null when it can't be read: empty, junk, the other language's
 * marks where they don't form a valid number (never guessed), exponents, or a non-finite value.
 * Implements: style.md "Number fields" (build question 121).
 */
export function parseNumber(text: string, lang: Language = language.value): number | null {
  const m = numberPattern(lang).re.exec(text.trim());
  if (!m) return null;
  const [, sign = '', whole = '', fraction = ''] = m;
  if (whole === '' && fraction === '') return null;
  const digits = whole.replace(/\D/g, '');
  const value = Number(`${digits || '0'}.${fraction || '0'}`);
  if (!Number.isFinite(value)) return null;
  return sign === '-' || sign === '−' ? -value : value;
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
 *
 * Only quantities (counts, sizes, rates, percentages) are passed as numbers, because every number is
 * grouped and given the language's decimal mark. Labels that look numeric but are technical names stay
 * strings: resolution labels (`1080p`), aspect ratios (`9:16`), durations from `formatDuration` and
 * sizes already written by `formatMB` are passed as strings so they are never regrouped (vi-VN would
 * turn a number 1080 into `1.080`).
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
 * 10 minutes), in whole seconds rounded down, written for `lang` (F-022.AC7 `1:05`). A negative or
 * non-finite value (NaN, Infinity) reads `0:00`. Uses
 * Intl.DurationFormat where present, else the same digits through Intl.NumberFormat (ADR-0002 §3).
 */
export function formatDuration(micros: number, lang: Language = language.value): string {
  // Some recordings (WebM from MediaRecorder) report an unknown length as Infinity, or NaN.
  if (!Number.isFinite(micros) || micros < 0) micros = 0;
  const total = Math.floor(micros / SECOND_US + 1e-9);
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

/**
 * Implements: F-002.R5, COPY-time.position notes, CMP-Preview "default" (D-039) — the transport's
 * current time: `m:ss` of the frame's whole second and, as a separate suffix the UI shows muted, the
 * frame number inside that second (`·12`, two digits; rates go up to 60). The frame is the one whose
 * interval holds the time (frame k starts at floor(k × 1,000,000 ÷ rate) µs, rules.md "Frame times").
 */
export function formatTimecode(
  micros: number,
  rate: number,
  lang: Language = language.value,
): { readonly time: string; readonly frame: string } {
  const t = Number.isFinite(micros) && micros > 0 ? micros : 0;
  const start = (k: number) => Math.floor((k * SECOND_US) / rate);
  let k = Math.floor((t * rate) / SECOND_US);
  while (start(k + 1) <= t) k++;
  while (k > 0 && start(k) > t) k--;
  const second = Math.floor(k / rate);
  const two = new Intl.NumberFormat(lang, { minimumIntegerDigits: 2, useGrouping: false });
  return { time: formatDuration(second * SECOND_US, lang), frame: `·${two.format(k - second * rate)}` };
}
