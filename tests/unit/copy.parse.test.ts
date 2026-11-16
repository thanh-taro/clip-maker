// MOD-Copy — typed numbers read with the language's decimal and group marks (style.md "Number fields",
// platform-mapping "Number fields accept the language's decimal separator", build question 121).
import { afterEach, describe, expect, it } from 'vitest';
import { formatField, language, parseNumber } from '../../src/copy';

afterEach(() => {
  language.value = 'en-US';
});

describe('MOD-Copy parseNumber (Q121)', () => {
  it('Q121 vi-VN reads "50,5" as 50.5 and en-US reads "50.5" as 50.5', () => {
    expect(parseNumber('50,5', 'vi-VN')).toBe(50.5);
    expect(parseNumber('50.5', 'en-US')).toBe(50.5);
  });

  it('Q121 the other language\'s decimal mark is not guessed: "50.5" in vi-VN and "50,5" in en-US are rejected', () => {
    // vi-VN "." and en-US "," group thousands; "50.5" / "50,5" are not a valid grouping (WebKit read 505).
    expect(parseNumber('50.5', 'vi-VN')).toBeNull();
    expect(parseNumber('50,5', 'en-US')).toBeNull();
  });

  it('Q121 "1.000" and "1,000" follow the language: a group mark or a decimal mark', () => {
    expect(parseNumber('1.000', 'vi-VN')).toBe(1000);
    expect(parseNumber('1,000', 'vi-VN')).toBe(1);
    expect(parseNumber('1,000', 'en-US')).toBe(1000);
    expect(parseNumber('1.000', 'en-US')).toBe(1);
    expect(parseNumber('1.234.567,25', 'vi-VN')).toBe(1234567.25);
    expect(parseNumber('1,234,567.25', 'en-US')).toBe(1234567.25);
    // Groups after the first are three digits.
    expect(parseNumber('1,00', 'en-US')).toBeNull();
    expect(parseNumber('1.0000', 'vi-VN')).toBeNull();
  });

  it('Q121 plain digits, a sign, surrounding spaces and a bare decimal part are read', () => {
    expect(parseNumber(' 80 ', 'en-US')).toBe(80);
    expect(parseNumber('-5', 'vi-VN')).toBe(-5);
    expect(parseNumber('−5', 'en-US')).toBe(-5);
    expect(parseNumber(',5', 'vi-VN')).toBe(0.5);
    expect(parseNumber('5,', 'vi-VN')).toBe(5);
    expect(parseNumber('2000', 'vi-VN')).toBe(2000);
  });

  it('Q121 junk and an empty value are rejected', () => {
    for (const lang of ['en-US', 'vi-VN'] as const) {
      for (const junk of ['', '   ', 'abc', '5a', '1e3', '--5', ',', '.', '5 5', '½', 'NaN', 'Infinity', '0x10', '%'])
        expect(parseNumber(junk, lang), `${lang} ${JSON.stringify(junk)}`).toBeNull();
    }
  });

  it('Q121 the active language is used when none is given', () => {
    language.value = 'vi-VN';
    expect(parseNumber('50,5')).toBe(50.5);
    language.value = 'en-US';
    expect(parseNumber('50,5')).toBeNull();
  });

  it('Q121 a field shows its value without group marks, so what it shows reads back', () => {
    expect(formatField(1000, 'vi-VN')).toBe('1000');
    expect(formatField(50.5, 'vi-VN', 1)).toBe('50,5');
    expect(formatField(50.5, 'en-US', 1)).toBe('50.5');
    expect(formatField(51, 'en-US')).toBe('51');
    for (const lang of ['en-US', 'vi-VN'] as const)
      expect(parseNumber(formatField(1234.5, lang, 1), lang)).toBe(1234.5);
  });
});
