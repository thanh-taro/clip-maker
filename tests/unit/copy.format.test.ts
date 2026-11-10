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

  it('F-022.R5 an unknown, infinite or negative duration reads 0:00', () => {
    // WebM recordings can report their length as Infinity.
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1])
      for (const lang of ['en-US', 'vi-VN'] as const) expect(formatDuration(v, lang)).toBe('0:00');
  });

  it('F-022.AC7 COPY-notice.added reads Added 1 file and Added 3 files in en-US, with no plural change in vi-VN', () => {
    expect(translate('en-US', 'notice.added', { count: 1 })).toBe('Added 1 file');
    expect(translate('en-US', 'notice.added', { count: 3 })).toBe('Added 3 files');
    expect(translate('vi-VN', 'notice.added', { count: 1 })).toBe('Đã thêm 1 tệp');
    expect(translate('vi-VN', 'notice.added', { count: 3 })).toBe('Đã thêm 3 tệp');
    expect(translate('en-US', 'notice.applied_all', { count: 1 })).toBe('Applied to 1 clip');
    expect(translate('en-US', 'notice.applied_all', { count: 3 })).toBe('Applied to all 3 clips');
    expect(translate('vi-VN', 'notice.applied_all', { count: 1 })).toBe('Đã áp dụng cho cả 1 clip');
    // Counts are numbers, grouped the language's way.
    expect(translate('en-US', 'notice.added', { count: 1234 })).toBe('Added 1,234 files');
    expect(translate('vi-VN', 'notice.added', { count: 1234 })).toBe('Đã thêm 1.234 tệp');
  });

  it('F-022.R5 formatText picks a plural form by {count}; technical labels stay strings', () => {
    expect(formatText('en-US', { one: '{count} clip', other: '{count} clips' }, { count: 1 })).toBe('1 clip');
    expect(formatText('vi-VN', { other: '{count} clip' }, { count: 1 })).toBe('1 clip');
    expect(formatText('vi-VN', '{res} · {rate} fps', { res: '1080p', rate: 30 })).toBe('1080p · 30 fps');
  });
});
