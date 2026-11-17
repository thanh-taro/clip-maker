// MOD-Build — a minimal PNG writer and reader for the looks pack (DEP-13, ADR-0007 §3, ADR-0013 §1):
// 8-bit RGB, no colour chunks (no gAMA, cHRM, sRGB or iCCP), so browsers decode the strip's values
// untouched with `colorSpaceConversion: 'none'`. Node's zlib only; no dependency.
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Filters one row with filter `f` (0–4); `prev` is the unfiltered row above (zeros for the first). */
function filterRow(f, row, prev, bpp) {
  const out = Buffer.alloc(row.length);
  for (let i = 0; i < row.length; i++) {
    const a = i >= bpp ? row[i - bpp] : 0;
    const b = prev[i];
    const c = i >= bpp ? prev[i - bpp] : 0;
    const p = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
    out[i] = (row[i] - p) & 0xff;
  }
  return out;
}

/**
 * Encodes `rgb` (width × height × 3 bytes, rows from the top) as an 8-bit RGB PNG. Each row takes the
 * filter with the smallest sum of absolute values (the usual heuristic); zlib at level 9.
 */
export function encodePng(width, height, rgb) {
  const stride = width * 3;
  if (rgb.length !== stride * height) throw new RangeError(`png: ${rgb.length} bytes for ${width} × ${height} RGB`);
  const rows = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = Buffer.from(rgb.subarray(y * stride, (y + 1) * stride));
    let best = null;
    for (let f = 0; f < 5; f++) {
      const fr = filterRow(f, row, prev, 3);
      let cost = 0;
      for (const v of fr) cost += v < 128 ? v : 256 - v;
      if (!best || cost < best.cost) best = { f, fr, cost };
    }
    rows.push(Buffer.from([best.f]), best.fr);
    prev = row;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(Buffer.concat(rows), { level: 9, memLevel: 9 });
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Decodes an 8-bit RGB or RGBA PNG (non-interlaced) into RGBA bytes. Throws on anything else, on a bad
 * checksum, or on a colour chunk (the looks pack carries none, ADR-0007 §3).
 */
export function decodePng(buf) {
  const b = Buffer.from(buf);
  if (!b.subarray(0, 8).equals(SIGNATURE)) throw new Error('png: not a PNG file');
  let at = 8;
  let width = 0;
  let height = 0;
  let type = -1;
  const idat = [];
  while (at < b.length) {
    const len = b.readUInt32BE(at);
    const name = b.toString('ascii', at + 4, at + 8);
    const data = b.subarray(at + 8, at + 8 + len);
    if (crc32(b.subarray(at + 4, at + 8 + len)) !== b.readUInt32BE(at + 8 + len))
      throw new Error(`png: bad checksum in ${name}`);
    at += 12 + len;
    if (name === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      type = data[9];
      if (data[8] !== 8 || (type !== 2 && type !== 6) || data[12] !== 0)
        throw new Error('png: only 8-bit RGB or RGBA, not interlaced');
    } else if (name === 'IDAT') idat.push(data);
    else if (['gAMA', 'cHRM', 'sRGB', 'iCCP'].includes(name)) throw new Error(`png: colour chunk ${name}`);
    else if (name === 'IEND') break;
  }
  const bpp = type === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) throw new Error('png: wrong data length');
  const out = new Uint8Array(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const up = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      const p = f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : f === 4 ? paeth(a, up, c) : -1;
      if (p < 0) throw new Error(`png: unknown filter ${f}`);
      row[i] = (row[i] + p) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = row[x * bpp];
      out[o + 1] = row[x * bpp + 1];
      out[o + 2] = row[x * bpp + 2];
      out[o + 3] = bpp === 4 ? row[x * bpp + 3] : 255;
    }
    prev = row;
  }
  return { width, height, rgba: out };
}
