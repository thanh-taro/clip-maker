// MOD-Copy over the generated catalog (RULE-18; F-022.R1).
import { describe, expect, it } from 'vitest';
import { DEFAULT_LANGUAGE, LANGUAGES, translate } from '../../src/copy';
import { CATALOG } from '../../src/copy/messages.gen';

describe('MOD-Copy', () => {
  it('RULE-18 supports en-US (the default) and vi-VN', () => {
    expect(LANGUAGES).toEqual(['en-US', 'vi-VN']);
    expect(DEFAULT_LANGUAGE).toBe('en-US');
  });

  it('F-022.R1 the generated catalog has every COPY ID in every language', () => {
    expect(Object.keys(CATALOG['vi-VN'])).toEqual(Object.keys(CATALOG['en-US']));
  });

  it('F-022.R1 COPY-privacy.badge reads in each language', () => {
    expect(translate('en-US', 'privacy.badge')).toBe('Your media never leaves this device');
    expect(translate('vi-VN', 'privacy.badge')).toBe('Tệp của bạn không bao giờ rời khỏi máy này');
  });
});
