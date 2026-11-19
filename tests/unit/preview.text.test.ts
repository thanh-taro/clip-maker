// MOD-Preview — the text rasteriser's layout and drawing (ADR-0012 §3, RULE-11), with a fake measure and a
// recording 2D context (no DOM); the pixels themselves are checked in the browser (tests/e2e/text.spec.ts).
import { describe, expect, it } from 'vitest';
import { PALETTE_HEX, RULE_11 } from '../../src/core';
import { graphemes } from '../../src/core';
import {
  BOX_PAD_X,
  bitmapSize,
  bleedOf,
  BOX_PAD_Y,
  drawText,
  fontOf,
  layoutText,
  rasterKey,
  wrapLines,
  type Measure,
} from '../../src/preview';
import { text } from '../support/project';

/** Every user-perceived character is 10 px wide at any font (a predictable measure). */
const measure: Measure = (s) =>
  Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)).length * 10;

/** Each character is as wide as the font size (px), as real glyphs scale. */
const pxOf = (font: string): number => parseFloat(font.split(' ')[1] ?? '0');
const scaled: Measure = (s, font) => graphemes(s).length * pxOf(font);
/** Like `scaled`, but whole pixels per character, as hinting rounds at small sizes. */
const hinted: Measure = (s, font) => graphemes(s).length * Math.round(pxOf(font) * 0.55);

describe('MOD-Preview text layout (RULE-11)', () => {
  it('F-010.R5 INV-02 the line breaks are the same at the preview’s size and every export size', () => {
    const layer = text('T', 0, 3, { content: 'Đà Lạt 2026 — mùa hoa dã quỳ, sương sớm và đồi thông', size: 7 });
    const at = (W: number, H: number) => layoutText(layer, W, H, hinted).lines.map((l) => l.text);
    const preview = at(203, 361);
    expect(preview.length).toBeGreaterThan(1);
    for (const [W, H] of [
      [480, 848],
      [720, 1280],
      [1080, 1920],
      [2160, 3840],
    ] as const)
      expect(at(W, H)).toEqual(preview);
  });

  it('ADR-0012 §3 a 500-character title at 20 % in 9:16 gets a bitmap no larger than can show (centred)', () => {
    const layer = text('T', 0, 3, { content: 'Chúc mừng sinh nhật '.repeat(25).slice(0, 500), size: 20 });
    const W = 1080;
    const H = 1920;
    const l = layoutText(layer, W, H, scaled);
    expect(l.height).toBeGreaterThan(4 * H);
    const bleed = bleedOf(layer, l, W);
    const b = bitmapSize(l, bleed, W, H);
    expect(b.height).toBeLessThanOrEqual(2 * H + 2 * bleed + 1);
    expect(b.width).toBeLessThanOrEqual(2 * W + 2 * bleed + 1);
    // Well inside every engine's canvas limits (WebKit: 16 384 px a side, 16.7 M px in all).
    expect(b.width * b.height).toBeLessThan(16_777_216);
    // A short title keeps its natural size.
    const short = layoutText({ ...layer, content: 'Hi' }, W, H, scaled);
    expect(bitmapSize(short, 4, W, H)).toEqual({
      width: Math.ceil(short.width + 8),
      height: Math.ceil(short.height + 8),
    });
  });

  it('RULE-11 lines break where typed', () => {
    expect(wrapLines('Đà Lạt\n2026', 1000, 'f', measure).map((l) => l.text)).toEqual(['Đà Lạt', '2026']);
  });

  it('RULE-11 text wraps at 90 % of the frame width by measured width, at spaces', () => {
    // 100 px frame → 90 px; at size 10 % each character is 10 px: "aaaa bbbb" (90 px) fits, "… cc" does not.
    const layer = text('T', 0, 3, { content: 'aaaa bbbb cc', size: 10 });
    const l = layoutText(layer, 100, 1000, scaled);
    expect(l.lines.map((x) => x.text)).toEqual(['aaaa bbbb', 'cc']);
    expect(l.textWidth).toBe(90);
  });

  it('RULE-11 a word wider than the wrap width breaks between user-perceived characters, never inside one', () => {
    // "ệ" written as e + two combining marks is one character; NFC composes it first.
    const word = 'Chúc'.repeat(3) + 'ệ';
    const lines = wrapLines(word.normalize('NFC'), 40, 'f', measure);
    expect(lines.map((l) => l.text).join('')).toBe(word.normalize('NFC'));
    for (const l of lines) expect(l.width).toBeLessThanOrEqual(40);
    expect(lines.at(-1)!.text.endsWith('ệ')).toBe(true);
  });

  it('RULE-11 size is a percentage of the shorter side; the font is the layer’s typeface at its one weight', () => {
    const l = layoutText(text('T', 0, 3, { size: 10, typeface: 'display' }), 1920, 1080, measure);
    expect(l.px).toBe(108);
    expect(l.font).toBe(fontOf('display', 108));
    expect(l.font).toBe('400 108px "Anton"');
    expect(fontOf('sans', 20)).toBe('700 20px "Manrope"');
    expect(fontOf('serif', 20)).toBe('700 20px "Playfair Display"');
    expect(fontOf('rounded', 20)).toBe('800 20px "Nunito"');
  });

  it('RULE-11 the Box style adds its padding to the visible block (what snaps)', () => {
    const plain = layoutText(text('T', 0, 3, { content: 'abc' }), 1000, 1000, measure);
    const box = layoutText(text('T', 0, 3, { content: 'abc', style: 'box' }), 1000, 1000, measure);
    expect(box.width - plain.width).toBeCloseTo(2 * BOX_PAD_X * box.px);
    expect(box.height - plain.height).toBeCloseTo(2 * BOX_PAD_Y * box.px);
  });

  it('ADR-0012 §3 a layer is rasterised again only when its pixels change (not its times or position)', () => {
    const a = text('T', 0, 3, { content: 'Hi' });
    expect(rasterKey({ ...a, x: 0.1, y: 0.2, start: 5, end: 9, fade: true }, 640, 360)).toBe(rasterKey(a, 640, 360));
    expect(rasterKey({ ...a, colour: 'yellow' }, 640, 360)).not.toBe(rasterKey(a, 640, 360));
    expect(rasterKey(a, 1280, 720)).not.toBe(rasterKey(a, 640, 360));
  });
});

/** A 2D context that records what it was told. */
function recorder() {
  const calls: { op: string; text?: string; x?: number; fill?: string; stroke?: string; lineWidth?: number }[] = [];
  const g = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textBaseline: '',
    textAlign: '',
    lineJoin: '',
    miterLimit: 10,
    shadowColor: '',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowBlur: 0,
    save: () => calls.push({ op: 'save' }),
    restore: () => calls.push({ op: 'restore' }),
    beginPath: () => undefined,
    roundRect: () => calls.push({ op: 'roundRect', fill: g.fillStyle }),
    fill: () => calls.push({ op: 'fill', fill: g.fillStyle }),
    fillText: (t: string, x: number) => calls.push({ op: 'fillText', text: t, x, fill: g.fillStyle }),
    strokeText: (t: string, x: number) =>
      calls.push({ op: 'strokeText', text: t, x, stroke: g.strokeStyle, lineWidth: g.lineWidth }),
  };
  return { g: g as unknown as CanvasRenderingContext2D, calls, raw: g };
}

describe('MOD-Preview text drawing (RULE-11 styles)', () => {
  it('F-010.AC1 RULE-11 the default style is white with a black outline 8 % of the size, drawn with round joins', () => {
    const layer = text('T', 0, 3, { content: 'Đà Lạt 2026' });
    const l = layoutText(layer, 1000, 1000, measure);
    const { g, calls, raw } = recorder();
    drawText(g, layer, l, 0, 0, 1000);
    const stroke = calls.find((c) => c.op === 'strokeText')!;
    expect(stroke.stroke).toBe(PALETTE_HEX.black);
    expect(stroke.lineWidth).toBeCloseTo(2 * RULE_11.outlineOfSize * l.px);
    expect(raw.lineJoin).toBe('round');
    // The fill comes after the outline, in the text colour.
    const order = calls.filter((c) => c.op === 'strokeText' || c.op === 'fillText').map((c) => c.op);
    expect(order).toEqual(['strokeText', 'fillText']);
    expect(calls.find((c) => c.op === 'fillText')!.fill).toBe(PALETTE_HEX.white);
  });

  it('RULE-11 the outline is white when the text is black, blue or purple', () => {
    for (const colour of ['black', 'blue', 'purple'] as const) {
      const layer = text('T', 0, 3, { colour });
      const { g, calls } = recorder();
      drawText(g, layer, layoutText(layer, 500, 500, measure), 0, 0, 500);
      expect(calls.find((c) => c.op === 'strokeText')!.stroke).toBe(PALETTE_HEX.white);
    }
  });

  it('F-010.AC2 RULE-11 Box draws a rounded box at 70 % opacity in the box colour (the contrast colour by default), then plain text', () => {
    const layer = text('T', 0, 3, { content: 'Hi', colour: 'yellow', style: 'box', size: 10 });
    const { g, calls } = recorder();
    drawText(g, layer, layoutText(layer, 500, 500, measure), 0, 0, 500);
    expect(calls[0]).toEqual({ op: 'roundRect', fill: 'rgba(0,0,0,0.7)' });
    expect(calls.some((c) => c.op === 'strokeText')).toBe(false);
    expect(calls.find((c) => c.op === 'fillText')!.fill).toBe(PALETTE_HEX.yellow);
    const red = { ...layer, boxColour: 'red' as const };
    const r = recorder();
    drawText(r.g, red, layoutText(red, 500, 500, measure), 0, 0, 500);
    expect(r.calls[0]!.fill).toBe('rgba(229,56,59,0.7)');
  });

  it('RULE-11 Plain draws only the fill; Shadow an offset blurred copy relative to s', () => {
    const plain = text('T', 0, 3, { style: 'plain' });
    const p = recorder();
    drawText(p.g, plain, layoutText(plain, 500, 500, measure), 0, 0, 500);
    expect(p.calls.map((c) => c.op)).toEqual(['fillText']);
    const shadow = text('T', 0, 3, { style: 'shadow' });
    const sh = recorder();
    drawText(sh.g, shadow, layoutText(shadow, 1000, 500, measure), 0, 0, 500);
    expect(sh.raw.shadowOffsetX).toBeCloseTo(0.004 * 500);
    expect(sh.calls.map((c) => c.op)).toEqual(['save', 'fillText', 'restore']);
  });

  it('RULE-11 alignment: lines start at the left, centre or right of the block', () => {
    const lines = 'aaaa\nbb';
    const xs = (align: 'left' | 'centre' | 'right') => {
      const layer = text('T', 0, 3, { content: lines, align, style: 'plain' });
      const r = recorder();
      drawText(r.g, layer, layoutText(layer, 1000, 1000, measure), 0, 0, 1000);
      return r.calls.filter((c) => c.op === 'fillText').map((c) => c.x);
    };
    expect(xs('left')).toEqual([0, 0]);
    expect(xs('centre')).toEqual([0, 10]);
    expect(xs('right')).toEqual([0, 20]);
  });
});
