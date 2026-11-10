// MOD-Copy over the generated catalog (RULE-18; F-022.R1).
import { describe, expect, it } from 'vitest';
import { DEFAULT_LANGUAGE, LANGUAGES, translate } from '../../src/copy';
import { CATALOG, type MessageId } from '../../src/copy/messages.gen';

const placeholders = (entry: string | Readonly<Record<string, string | undefined>>): string[] => {
  const text = typeof entry === 'string' ? entry : Object.values(entry).join(' ');
  return [...new Set([...text.matchAll(/\{([a-zA-Z]\w*)\}/g)].map((m) => m[1]!))].sort();
};

describe('MOD-Copy', () => {
  it('RULE-18 supports en-US (the default) and vi-VN', () => {
    expect(LANGUAGES).toEqual(['en-US', 'vi-VN']);
    expect(DEFAULT_LANGUAGE).toBe('en-US');
  });

  it('F-022.R1 the generated catalog has every COPY ID in every language', () => {
    expect(Object.keys(CATALOG['vi-VN'])).toEqual(Object.keys(CATALOG['en-US']));
  });

  it('F-022.R1 every COPY ID has a non-empty text in en-US and vi-VN with the same placeholders', () => {
    const ids = Object.keys(CATALOG['en-US']) as MessageId[];
    expect(ids.length).toBeGreaterThan(250);
    const problems: string[] = [];
    for (const id of ids) {
      for (const lang of LANGUAGES) {
        const entry = CATALOG[lang][id];
        const texts = typeof entry === 'string' ? [entry] : Object.values(entry);
        if (!texts.length || texts.some((s) => typeof s !== 'string' || !s.trim()))
          problems.push(`${lang} ${id} empty`);
      }
      if (placeholders(CATALOG['en-US'][id]).join() !== placeholders(CATALOG['vi-VN'][id]).join())
        problems.push(`${id} placeholders differ`);
    }
    expect(problems).toEqual([]);
  });

  it('F-022.R1 COPY-privacy.badge reads in each language', () => {
    expect(translate('en-US', 'privacy.badge')).toBe('Your media never leaves this device');
    expect(translate('vi-VN', 'privacy.badge')).toBe('Tệp của bạn không bao giờ rời khỏi máy này');
  });
});
