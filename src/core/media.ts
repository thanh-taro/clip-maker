// MOD-Core — the pure part of accepting a file: content sniffing (RULE-01) and the input limits and
// scale-down sizes of RULE-02 (specs/40-technical/modules/MOD-Core.md "magic-byte sniffing",
// "RULE-02 limits and scale-down sizes"). MOD-Media runs these in the analysis worker.
import { RULE_02 } from './limits';
import { frameStart, type FrameRate, type Micros } from './time';

/** A refusal reason, as its COPY ID without the `COPY-` prefix (RULE-01, RULE-02). */
export type RefusalReason =
  | 'reason.unsupported'
  | 'reason.too_large'
  | 'reason.too_long'
  | 'reason.too_big_picture'
  | 'reason.too_short'
  | 'reason.too_many'
  | 'reason.protected'
  | 'reason.no_media'
  | 'reason.codec'
  | 'reason.folder';

export const REFUSAL_REASONS: readonly RefusalReason[] = Object.freeze([
  'reason.unsupported',
  'reason.too_large',
  'reason.too_long',
  'reason.too_big_picture',
  'reason.too_short',
  'reason.too_many',
  'reason.protected',
  'reason.no_media',
  'reason.codec',
  'reason.folder',
]);

/** What the first bytes say a file is. Containers that may hold video or audio are read further. */
export type Sniffed =
  | 'mp4' // MP4 / MOV / M4A (ISO base media)
  | 'matroska' // WebM / Matroska
  | 'ogg'
  | 'mp3'
  | 'adts' // AAC in ADTS
  | 'wav'
  | 'flac'
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'gif'
  | 'avif'
  | 'heif'; // HEIC / HEIF stills: recognised so they are refused (RULE-01)

/** How many leading bytes `sniff` needs (platform-mapping: `file.slice(0, 64)`). */
export const SNIFF_BYTES = 64;

const ascii = (b: Uint8Array, at: number, s: string): boolean => {
  if (b.length < at + s.length) return false;
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
};
const u32 = (b: Uint8Array, at: number): number =>
  ((b[at] ?? 0) * 0x1000000 + ((b[at + 1] ?? 0) << 16) + ((b[at + 2] ?? 0) << 8) + (b[at + 3] ?? 0)) >>> 0;

const AVIF_BRANDS = ['avif', 'avis'];
const HEIF_BRANDS = ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'mif2'];
/** ISO base media top-level boxes a file may start with besides `ftyp` (old QuickTime files). */
const QT_FIRST_BOXES = ['moov', 'mdat', 'free', 'skip', 'wide', 'pnot'];

/** The brands of an `ftyp` box: major brand plus compatible brands that fit in `b`. */
function ftypBrands(b: Uint8Array): string[] {
  const size = Math.min(u32(b, 0), b.length);
  const brands: string[] = [];
  for (let at = 8; at + 4 <= size; at += at === 8 ? 8 : 4) {
    brands.push(String.fromCharCode(b[at] ?? 0, b[at + 1] ?? 0, b[at + 2] ?? 0, b[at + 3] ?? 0));
  }
  return brands;
}

/**
 * Implements: RULE-01 "the tool reads the file's contents to decide its type; the file name and
 * declared type are ignored". Returns null for anything else (COPY-reason.unsupported).
 */
export function sniff(bytes: Uint8Array): Sniffed | null {
  const b = bytes;
  if (ascii(b, 4, 'ftyp')) {
    const brands = ftypBrands(b);
    if (brands.some((x) => AVIF_BRANDS.includes(x))) return 'avif';
    if (brands.some((x) => HEIF_BRANDS.includes(x))) return 'heif';
    return 'mp4';
  }
  if (QT_FIRST_BOXES.some((box) => ascii(b, 4, box))) return 'mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'matroska';
  if (ascii(b, 0, 'OggS')) return 'ogg';
  if (ascii(b, 0, 'fLaC')) return 'flac';
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE')) return 'wav';
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return 'webp';
  if (b[0] === 0x89 && ascii(b, 1, 'PNG\r\n\x1a\n')) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a')) return 'gif';
  if (ascii(b, 0, 'ID3')) return 'mp3';
  if (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0) {
    const layer = ((b[1] ?? 0) >> 1) & 0x3;
    if (layer === 0 && ((b[1] ?? 0) & 0xf0) === 0xf0) return 'adts';
    if (layer !== 0) return 'mp3';
  }
  return null;
}

/** The kind a sniffed photo format gives directly; containers are decided by their tracks. */
export function photoFormat(s: Sniffed): boolean {
  return s === 'png' || s === 'jpeg' || s === 'webp' || s === 'gif' || s === 'avif';
}

/** Implements: RULE-02 size limit, checked before anything is read. */
export function checkFileSize(bytes: number): RefusalReason | null {
  return bytes > RULE_02.maxBytes ? 'reason.too_large' : null;
}

/** Implements: RULE-02 the 100-source limit. */
export function checkSourceCount(sourcesInProject: number): RefusalReason | null {
  return sourcesInProject >= RULE_02.maxSources ? 'reason.too_many' : null;
}

/** What the probe read about a file, as far as RULE-02 needs it. */
export interface ProbedShape {
  readonly kind: 'video' | 'photo' | 'audio';
  /** Picture size (any orientation; the limits are symmetric). */
  readonly width?: number;
  readonly height?: number;
  readonly duration?: Micros;
}

/**
 * Implements: RULE-02 picture, length and minimum-length limits. "Shorter than one frame" is taken
 * at the project frame rate (`rate`), the frame every timeline length is counted in.
 */
export function checkLimits(p: ProbedShape, rate: FrameRate): RefusalReason | null {
  if (p.kind === 'video' || p.kind === 'photo') {
    const w = p.width ?? 0;
    const h = p.height ?? 0;
    const [side, pixels] =
      p.kind === 'video'
        ? [RULE_02.maxVideoSide, RULE_02.maxVideoPixels]
        : [RULE_02.maxPhotoSide, RULE_02.maxPhotoPixels];
    if (Math.max(w, h) > side || w * h > pixels) return 'reason.too_big_picture';
  }
  if (p.kind === 'video' || p.kind === 'audio') {
    const d = p.duration ?? 0;
    if (d > RULE_02.maxMediaSeconds * 1_000_000) return 'reason.too_long';
    if (d < frameStart(1, rate)) return 'reason.too_short';
  }
  return null;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Implements: RULE-02 / D-012 — video larger than 3840 × 2160 is used scaled down to fit inside it,
 * keeping its aspect ratio. The box follows the picture's orientation (a portrait picture fits
 * inside 2160 × 3840), as the side limit does. Smaller video is used as it is.
 */
export function videoUseSize(width: number, height: number): Size {
  const { width: bw, height: bh } = RULE_02.videoFit;
  const [boxW, boxH] = width >= height ? [bw, bh] : [bh, bw];
  if (width <= boxW && height <= boxH) return { width, height };
  const f = Math.min(boxW / width, boxH / height);
  return { width: Math.max(1, Math.round(width * f)), height: Math.max(1, Math.round(height * f)) };
}

/**
 * Implements: RULE-02 — a photo larger than 16,384 px on a side or 16,777,216 px in total is scaled
 * down on load to 4096 px on its longer side; otherwise it loads at its own size.
 */
export function photoLoadSize(width: number, height: number): Size {
  const over = Math.max(width, height) > RULE_02.photoScaleSide || width * height > RULE_02.photoScalePixels;
  if (!over) return { width, height };
  const f = RULE_02.photoScaledLongSide / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * f)), height: Math.max(1, Math.round(height * f)) };
}
