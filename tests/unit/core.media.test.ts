// MOD-Core — content sniffing (RULE-01) and the input limits and scale-down sizes (RULE-02).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkFileSize,
  checkLimits,
  checkSourceCount,
  photoLoadSize,
  REFUSAL_REASONS,
  sniff,
  SNIFF_BYTES,
  videoUseSize,
} from '../../src/core';
import { CATALOG } from '../../src/copy/messages.gen';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../fixtures/media/${name}`, import.meta.url))).subarray(0, SNIFF_BYTES);
const bytes = (...parts: (string | number[])[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const ftyp = (major: string, ...compatible: string[]): Uint8Array => {
  const size = 16 + 4 * compatible.length;
  return bytes([0, 0, 0, size], 'ftyp', major, [0, 0, 0, 0], ...compatible);
};

describe('MOD-Core sniff', () => {
  it('RULE-01 media containers are recognised by content', () => {
    expect(sniff(fixture('mp4-faststart.mp4'))).toBe('mp4');
    expect(sniff(fixture('os-avconvert-hevc.mov'))).toBe('mp4');
    expect(sniff(fixture('rec-chrome-vp9-opus.webm'))).toBe('matroska');
    expect(sniff(fixture('audio-opus.ogg'))).toBe('ogg');
    expect(sniff(fixture('os-afconvert.flac'))).toBe('flac');
    expect(sniff(bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt '))).toBe('wav');
    expect(sniff(bytes('ID3', [4, 0, 0]))).toBe('mp3');
    expect(sniff(bytes([0xff, 0xfb, 0x90, 0x64]))).toBe('mp3');
    expect(sniff(bytes([0xff, 0xf1, 0x50, 0x80]))).toBe('adts');
  });

  it('RULE-01 photo formats are recognised by content', () => {
    expect(sniff(bytes([0x89], 'PNG\r\n\x1a\n'))).toBe('png');
    expect(sniff(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniff(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe('webp');
    expect(sniff(bytes('GIF89a'))).toBe('gif');
    expect(sniff(ftyp('avif', 'mif1', 'avif'))).toBe('avif');
    expect(sniff(ftyp('mif1', 'avif'))).toBe('avif');
  });

  it('RULE-01 HEIC photos, PDFs, text and random bytes are not accepted types', () => {
    expect(sniff(ftyp('heic', 'mif1', 'heic'))).toBe('heif');
    expect(sniff(ftyp('mif1', 'heic'))).toBe('heif');
    expect(sniff(bytes('%PDF-1.7\n'))).toBeNull();
    expect(sniff(bytes('1\n00:00:01,000 --> 00:00:02,000\n'))).toBeNull();
    expect(sniff(fixture('dmg-garbage.mp4'))).toBeNull();
    expect(sniff(new Uint8Array(0))).toBeNull();
  });

  it('RULE-01 the declared name plays no part (a PDF named .mp4 is still not a video)', () => {
    // sniff sees bytes only; the name never reaches it.
    expect(sniff(bytes('%PDF-1.4\n%âãÏÓ'))).toBeNull();
  });

  it('RULE-01 every refusal reason is a COPY ID in both languages', () => {
    for (const id of REFUSAL_REASONS) {
      expect(CATALOG['en-US'][id]).toBeTruthy();
      expect(CATALOG['vi-VN'][id]).toBeTruthy();
    }
  });
});

describe('MOD-Core RULE-02 limits', () => {
  it('RULE-02 a file over 4,000,000,000 bytes is refused as too large', () => {
    expect(checkFileSize(4_000_000_000)).toBeNull();
    expect(checkFileSize(4_000_000_001)).toBe('reason.too_large');
    expect(checkFileSize(5 * 1024 ** 3)).toBe('reason.too_large');
  });

  it('RULE-02 the 101st source is refused as too many', () => {
    expect(checkSourceCount(99)).toBeNull();
    expect(checkSourceCount(100)).toBe('reason.too_many');
  });

  it('RULE-02 video above 5120 on a side or 14,745,600 pixels is refused', () => {
    const v = (width: number, height: number) => checkLimits({ kind: 'video', width, height, duration: 1e6 }, 30);
    expect(v(5120, 2880)).toBeNull();
    expect(v(2880, 5120)).toBeNull();
    expect(v(5121, 100)).toBe('reason.too_big_picture');
    expect(v(5000, 3000)).toBe('reason.too_big_picture');
  });

  it('RULE-02 photos above 32,768 on a side or 268,435,456 pixels are refused', () => {
    const p = (width: number, height: number) => checkLimits({ kind: 'photo', width, height }, 30);
    expect(p(16_384, 16_384)).toBeNull();
    expect(p(32_769, 10)).toBe('reason.too_big_picture');
    expect(p(20_000, 15_000)).toBe('reason.too_big_picture');
  });

  it('RULE-02 media longer than 3 hours or shorter than one frame is refused', () => {
    const a = (duration: number) => checkLimits({ kind: 'audio', duration }, 30);
    expect(a(3 * 3600e6)).toBeNull();
    expect(a(3 * 3600e6 + 1)).toBe('reason.too_long');
    expect(a(33_332)).toBe('reason.too_short');
    expect(a(33_333)).toBeNull();
  });

  it('F-001.AC13 a 5120 × 2880 video is used scaled to 3840 × 2160 (RULE-02, D-012)', () => {
    expect(checkLimits({ kind: 'video', width: 5120, height: 2880, duration: 2e6 }, 30)).toBeNull();
    expect(videoUseSize(5120, 2880)).toEqual({ width: 3840, height: 2160 });
  });

  it('RULE-02 video at or under 3840 × 2160 is used at its own size; other shapes fit inside', () => {
    expect(videoUseSize(3840, 2160)).toEqual({ width: 3840, height: 2160 });
    expect(videoUseSize(1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(videoUseSize(2160, 3840)).toEqual({ width: 2160, height: 3840 });
    expect(videoUseSize(4096, 2160)).toEqual({ width: 3840, height: 2025 });
    expect(videoUseSize(2880, 5120)).toEqual({ width: 2160, height: 3840 });
  });

  it('RULE-02 large photos are scaled down on load to 4096 on the longer side', () => {
    expect(photoLoadSize(16_384, 1000)).toEqual({ width: 16_384, height: 1000 });
    expect(photoLoadSize(4096, 4096)).toEqual({ width: 4096, height: 4096 });
    expect(photoLoadSize(16_385, 1000)).toEqual({ width: 4096, height: 250 });
    expect(photoLoadSize(5000, 4000)).toEqual({ width: 4096, height: 3277 });
  });
});
