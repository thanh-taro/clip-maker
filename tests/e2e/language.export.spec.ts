// F-022.AC4 / INV-05: the UI language never changes an export. The same project is exported in en-US and in
// vi-VN on the app harness (tests/harness/app.html: the real `main()`, workers and export path; the language
// from the address, RULE-18), and the two files are compared: format, settings and name pattern, no text of
// either language in the bytes, and decoded frames and sound within NFR-08 (`appHarness.readExport`). The
// project is built twice from the same bytes with the same edits (a frame-coded clip with a tone, a flat photo
// with a look, a text layer of the user's own words), small and at 480, so the run stays short.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { CATALOG, LANGUAGES, type Language, type MessageId } from '../../src/copy/messages.gen';
import type { ClipSummary, ExportRead } from '../harness/app';
import type { ToneSpec } from '../harness/sound';
import { deRgb, type Rgb } from '../support/colour';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const S = 1_000_000;
const text = (lang: Language, id: MessageId): string => CATALOG[lang][id] as string;

interface Harness {
  appHarness: {
    clips(): ClipSummary[];
    state(): string;
    load(json: string): void;
    stripes(width: number, height: number, colours: readonly (readonly number[])[]): Promise<number[]>;
    toneClip(spec: ToneSpec): Promise<number[]>;
    typeText(seconds: number, content: string): void;
    readExport(
      bytes: number[],
      times: readonly number[],
      points: readonly (readonly [number, number])[],
      windows: readonly number[],
      onsetAmp: number,
      names: readonly string[],
    ): Promise<ExportRead>;
  };
}
type Json = Record<string, unknown> & { clips: Record<string, unknown>[] };

const TONE: ToneSpec = { seconds: 2, onset: 0.5, freq: 440, amp: 0.5, codec: 'aac', sampleRate: 48_000, coded: true };
/** The frame code (tests/harness/video.ts) from 10 RGB samples across the top quarter. */
const CODE_POINTS: [number, number][] = Array.from({ length: 10 }, (_, b) => [(b + 0.5) / 10, 0.25]);
const codeOf = (rgb: readonly (readonly number[])[]): number =>
  rgb.slice(0, 10).reduce((k, c, b) => (c[0]! + c[1]! + c[2]! > 3 * 128 ? k | (1 << b) : k), 0);
const COLOUR_POINTS: [number, number][] = [
  [0.5, 0.5],
  [0.3, 0.6],
  [0.7, 0.6],
  [0.5, 0.85],
];
const POINTS = [...CODE_POINTS, ...COLOUR_POINTS];
const TIMES = [0.25, 1.0, 1.5, 2.5];
const WINDOWS = [0.25, 1.0, 1.5, 2.5];
const unit = (c: readonly number[]): Rgb => [c[0]! / 255, c[1]! / 255, c[2]! / 255];

/** The project in `lang`, built the same way each time: the same media and the same edits. */
async function build(page: Page, lang: Language): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${APP}?effects=fast&lang=${lang}`);
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
  const clip = await page.evaluate((s) => (window as unknown as Harness).appHarness.toneClip(s), TONE);
  const photo = await page.evaluate(() =>
    (window as unknown as Harness).appHarness.stripes(320, 240, [[150, 110, 90]]),
  );
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('.tk-empty')
    .getByRole('button', { name: text(lang, 'action.add_media') })
    .click();
  await (
    await chooser
  ).setFiles([
    { name: 'tone.mp4', mimeType: 'video/mp4', buffer: Buffer.from(clip) },
    { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(photo) },
  ]);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Harness).appHarness.clips().length), { timeout: 30_000 })
    .toBe(2);
  const media = page.locator('.tk-media');
  await media.getByRole('button', { name: text(lang, 'action.close') }).click();
  await expect(media).toHaveCount(0);
  for (const close of await page.locator('.tk-notice__close').all()) await close.click().catch(() => undefined);
  // The same edits in each language: the photo 1 s long with a look, and a text layer of the user's words.
  const p = JSON.parse(await page.evaluate(() => (window as unknown as Harness).appHarness.state())) as Json;
  const pic = p.clips[1]!;
  pic['duration'] = 1 * S;
  pic['look'] = { id: 'natural-warm', intensity: 100 };
  await page.evaluate((j) => (window as unknown as Harness).appHarness.load(j), JSON.stringify(p));
  await page.evaluate(() => (window as unknown as Harness).appHarness.typeText(1.2, 'Đà Lạt 2026'));
}

async function exportNow(page: Page, lang: Language): Promise<{ name: string; bytes: Uint8Array }> {
  await page
    .getByRole('toolbar', { name: text(lang, 'toolbar.label') })
    .getByRole('button', { name: text(lang, 'action.export'), exact: true })
    .click();
  const panel = page.getByRole('dialog', { name: text(lang, 'export.title') }).and(page.locator('.tk-export'));
  await expect(panel).toBeVisible();
  await panel
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: '480', exact: true }) })
    .click();
  await expect(panel.getByRole('radio', { name: '480', exact: true })).toBeChecked();
  await expect(panel.getByRole('radio', { name: text(lang, 'export.q_balanced') })).toBeChecked();
  const go = panel.getByRole('button', { name: text(lang, 'action.export'), exact: true });
  await expect(go).toBeEnabled({ timeout: 30_000 });
  const download = page.waitForEvent('download', { timeout: 90_000 });
  await go.click();
  const d = await download;
  await expect(page.locator('dialog.tk-run')).toHaveAttribute('data-phase', 'done');
  return { name: d.suggestedFilename(), bytes: readFileSync(await d.path()) };
}

const UTF8 = new TextEncoder();
/** Whether `hay` holds the byte sequence `needle`. */
function contains(hay: Uint8Array, needle: Uint8Array): boolean {
  outer: for (
    let i = hay.indexOf(needle[0]!);
    i !== -1 && i <= hay.length - needle.length;
    i = hay.indexOf(needle[0]!, i + 1)
  ) {
    for (let j = 1; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Catalog texts of `lang` long enough not to occur by chance in compressed media (UTF-8, as text would be stored). */
function catalogTexts(lang: Language): string[] {
  const out = new Set<string>();
  for (const v of Object.values(CATALOG[lang])) {
    for (const s of typeof v === 'string' ? [v] : (Object.values(v) as string[])) {
      for (const part of s.split(/\{\w+\}/)) {
        const t = part.trim();
        if (UTF8.encode(t).length >= 6) out.add(t);
      }
    }
  }
  return [...out];
}

test('F-022.AC4 F-022.R4 INV-05 the same project exported in en-US and in vi-VN: same format, settings and name pattern, no language text, frames and sound within NFR-08', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const files: Record<string, { name: string; bytes: Uint8Array; read: ExportRead; state: Json }> = {};
  for (const lang of LANGUAGES) {
    await build(page, lang);
    const state = JSON.parse(await page.evaluate(() => (window as unknown as Harness).appHarness.state())) as Json;
    const { name, bytes } = await exportNow(page, lang);
    const read = await page.evaluate(
      ([b, ts, pts, ws]) =>
        (window as unknown as Harness).appHarness.readExport(b, ts, pts, ws, 0.2, ['tone.mp4', 'photo.png']),
      [Array.from(bytes), TIMES, POINTS, WINDOWS] as const,
    );
    files[lang] = { name, bytes, read, state };
  }
  const en = files['en-US']!;
  const vi = files['vi-VN']!;

  // The same project in both sessions (ids aside): the same clips, edits and text layer.
  const strip = (j: Json) => JSON.stringify(j, (k, v: unknown) => (/^(id|sourceId)$/.test(k) ? undefined : v));
  expect(strip(vi.state)).toBe(strip(en.state));

  // Same format, settings and name pattern (RULE-15: clip-<YYYYMMDD-HHMMSS>.<ext>).
  for (const f of [en, vi]) expect(f.name).toMatch(/^clip-\d{8}-\d{6}\.(mp4|webm)$/);
  expect(vi.name.split('.').pop()).toBe(en.name.split('.').pop());
  expect(vi.read.format).toBe(en.read.format);
  expect([vi.read.width, vi.read.height]).toEqual([en.read.width, en.read.height]);
  expect([en.read.width, en.read.height]).toEqual([640, 480]);
  expect(vi.read.duration).toBeCloseTo(en.read.duration, 2);
  // About 2 s of clip and 1 s of photo (the generated clip runs a few frames past 2 s).
  expect(Math.abs(en.read.duration - 3)).toBeLessThan(0.15);
  // Same settings show in the size too: Balanced at 480 for the same pictures gives files within a few %.
  expect(Math.abs(vi.bytes.length - en.bytes.length) / en.bytes.length).toBeLessThan(0.05);

  // No language-dependent text: neither language's strings, nor the source names or the library's name.
  for (const f of [en, vi]) {
    expect(f.read.found).toEqual([]);
    for (const lang of LANGUAGES) {
      const inFile = catalogTexts(lang).filter((s) => contains(f.bytes, UTF8.encode(s)));
      expect(inFile, `${f.name}: ${lang} text`).toEqual([]);
    }
  }

  // Decoded frames within NFR-08: the same source frame (within one frame) and colour ΔE00 < 4 at each point.
  for (let i = 0; i < TIMES.length; i++) {
    const a = en.read.frames[i]!;
    const b = vi.read.frames[i]!;
    expect(Math.abs(a.at - b.at), `frame time at ${TIMES[i]} s`).toBeLessThanOrEqual(1 / 30 + 1e-3);
    if (TIMES[i]! < 2) expect(codeOf(b.rgb), `frame code at ${TIMES[i]} s`).toBe(codeOf(a.rgb));
    const de = COLOUR_POINTS.map((_, j) => deRgb(unit(a.rgb[10 + j]!), unit(b.rgb[10 + j]!)));
    expect(Math.max(...de), `ΔE00 at ${TIMES[i]} s`).toBeLessThan(4);
    expect(de.reduce((x, y) => x + y, 0) / de.length, `mean ΔE00 at ${TIMES[i]} s`).toBeLessThan(2);
  }

  // Sound within NFR-08: the tone starts at the same time (within 40 ms; in fact the same sample) and the level
  // matches in every window.
  expect(en.read.sound).not.toBeNull();
  expect(vi.read.sound).not.toBeNull();
  expect(Math.abs(en.read.sound!.onset - 0.5)).toBeLessThan(0.04);
  expect(Math.abs(vi.read.sound!.onset - en.read.sound!.onset)).toBeLessThan(0.04);
  expect(vi.read.sound!.duration).toBeCloseTo(en.read.sound!.duration, 2);
  for (let i = 0; i < WINDOWS.length; i++) {
    const a = en.read.sound!.rmsDb[i]!;
    const b = vi.read.sound!.rmsDb[i]!;
    if (a < -80 && b < -80) continue; // both silent
    expect(Math.abs(a - b), `level at ${WINDOWS[i]} s`).toBeLessThan(1);
  }
});
