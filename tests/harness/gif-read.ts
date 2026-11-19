// Test-only GIF reader (F-016): walks the blocks of a downloaded GIF and decodes every image (LZW) into full
// RGBA frames, so the e2e checks run the same on every engine (WebKit has no `ImageDecoder` for GIF frames).
// It reads what gifenc writes: full-size frames, no interlacing, no transparency; the frame's own colour
// table, or the global one. Nothing here ships in the app.

export interface GifFrames {
  readonly header: string;
  readonly width: number;
  readonly height: number;
  /** The Netscape loop count (0: forever), or null without the extension. */
  readonly loop: number | null;
  /** Each frame's delay in hundredths of a second. */
  readonly delays: number[];
  /** Colours in each frame's table (its own, or the global one). */
  readonly palettes: number[];
  /** Each frame's pixels, RGBA top-down. */
  readonly rgba: Uint8Array[];
}

/** GIF's variable-length LZW (89a), up to `count` indices. */
function lzw(minSize: number, data: Uint8Array, count: number): Uint8Array {
  const clear = 1 << minSize;
  const eoi = clear + 1;
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4097);
  for (let i = 0; i < clear; i++) {
    prefix[i] = -1;
    suffix[i] = i;
  }
  const out = new Uint8Array(count);
  let size = minSize + 1;
  let mask = (1 << size) - 1;
  let next = eoi + 1;
  let old = -1;
  let first = 0;
  let o = 0;
  let bits = 0;
  let cur = 0;
  let pos = 0;
  while (o < count) {
    while (bits < size) {
      if (pos >= data.length) return out;
      cur |= data[pos++]! << bits;
      bits += 8;
    }
    let code = cur & mask;
    cur >>>= size;
    bits -= size;
    if (code === clear) {
      size = minSize + 1;
      mask = (1 << size) - 1;
      next = eoi + 1;
      old = -1;
      continue;
    }
    if (code === eoi) break;
    if (old === -1) {
      out[o++] = suffix[code]!;
      old = code;
      first = suffix[code]!;
      continue;
    }
    const read = code;
    let sp = 0;
    if (code >= next) {
      stack[sp++] = first;
      code = old;
    }
    while (code >= clear) {
      stack[sp++] = suffix[code]!;
      code = prefix[code]!;
    }
    first = suffix[code]!;
    stack[sp++] = first;
    while (sp > 0 && o < count) out[o++] = stack[--sp]!;
    if (next < 4096) {
      prefix[next] = old;
      suffix[next] = first;
      next++;
      if (next === mask + 1 && size < 12) {
        size++;
        mask = (1 << size) - 1;
      }
    }
    old = read;
  }
  return out;
}

export function readGifFrames(b: Uint8Array): GifFrames {
  const header = String.fromCharCode(...b.subarray(0, 6));
  const width = b[6]! | (b[7]! << 8);
  const height = b[8]! | (b[9]! << 8);
  let i = 13;
  let global: Uint8Array | null = null;
  if (b[10]! & 0x80) {
    const n = 1 << ((b[10]! & 7) + 1);
    global = b.subarray(i, i + 3 * n);
    i += 3 * n;
  }
  const delays: number[] = [];
  const palettes: number[] = [];
  const rgba: Uint8Array[] = [];
  let loop: number | null = null;
  const subBlocks = (): Uint8Array => {
    const parts: Uint8Array[] = [];
    let total = 0;
    while (b[i]! !== 0) {
      const len = b[i]!;
      parts.push(b.subarray(i + 1, i + 1 + len));
      total += len;
      i += len + 1;
    }
    i++;
    const all = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
      all.set(p, at);
      at += p.length;
    }
    return all;
  };
  while (i < b.length && b[i] !== 0x3b) {
    if (b[i] === 0x21) {
      const label = b[i + 1];
      if (label === 0xf9) delays.push(b[i + 4]! | (b[i + 5]! << 8));
      if (label === 0xff && String.fromCharCode(...b.subarray(i + 3, i + 14)) === 'NETSCAPE2.0')
        loop = b[i + 16]! | (b[i + 17]! << 8);
      i += 2;
      subBlocks();
    } else if (b[i] === 0x2c) {
      const left = b[i + 1]! | (b[i + 2]! << 8);
      const top = b[i + 3]! | (b[i + 4]! << 8);
      const w = b[i + 5]! | (b[i + 6]! << 8);
      const h = b[i + 7]! | (b[i + 8]! << 8);
      const packed = b[i + 9]!;
      i += 10;
      let table = global;
      if (packed & 0x80) {
        const n = 1 << ((packed & 7) + 1);
        table = b.subarray(i, i + 3 * n);
        i += 3 * n;
      }
      const minSize = b[i++]!;
      const indices = lzw(minSize, subBlocks(), w * h);
      // Each frame starts from the previous one (gifenc's frames cover the whole image).
      const frame = rgba.length ? rgba[rgba.length - 1]!.slice() : new Uint8Array(width * height * 4);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const c = indices[y * w + x]! * 3;
          const d = ((top + y) * width + left + x) * 4;
          frame[d] = table![c]!;
          frame[d + 1] = table![c + 1]!;
          frame[d + 2] = table![c + 2]!;
          frame[d + 3] = 255;
        }
      rgba.push(frame);
      palettes.push(table ? table.length / 3 : 0);
    } else break;
  }
  return { header, width, height, loop, delays, palettes, rgba };
}
