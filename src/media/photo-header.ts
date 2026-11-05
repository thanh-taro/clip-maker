// MOD-Media — a photo's picture size from its header, before anything is decoded, so RULE-02's
// photo limits refuse a 50,000-pixel image without allocating it (architecture.md "Add media":
// size → magic bytes → container headers → RULE-02 limits). Pure.
import type { Sniffed } from '../core';

export interface HeaderSize {
  readonly width: number;
  readonly height: number;
}

/** How many leading bytes the header parse reads (JPEG SOF can sit after a large EXIF block). */
export const PHOTO_HEADER_BYTES = 1024 * 1024;

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | ((b[i + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, i: number) => (u16be(b, i) * 0x10000 + u16be(b, i + 2)) >>> 0;
const tag = (b: Uint8Array, i: number) => String.fromCharCode(b[i] ?? 0, b[i + 1] ?? 0, b[i + 2] ?? 0, b[i + 3] ?? 0);

function png(b: Uint8Array): HeaderSize | null {
  return tag(b, 12) === 'IHDR' ? { width: u32be(b, 16), height: u32be(b, 20) } : null;
}

function gif(b: Uint8Array): HeaderSize | null {
  return b.length >= 10 ? { width: u16le(b, 6), height: u16le(b, 8) } : null;
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpeg(b: Uint8Array): HeaderSize | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (SOF.has(marker)) return { width: u16be(b, i + 7), height: u16be(b, i + 5) };
    if (marker === 0xd9 || marker === 0xda) return null;
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webp(b: Uint8Array): HeaderSize | null {
  const chunk = tag(b, 12);
  if (chunk === 'VP8X') return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (chunk === 'VP8L' && b[20] === 0x2f) {
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  return null;
}

/** AVIF: the largest `ispe` (image spatial extents) property under meta/iprp/ipco. */
function avif(b: Uint8Array): HeaderSize | null {
  let best: HeaderSize | null = null;
  const walk = (start: number, end: number, depth: number): void => {
    let i = start;
    while (i + 8 <= end && depth < 6) {
      let size = u32be(b, i);
      const type = tag(b, i + 4);
      let header = 8;
      if (size === 1) {
        size = u32be(b, i + 12); // 64-bit size; headers of a photo stay far below 4 GB
        header = 16;
      }
      if (size === 0) size = end - i;
      if (size < header) return;
      const boxEnd = Math.min(end, i + size);
      if (type === 'meta') walk(i + header + 4, boxEnd, depth + 1);
      else if (type === 'iprp' || type === 'ipco') walk(i + header, boxEnd, depth + 1);
      else if (type === 'ispe') {
        const s = { width: u32be(b, i + header + 4), height: u32be(b, i + header + 8) };
        if (!best || s.width * s.height > best.width * best.height) best = s;
      }
      i += size;
    }
  };
  walk(0, b.length, 0);
  return best;
}

/** The picture size a photo's header declares, or null when the header can't be read. */
export function photoHeaderSize(format: Sniffed, b: Uint8Array): HeaderSize | null {
  switch (format) {
    case 'png':
      return png(b);
    case 'gif':
      return gif(b);
    case 'jpeg':
      return jpeg(b);
    case 'webp':
      return webp(b);
    case 'avif':
      return avif(b);
    default:
      return null;
  }
}
