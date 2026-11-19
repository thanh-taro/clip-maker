// F-010 Add text through the real UI on the app harness (tests/harness/app.html: the real `main()`, workers,
// compositor and text rasteriser): CMP-Toolbar's Add text and the T key, CMP-TextEditor (typing, the count,
// Done / Esc / Mod+Enter, the 500-character limit, paste, Vietnamese composition), CMP-Preview's text overlay
// (select, drag with snapping, handles), CMP-Timeline's text lane (items, trim handles, Earlier / Later, drag),
// CMP-Inspector's text section and the phone Text tab (320 px). Test media is a flat photo made in the page
// (`appHarness.stripes()`); preview pixels come from a screenshot of the preview canvas (`appHarness.pixels()`).
// The export half of F-010.R5 / AC5 (preview vs decoded export, INV-02) runs on the media harness
// (tests/harness/export.ts `textExport`). Axe at 320 and 1280 px in en-US and vi-VN.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSummary, ProjectSummary } from '../harness/app';
import type { TextExportReport, TextExportSpec } from '../harness/export';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;
const SHOTS = fileURLToPath(new URL('../../.build-my-app/reports/screens/F-010/', import.meta.url));
const S = 1_000_000;

type Point = readonly [number, number];
type Rgb = readonly [number, number, number];
interface Layer {
  readonly id: string;
  readonly content: string;
  readonly start: number;
  readonly end: number;
  readonly typeface: string;
  readonly size: number;
  readonly colour: string;
  readonly style: string;
  readonly boxColour?: string;
  readonly align: string;
  readonly x: number;
  readonly y: number;
  readonly fade: boolean;
}
interface Harness {
  appHarness: {
    project(): ProjectSummary;
    clips(): ClipSummary[];
    state(): string;
    load(json: string): void;
    setPlayhead(seconds: number): void;
    stripes(width: number, height: number, colours: readonly (readonly number[])[]): Promise<number[]>;
    pixels(png: string, points: readonly Point[]): Promise<{ width: number; height: number; at: number[][] }>;
  };
  harness: { export: { textExport(spec: TextExportSpec): Promise<TextExportReport> } };
}
const stateOf = async (page: Page) =>
  JSON.parse(await page.evaluate(() => (window as unknown as Harness).appHarness.state())) as {
    textLayers: Layer[];
    frame: { frameRate: number };
  };
const layersOf = async (page: Page) => (await stateOf(page)).textLayers;
const stepsOf = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as Harness).appHarness.project())).steps;
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const setPlayhead = (page: Page, s: number) =>
  page.evaluate((x) => (window as unknown as Harness).appHarness.setPlayhead(x), s);

async function open(page: Page, lang: Language = 'en-US'): Promise<void> {
  await page.goto(`${APP}?effects=fast&lang=${lang}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}

const GREY: Rgb = [90, 90, 90];

/** A flat photo (`w` × `h`). */
async function photo(page: Page, name: string, colour: Rgb, w = 180, h = 320): Promise<Payload> {
  const bytes = await page.evaluate(
    ([c, ww, hh]) => (window as unknown as Harness).appHarness.stripes(ww, hh, [c]),
    [colour, w, h] as const,
  );
  return { name, mimeType: 'image/png', buffer: Buffer.from(bytes) };
}

/** Adds files through the empty state's Add media, then closes the media panel (drawer or sheet). */
async function add(page: Page, files: Payload[], lang: Language = 'en-US'): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('.tk-empty')
    .getByRole('button', { name: text(lang, 'action.add_media') })
    .click();
  await (await chooser).setFiles(files);
  await expect.poll(async () => (await clipsOf(page)).length, { timeout: 30_000 }).toBe(files.length);
  const media = page.locator('.tk-media');
  await media.getByRole('button', { name: text(lang, 'action.close') }).click();
  await expect(media).toHaveCount(0);
  await closeNotices(page);
}

/** A 10 s project: one grey 9:16 photo of 10 s (RULE-05 photo duration set through the harness). */
async function tenSeconds(page: Page, lang: Language = 'en-US'): Promise<void> {
  await add(page, [await photo(page, 'grey.png', GREY)], lang);
  const st = await stateOf(page);
  const p = JSON.parse(JSON.stringify(st)) as { clips: { duration?: number }[] };
  p.clips[0]!.duration = 10 * S;
  await page.evaluate((json) => (window as unknown as Harness).appHarness.load(json), JSON.stringify(p));
  await expect(page.locator('.tk-transport')).toContainText('/ 0:10');
}

async function closeNotices(page: Page): Promise<void> {
  for (const close of await page.locator('.tk-notice__close').all()) await close.click();
}

const toolbar = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('toolbar', { name: text(lang, 'toolbar.label') });
const addText = (page: Page, lang: Language = 'en-US') =>
  toolbar(page, lang).getByRole('button', { name: text(lang, 'action.add_text'), exact: true });
const field = (page: Page, lang: Language = 'en-US') => page.getByRole('textbox', { name: text(lang, 'text.field') });
const done = (page: Page, lang: Language = 'en-US') =>
  page.locator('.tk-texteditor__bar').getByRole('button', { name: text(lang, 'text.done') });
const timeline = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('region', { name: text(lang, 'timeline.label') });
const textItem = (page: Page, content: string) => page.locator('.tk-tclip').filter({ hasText: content });
const inspector = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('complementary', { name: text(lang, 'inspector.label') });
const undoButton = (page: Page, lang: Language = 'en-US') =>
  toolbar(page, lang).getByRole('button', { name: text(lang, 'action.undo'), exact: true });
const mod = (browserName: string) => (browserName === 'webkit' ? 'Meta' : 'ControlOrMeta');

const canvas = (page: Page) => page.locator('.tk-frame canvas');
async function previewAt(page: Page, points: readonly Point[]): Promise<number[][]> {
  const png = (await canvas(page).screenshot()).toString('base64');
  return (
    await page.evaluate(([p, pts]) => (window as unknown as Harness).appHarness.pixels(p, pts), [png, points] as const)
  ).at;
}
/** How many of `points` differ from the grey background by more than `by` (text ink). */
async function inkAt(page: Page, points: readonly Point[], by = 60): Promise<number> {
  const at = await previewAt(page, points);
  return at.filter((c) => c.some((v, i) => Math.abs(v - GREY[i]!) > by)).length;
}
/** A grid of points over a band of the frame (fractions). */
function band(x0: number, x1: number, y0: number, y1: number, n = 24): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < 6; j++) out.push([x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * j) / 5]);
  return out;
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

async function shot(page: Page, name: string, browserName: string): Promise<void> {
  if (browserName !== 'chromium') return;
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

/** Waits until a locator's box stops moving (the layout has settled). */
async function settled(target: Locator): Promise<void> {
  let last = '';
  await expect
    .poll(
      async () => {
        const b = await target.boundingBox();
        const now = JSON.stringify(b);
        const same = now === last;
        last = now;
        return same && b !== null;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}

test.describe('F-010 add text (app harness)', () => {
  test('F-010.AC1 adding text at 2 s in a 10 s project and typing "Đà Lạt 2026": a 2–5 s layer centred at 80 % height, Sans, white with an outline, in the preview', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await tenSeconds(page);
    await setPlayhead(page, 2);
    const before = await stepsOf(page);
    await addText(page).click();
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-state', 'editing-text');
    await expect(field(page)).toBeFocused();
    await page.keyboard.type('Đà Lạt 2026');
    await expect(page.locator('.tk-texteditor__bar')).toContainText('11 / 500');
    await shot(page, 'editing-caret-wide-en-US', browserName);
    await done(page).click();
    await expect(field(page)).toHaveCount(0);
    const [t] = await layersOf(page);
    expect([t!.content, t!.start, t!.end, t!.typeface, t!.colour, t!.style, t!.x, t!.y]).toEqual([
      'Đà Lạt 2026',
      2 * S,
      5 * S,
      'sans',
      'white',
      'outline',
      0.5,
      0.8,
    ]);
    // RULE-13: adding plus typing until editing ends is one step.
    expect(await stepsOf(page)).toBe(before + 1);
    // The preview shows it: white glyphs and the black outline around 80 % height, centred; nothing at 30 %.
    await expect.poll(() => inkAt(page, band(0.3, 0.7, 0.77, 0.83)), { timeout: 10_000 }).toBeGreaterThan(10);
    expect(await inkAt(page, band(0.3, 0.7, 0.27, 0.33))).toBe(0);
    const ink = await previewAt(page, band(0.25, 0.75, 0.76, 0.84, 40));
    expect(ink.some((c) => c.every((v) => v > 230))).toBe(true);
    expect(ink.some((c) => c.every((v) => v < 30))).toBe(true);
    // The timeline's text lane shows the item, selected.
    await expect(textItem(page, 'Đà Lạt 2026')).toHaveAttribute('aria-pressed', 'true');
    await shot(page, 'selected-wide-en-US', browserName);
  });
});
