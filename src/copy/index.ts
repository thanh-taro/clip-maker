// MOD-Copy — generated user-facing strings, active language, number and plural formatting
// (specs/40-technical/modules/MOD-Copy.md, ADR-0002 §3). Copied from the sibling image-annotator.
// A dependency-free leaf: it imports no other module. The catalog is generated from copy.md by
// scripts/gen-copy.mjs (messages.gen.ts).
// Implements: RULE-18 (en-US default; numbers and plurals in the active language), F-022.R1, F-022.R5.
// It never formats anything that goes into an export (INV-05).
import { signal } from '@preact/signals';
import { CATALOG, LANGUAGES, PLURAL_IDS, type Language, type MessageId, type MessageParams } from './messages.gen';

export { LANGUAGES, type Language, type MessageId, type MessageParams } from './messages.gen';

/** RULE-18: the default language. */
export const DEFAULT_LANGUAGE: Language = LANGUAGES[0];

/** The active language; set by MOD-Host (address, then accepted host messages). */
export const language = signal<Language>(DEFAULT_LANGUAGE);

/** A number written for the active language (vi-VN `1.920`, F-022.R5). */
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
  const params = (args[0] ?? {}) as Record<string, string | number>;
  const entry = CATALOG[lang][id];
  let text: string;
  if (typeof entry === 'string') text = entry;
  else {
    const count = Number(params['count']);
    const category = PLURAL_IDS.has(id) ? new Intl.PluralRules(lang).select(count) : 'other';
    text = entry[category] ?? entry.other;
  }
  return text.replace(/\{([a-zA-Z]\w*)\}/g, (whole, name: string) => {
    const v = params[name];
    if (v === undefined) return whole;
    return typeof v === 'number' ? formatNumber(v, lang) : v;
  });
}

// RULE-18 durations, time codes and sizes — built with the features that show them (F-002, F-015).
const later = (what: string): never => {
  throw new Error(`not implemented yet: MOD-Copy ${what}`);
};
export const formatDuration = (_micros: number, _lang: Language = language.value): string => later('formatDuration');
export const formatTimecode = (_micros: number, _rate: number): string => later('formatTimecode');
export const formatMB = (_bytes: number, _lang: Language = language.value): string => later('formatMB');
