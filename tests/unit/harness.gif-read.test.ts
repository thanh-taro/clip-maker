// The test-only GIF reader (tests/harness/gif-read.ts) against files written by gifenc (DEP-05) as MOD-Export
// writes them: manual mode, a loop on the first frame, a palette per frame, delays in hundredths.
import { describe, expect, it } from 'vitest';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { readGifFrames } from '../harness/gif-read';

function frame(w: number, h: number, f: (x: number, y: number) => [number, number, number]): Uint8Array {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      rgba.set([r, g, b, 255], (y * w + x) * 4);
    }
  return rgba;
}

describe('GIF reader (test harness)', () => {
  it('smoke: frames, delays, loop and palettes read back as gifenc wrote them', () => {
    const w = 37;
    const h = 21;
    const frames = [
      frame(w, h, (x) => (x < 18 ? [255, 0, 0] : [0, 0, 255])),
      // Many colours: the LZW codes grow past 9 bits.
      frame(w, h, (x, y) => [(x * 7) % 256, (y * 13) % 256, ((x + y) * 5) % 256]),
    ];
    const gif = GIFEncoder({ auto: false });
    gif.writeHeader();
    frames.forEach((rgba, i) => {
      const palette = quantize(rgba, 256);
      gif.writeFrame(applyPalette(rgba, palette), w, h, { palette, delay: [70, 60][i]!, repeat: 0, first: i === 0 });
    });
    gif.finish();
    const read = readGifFrames(gif.bytesView().slice());
    expect(read.header).toBe('GIF89a');
    expect([read.width, read.height]).toEqual([w, h]);
    expect(read.loop).toBe(0);
    expect(read.delays).toEqual([7, 6]);
    expect(read.rgba).toHaveLength(2);
    expect(Math.max(...read.palettes)).toBeLessThanOrEqual(256);
    const at = (f: number, x: number, y: number) => Array.from(read.rgba[f]!.subarray((y * w + x) * 4, (y * w + x) * 4 + 3));
    expect(at(0, 2, 2)).toEqual([255, 0, 0]);
    expect(at(0, 30, 10)).toEqual([0, 0, 255]);
    // Quantised to 256 colours: each pixel close to its original.
    let worst = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const want = [(x * 7) % 256, (y * 13) % 256, ((x + y) * 5) % 256];
        const got = at(1, x, y);
        worst = Math.max(worst, ...want.map((v, c) => Math.abs(v - got[c]!)));
      }
    expect(worst).toBeLessThan(48);
  });
});
