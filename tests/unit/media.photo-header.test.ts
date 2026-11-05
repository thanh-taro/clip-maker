// MOD-Media — photo sizes read from headers (RULE-02 photo limits before decoding).
import { describe, expect, it } from 'vitest';
import { photoHeaderSize } from '../../src/media';

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const s = (t: string) => [...t].map((c) => c.charCodeAt(0));
const u8 = (...xs: number[][]) => Uint8Array.from(xs.flat());
const box = (type: string, ...body: number[][]) => {
  const b = body.flat();
  return [...be32(8 + b.length), ...s(type), ...b];
};

describe('MOD-Media photo header', () => {
  it('RULE-02 PNG, GIF and JPEG sizes are read from their headers', () => {
    expect(
      photoHeaderSize('png', u8([0x89], s('PNG\r\n\x1a\n'), be32(13), s('IHDR'), be32(40_000), be32(300))),
    ).toEqual({
      width: 40_000,
      height: 300,
    });
    expect(photoHeaderSize('gif', u8(s('GIF89a'), le16(640), le16(480)))).toEqual({ width: 640, height: 480 });
    const app1 = [0xff, 0xe1, ...be16(10), 0, 0, 0, 0, 0, 0, 0, 0];
    const sof = [0xff, 0xc2, ...be16(17), 8, ...be16(3000), ...be16(4000), 3, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(photoHeaderSize('jpeg', u8([0xff, 0xd8], app1, sof, [0, 0, 0, 0]))).toEqual({ width: 4000, height: 3000 });
  });

  it('RULE-02 WebP (VP8X, VP8L, VP8) sizes are read from their headers', () => {
    const riff = (chunk: number[]) => u8(s('RIFF'), be32(0), s('WEBP'), chunk);
    expect(
      photoHeaderSize('webp', riff([...s('VP8X'), ...be32(10), 0, 0, 0, 0, ...le24(1919), ...le24(1079)])),
    ).toEqual({
      width: 1920,
      height: 1080,
    });
    const bits = (100 - 1) | ((50 - 1) << 14);
    expect(
      photoHeaderSize(
        'webp',
        riff([...s('VP8L'), ...be32(5), 0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, 0]),
      ),
    ).toEqual({ width: 100, height: 50 });
    expect(
      photoHeaderSize('webp', riff([...s('VP8 '), ...be32(10), 0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(320), ...le16(240)])),
    ).toEqual({ width: 320, height: 240 });
  });

  it('RULE-02 AVIF size is the largest ispe under meta/iprp/ipco', () => {
    const ispe = (w: number, h: number) => box('ispe', [0, 0, 0, 0], be32(w), be32(h));
    const file = u8(
      box('ftyp', s('avif'), be32(0), s('mif1')),
      box(
        'meta',
        [0, 0, 0, 0],
        box('hdlr', be32(0), be32(0), s('pict')),
        box('iprp', box('ipco', ispe(512, 256), ispe(8000, 6000))),
      ),
    );
    expect(photoHeaderSize('avif', file)).toEqual({ width: 8000, height: 6000 });
  });

  it('RULE-02 an unreadable header gives no size', () => {
    expect(photoHeaderSize('png', u8([1, 2, 3]))).toBeNull();
    expect(photoHeaderSize('jpeg', u8([0xff, 0xd8, 0x00]))).toBeNull();
    expect(photoHeaderSize('mp4', u8([0]))).toBeNull();
  });
});
