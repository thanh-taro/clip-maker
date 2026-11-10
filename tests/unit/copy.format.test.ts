// MOD-Copy number, duration, size and plural formatting per the active language (RULE-18, F-022.R5).
import { afterEach, describe, expect, it } from 'vitest';
import { formatDuration, formatMB, formatNumber, formatText, language, t, translate } from '../../src/copy';

const SECOND = 1_000_000;

afterEach(() => {
  language.value = 'en-US';
});

describe('MOD-Copy formatting', () => {
  it('F-022.AC5 in vi-VN an estimated size of 1234.5 MB reads 1.234,5 MB', () => {
    const bytes = 1234.5 * 1_000_000; // RULE-15: 1 MB = 1,000,000 bytes
    expect(formatMB(bytes, 'vi-VN')).toBe('1.234,5');
    expect(translate('vi-VN', 'export.estimate', { size: formatMB(bytes, 'vi-VN') })).toBe('Khoảng 1.234,5 MB');
    expect(translate('en-US', 'export.estimate', { size: formatMB(bytes, 'en-US') })).toBe('About 1,234.5 MB');
  });

  it('F-022.R5 sizes follow the active language when none is given', () => {
    language.value = 'vi-VN';
    expect(formatMB(8_040_000)).toBe('8');
    expect(formatMB(12_345_678)).toBe('12,3');
    expect(t('export.estimate', { size: formatMB(12_345_678) })).toBe('Khoảng 12,3 MB');
    language.value = 'en-US';
    expect(formatMB(12_345_678)).toBe('12.3');
  });

  it('F-022.R5 numbers use the language decimal and group marks (0,1 giây)', () => {
    expect(formatNumber(0.1, 'vi-VN')).toBe('0,1');
    expect(formatNumber(0.1, 'en-US')).toBe('0.1');
    expect(formatNumber(1920, 'vi-VN')).toBe('1.920');
    expect(formatNumber(1920, 'en-US')).toBe('1,920');
    // A number placeholder is formatted for the language it is shown in.
    expect(translate('vi-VN', 'action.use_target', { size: 1234.5 })).toBe('Dùng 1.234,5 MB');
  });

  it('F-022.AC7 in en-US a 1-minute-5-second duration reads 1:05', () => {
    expect(formatDuration(65 * SECOND, 'en-US')).toBe('1:05');
    expect(formatDuration(65 * SECOND, 'vi-VN')).toBe('1:05');
    language.value = 'vi-VN';
    expect(formatDuration(65 * SECOND)).toBe('1:05');
  });

  it('F-022.R5 durations are m:ss, whole seconds, up to the 10-minute limit', () => {
    expect(formatDuration(0, 'en-US')).toBe('0:00');
    expect(formatDuration(4.99 * SECOND, 'en-US')).toBe('0:04');
    expect(formatDuration(600 * SECOND, 'vi-VN')).toBe('10:00');
    expect(formatDuration(3725 * SECOND, 'en-US')).toBe('1:02:05');
    expect(formatDuration(-1, 'en-US')).toBe('0:00');
  });

  it('F-022.R5 durations are the same without Intl.DurationFormat (own formatting)', () => {
    const intl = Intl as unknown as Record<string, unknown>;
    const saved = intl['DurationFormat'];
    try {
      delete intl['DurationFormat'];
      expect(formatDuration(65 * SECOND, 'en-US')).toBe('1:05');
      expect(formatDuration(3725 * SECOND, 'vi-VN')).toBe('1:02:05');
    } finally {
      intl['DurationFormat'] = saved;
    }
  });

  it('F-022.AC7 a clip count reads 1 clip and 3 clips in en-US, with no plural change in vi-VN', () => {
    // No COPY string shows a bare clip count yet (build-spec-questions Q67); this checks the plural
    // mechanism every `one: … · other: …` COPY text goes through.
    const en = { one: '{count} clip', other: '{count} clips' };
    const vi = { other: '{count} clip' };
    expect(formatText('en-US', en, { count: 1 })).toBe('1 clip');
    expect(formatText('en-US', en, { count: 3 })).toBe('3 clips');
    expect(formatText('vi-VN', vi, { count: 1 })).toBe('1 clip');
    expect(formatText('vi-VN', vi, { count: 3 })).toBe('3 clip');
    expect(formatText('en-US', en, { count: 1234 })).toBe('1,234 clips');
    expect(formatText('vi-VN', vi, { count: 1234 })).toBe('1.234 clip');
  });
});
