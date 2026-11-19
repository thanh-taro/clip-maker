// MOD-Preview — the text rasteriser (ADR-0012 §3, specs/40-technical/modules/MOD-Preview.md): each text
// layer is laid out (lines break where typed and wrap at 90 % of the frame's width by measured width,
// RULE-11) and drawn with Canvas 2D on the main thread, where the page's own typefaces are loaded
// (ADR-0012 §1–2), into a premultiplied ImageBitmap for an output of W × H pixels. The engine and export
// workers' compositor draws the bitmap centred on the layer's position (MOD-Compositor), so the preview
// and the export draw the same pixels (F-010.R5, INV-02, NFR-08). Layout is pure given a `measure`
// function, so it is tested without a DOM.
// Implements: RULE-11 (*Typefaces*, *Size*, *Palette*, *Style*: Plain, Outline 8 % of the size, Shadow, Box
// at 70 % opacity in the box colour, the contrast colour; *Alignment*; wrapping at 90 % of the width),
// F-010.R2, F-010.R5, ADR-0012 §3 and §5 (palette colours from compiled constants, never the theme).
import { contrastOf, graphemes, PALETTE_HEX, RULE_11, type TextLayer } from '../core';

/** The four RULE-11 typefaces as canvas font families and their one weight (ADR-0012 §1). */
export const TEXT_FACES: Readonly<Record<TextLayer['typeface'], { readonly family: string; readonly weight: number }>> =
  {
    sans: { family: 'Manrope', weight: 700 },
    display: { family: 'Anton', weight: 400 },
    serif: { family: 'Playfair Display', weight: 700 },
    rounded: { family: 'Nunito', weight: 800 },
  };

/** Line height as a multiple of the font size (room for Vietnamese stacked marks, e.g. "Ệ"). */
export const LINE_HEIGHT = 1.3;
/** Box padding (multiples of the font size) and corner radius. */
export const BOX_PAD_X = 0.35;
export const BOX_PAD_Y = 0.12;
export const BOX_RADIUS = 0.3;
/** Shadow offset and blur as fractions of the output's shorter side `s` (ADR-0012 §3: fixed relative to `s`). */
export const SHADOW_OFFSET = 0.004;
export const SHADOW_BLUR = 0.006;
export const SHADOW_ALPHA = 0.75;

/** The canvas / CSS font of a layer at `px` pixels. */
export function fontOf(typeface: TextLayer['typeface'], px: number): string {
  const f = TEXT_FACES[typeface];
  return `${f.weight} ${px}px "${f.family}"`;
}

/** Width of `text` in pixels in `font` (a canvas `measureText` in the app). */
export type Measure = (text: string, font: string) => number;

export interface TextLine {
  readonly text: string;
  readonly width: number;
}

export interface TextLayout {
  /** The font size in output pixels (size % of `s`). */
  readonly px: number;
  readonly font: string;
  readonly lineHeight: number;
  readonly lines: readonly TextLine[];
  /** The text block (widest line × lines), without the box padding. */
  readonly textWidth: number;
  readonly textHeight: number;
  /** The visible block: the text block, plus the box's padding with the Box style (what snaps, RULE-11). */
  readonly width: number;
  readonly height: number;
}

/** Splits a line into words and the spaces after them, so wrapping happens at spaces. */
const tokens = (line: string): string[] => line.match(/\S+\s*|\s+/g) ?? [];

/**
 * RULE-11: lines break where typed and wrap at 90 % of the frame's width by measured width; a word wider
 * than that breaks between user-perceived characters (never inside one). Trailing spaces of a wrapped line
 * are not measured.
 */
export function wrapLines(content: string, maxWidth: number, font: string, measure: Measure): TextLine[] {
  const out: TextLine[] = [];
  const push = (text: string): void => {
    const shown = text.replace(/\s+$/, '');
    out.push({ text: shown, width: shown ? measure(shown, font) : 0 });
  };
  for (const paragraph of content.split('\n')) {
    let line = '';
    for (const token of tokens(paragraph)) {
      const candidate = line + token;
      if (measure(candidate.replace(/\s+$/, ''), font) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line.trim() !== '') {
        push(line);
        line = '';
      }
      // The token alone: a word too wide breaks between characters.
      if (measure(token.replace(/\s+$/, ''), font) <= maxWidth) {
        line = token.trimStart() === '' ? '' : token;
        continue;
      }
      let part = '';
      for (const g of graphemes(token)) {
        if (part && measure((part + g).replace(/\s+$/, ''), font) > maxWidth) {
          push(part);
          part = '';
        }
        part += g;
      }
      line = part;
    }
    push(line);
  }
  return out;
}

/**
 * Lines are measured with the frame scaled to this shorter side and then scaled to the output, so the line
 * breaks are the same at every output size of a frame (the preview's canvas, each export resolution;
 * F-010.R5, INV-02): font hinting at small sizes never moves a word to the next line in one and not the other.
 */
export const LAYOUT_REFERENCE_S = 1000;

/** Implements: RULE-11 layout of `layer` for an output of `W` × `H` pixels (`s` = the shorter side). */
export function layoutText(layer: TextLayer, W: number, H: number, measure: Measure): TextLayout {
  const s = Math.min(W, H);
  const px = (layer.size / 100) * s;
  const font = fontOf(layer.typeface, px);
  const k = s / LAYOUT_REFERENCE_S;
  const refFont = fontOf(layer.typeface, (layer.size / 100) * LAYOUT_REFERENCE_S);
  const lines = wrapLines(layer.content.normalize('NFC'), (RULE_11.wrapWidth * W) / k, refFont, measure).map((l) => ({
    text: l.text,
    width: l.width * k,
  }));
  const lineHeight = LINE_HEIGHT * px;
  const textWidth = Math.max(0, ...lines.map((l) => l.width));
  const textHeight = lines.length * lineHeight;
  const box = layer.style === 'box';
  return {
    px,
    font,
    lineHeight,
    lines,
    textWidth,
    textHeight,
    width: textWidth + (box ? 2 * BOX_PAD_X * px : 0),
    height: textHeight + (box ? 2 * BOX_PAD_Y * px : 0),
  };
}

/** How far drawing may reach beyond the visible block (outline, shadow, marks above or below a line). */
export function bleedOf(layer: TextLayer, layout: TextLayout, s: number): number {
  const outline = layer.style === 'outline' ? RULE_11.outlineOfSize * layout.px : 0;
  const shadow = layer.style === 'shadow' ? (SHADOW_OFFSET + 2 * SHADOW_BLUR) * s : 0;
  return Math.ceil(Math.max(outline, shadow) + 0.25 * layout.px + 2);
}

/** A colour of the RULE-11 palette as CSS (compiled constants, ADR-0012 §5). */
const hex = (c: TextLayer['colour']): string => PALETTE_HEX[c];

/** RGBA CSS of a palette colour at `alpha`. */
function withAlpha(c: TextLayer['colour'], alpha: number): string {
  const v = parseInt(hex(c).slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}

/** The 2D context calls the rasteriser uses (a canvas's or an OffscreenCanvas's). */
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Draws `layer` laid out as `layout` with the visible block's top-left at (`x0`, `y0`) on `g`.
 * Implements: RULE-11 *Style* and *Alignment*; ADR-0012 §3 (outline with round joins, the box as a rounded
 * path, the shadow as an offset blurred copy of fixed size relative to `s`).
 */
export function drawText(g: Ctx2D, layer: TextLayer, layout: TextLayout, x0: number, y0: number, s: number): void {
  const { px, lines, lineHeight, width, textWidth } = layout;
  const contrast = contrastOf(layer.colour);
  const box = layer.style === 'box';
  if (box) {
    g.fillStyle = withAlpha(layer.boxColour ?? contrast, RULE_11.boxOpacity);
    g.beginPath();
    const r = BOX_RADIUS * px;
    if ('roundRect' in g) g.roundRect(x0, y0, width, layout.height, r);
    else (g as CanvasRenderingContext2D).rect(x0, y0, width, layout.height);
    g.fill();
  }
  const tx0 = x0 + (box ? BOX_PAD_X * px : 0);
  const ty0 = y0 + (box ? BOX_PAD_Y * px : 0);
  g.font = layout.font;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.lineJoin = 'round';
  g.miterLimit = 2;
  const xOf = (line: TextLine): number =>
    layer.align === 'left'
      ? tx0
      : layer.align === 'right'
        ? tx0 + textWidth - line.width
        : tx0 + (textWidth - line.width) / 2;
  const each = (fn: (line: TextLine, x: number, y: number) => void): void =>
    lines.forEach((line, i) => {
      if (line.text) fn(line, xOf(line), ty0 + (i + 0.5) * lineHeight);
    });
  if (layer.style === 'shadow') {
    g.save();
    g.shadowColor = withAlpha(contrast, SHADOW_ALPHA);
    g.shadowOffsetX = SHADOW_OFFSET * s;
    g.shadowOffsetY = SHADOW_OFFSET * s;
    g.shadowBlur = SHADOW_BLUR * s;
    g.fillStyle = hex(layer.colour);
    each((line, x, y) => g.fillText(line.text, x, y));
    g.restore();
    return;
  }
  if (layer.style === 'outline') {
    // The outline shows 8 % of the size outside the glyphs: the stroke is centred on the outline path.
    g.strokeStyle = hex(contrast);
    g.lineWidth = 2 * RULE_11.outlineOfSize * px;
    each((line, x, y) => g.strokeText(line.text, x, y));
  }
  g.fillStyle = hex(layer.colour);
  each((line, x, y) => g.fillText(line.text, x, y));
}

/** A canvas the rasteriser draws on (a page canvas, so the page's typefaces apply in every engine). */
function makeCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  return new OffscreenCanvas(width, height);
}

let measurer: Ctx2D | null = null;
/** The page's measuring context (main thread). */
export function canvasMeasure(): Measure {
  measurer ??= makeCanvas(1, 1).getContext('2d') as Ctx2D | null;
  const g = measurer;
  if (!g) return (text, font) => text.length * (parseFloat(font.split(' ')[1] ?? '16') || 16) * 0.6;
  return (text, font) => {
    g.font = font;
    return g.measureText(text).width;
  };
}

/**
 * The bitmap's size: the block and its bleed, but never more than can show — a block centred anywhere in the
 * frame shows at most the frame's size on each side of its centre — so a tall 500-character title never asks
 * for a canvas past an engine's limits (WebKit's area limit would drop it silently). The block stays centred in
 * the bitmap, so the compositor still centres the bitmap on the layer's position.
 */
export function bitmapSize(
  layout: Pick<TextLayout, 'width' | 'height'>,
  bleed: number,
  W: number,
  H: number,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.ceil(Math.min(layout.width, 2 * W) + 2 * bleed)),
    height: Math.max(1, Math.ceil(Math.min(layout.height, 2 * H) + 2 * bleed)),
  };
}

/** Waits until the layer's face is loaded (all faces load at start-up, ADR-0012 §2; this never fetches again). */
async function faceReady(layer: TextLayer, px: number): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await document.fonts.load(fontOf(layer.typeface, Math.max(1, Math.round(px))), layer.content || 'A');
  } catch {
    // A face that can't load draws with the fallback; the page's start-up already reported it.
  }
}

/**
 * Implements: MOD-Preview `rasteriseText` (ADR-0012 §3) — `layer` drawn for an output of `W` × `H` pixels
 * into a premultiplied ImageBitmap whose centre is the visible block's centre; null for empty text.
 */
export async function rasteriseText(layer: TextLayer, W: number, H: number): Promise<ImageBitmap | null> {
  if (layer.content.trim() === '' || W < 1 || H < 1) return null;
  const s = Math.min(W, H);
  await faceReady(layer, (layer.size / 100) * s);
  const layout = layoutText(layer, W, H, canvasMeasure());
  const bleed = bleedOf(layer, layout, s);
  const { width, height } = bitmapSize(layout, bleed, W, H);
  const canvas = makeCanvas(width, height);
  const g = canvas.getContext('2d') as Ctx2D | null;
  if (!g) return null;
  // The block is centred in the bitmap, so the compositor centres the bitmap on the layer's position.
  drawText(g, layer, layout, (width - layout.width) / 2, (height - layout.height) / 2, s);
  return createImageBitmap(canvas, { premultiplyAlpha: 'premultiply' });
}

/** The fields that change a layer's pixels (its times and position don't). */
export const rasterKey = (layer: TextLayer, W: number, H: number): string =>
  JSON.stringify([
    layer.content,
    layer.typeface,
    layer.size,
    layer.colour,
    layer.style,
    layer.boxColour ?? null,
    layer.align,
    W,
    H,
  ]);

/**
 * Every text layer of a project rasterised for an export of `W` × `H` (MOD-Export's `texts`, F-015 wires
 * it): `{ id: { bitmap, s } }`; empty layers are left out.
 */
export async function textBitmaps(
  layers: readonly TextLayer[],
  W: number,
  H: number,
): Promise<Record<string, { bitmap: ImageBitmap; s: number }>> {
  const out: Record<string, { bitmap: ImageBitmap; s: number }> = {};
  for (const layer of layers) {
    const bitmap = await rasteriseText(layer, W, H);
    if (bitmap) out[layer.id] = { bitmap, s: Math.min(W, H) };
  }
  return out;
}
