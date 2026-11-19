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
    undo(): void;
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
  const bytes = await page.evaluate(([c, ww, hh]) => (window as unknown as Harness).appHarness.stripes(ww, hh, [c]), [
    colour,
    w,
    h,
  ] as const);
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
/** CMP-Inspector with a text layer selected: a single section under the title COPY-inspector.text. */
const inspector = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('complementary', { name: text(lang, 'inspector.text') });
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
  for (let i = 0; i < n; i++)
    for (let j = 0; j < 6; j++) out.push([x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * j) / 5]);
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

/** A text layer for `load` (RULE-11 defaults unless given). */
function layer(id: string, from: number, to: number, extra: Partial<Layer> = {}): Layer {
  return {
    id,
    content: id,
    start: Math.round(from * S),
    end: Math.round(to * S),
    typeface: 'sans',
    size: 6,
    colour: 'white',
    style: 'outline',
    align: 'centre',
    x: 0.5,
    y: 0.8,
    fade: false,
    ...extra,
  };
}

/** Puts text layers into the session's project (one step through the harness). */
async function withLayers(page: Page, layers: Layer[]): Promise<void> {
  const p = JSON.parse(await page.evaluate(() => (window as unknown as Harness).appHarness.state())) as {
    textLayers: Layer[];
  };
  p.textLayers = layers;
  await page.evaluate((json) => (window as unknown as Harness).appHarness.load(json), JSON.stringify(p));
}

/** A tap on empty timeline space (after the project end, on the audio lane) clears the selection (RULE-21). */
async function clearSelection(page: Page): Promise<void> {
  const lane = (await page.locator('.tk-audio-lane').boundingBox())!;
  const lanes = (await page.locator('.tk-tl-lanes').boundingBox())!;
  await page.mouse.click(lanes.x + lanes.width - 8, lane.y + lane.height / 2);
  await expect(page.locator('.tk-tclip[aria-pressed="true"]')).toHaveCount(0);
}

/** Pixels per second of the timeline (the track fits the project). */
async function pxPerSecond(page: Page): Promise<number> {
  const track = (await timeline(page).locator('.tk-track').boundingBox())!;
  return track.width / 10;
}

test.describe('F-010 styling, placing and timing text (app harness)', () => {
  test('F-010.AC2 Display, size 10 %, yellow and Box chosen in the inspector: the preview shows yellow letters on a 70 % black box', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await tenSeconds(page);
    await withLayers(page, [layer('T', 0, 5, { content: 'MMM', y: 0.5 })]);
    await textItem(page, 'MMM').click();
    const panel = inspector(page);
    await expect(panel.getByRole('heading', { name: text('en-US', 'inspector.text') })).toBeVisible();
    const before = await stepsOf(page);
    await panel
      .getByRole('radiogroup', { name: text('en-US', 'text.typeface') })
      .getByRole('radio', { name: text('en-US', 'text.display') })
      .click();
    const size = panel.getByRole('spinbutton', { name: text('en-US', 'text.size') });
    await size.fill('10');
    await size.press('Enter');
    await panel
      .getByRole('radiogroup', { name: text('en-US', 'text.colour') })
      .getByRole('radio', { name: text('en-US', 'colour.yellow') })
      .click();
    await panel
      .getByRole('radiogroup', { name: text('en-US', 'text.style') })
      .getByRole('radio', { name: text('en-US', 'text.box') })
      .click();
    // Box colour appears with Box (the contrast colour, black, by default).
    await expect(
      panel
        .getByRole('radiogroup', { name: text('en-US', 'text.box_colour') })
        .getByRole('radio', { name: text('en-US', 'colour.black') }),
    ).toHaveAttribute('aria-checked', 'true');
    const [t] = await layersOf(page);
    expect([t!.typeface, t!.size, t!.colour, t!.style]).toEqual(['display', 10, 'yellow', 'box']);
    expect(await stepsOf(page)).toBe(before + 4);
    // The preview: yellow letters (255, 214, 10) on the box, 70 % black over the grey (0.3 × 90 ≈ 27).
    const pts = band(0.2, 0.8, 0.46, 0.54, 40);
    await expect
      .poll(async () => (await previewAt(page, pts)).filter((c) => c[0]! > 230 && c[1]! > 190 && c[2]! < 60).length, {
        timeout: 10_000,
      })
      .toBeGreaterThan(5);
    const at = await previewAt(page, pts);
    expect(at.filter((c) => c.every((v) => Math.abs(v - 27) <= 6)).length).toBeGreaterThan(5);
    await shot(page, 'inspector-box-wide-en-US', browserName);
  });

  test('F-010.AC3 RULE-11 dragging the text so its left edge comes within 8 px of the left safe margin snaps it there; the guides show while moving', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await tenSeconds(page);
    await withLayers(page, [layer('T', 0, 5, { content: 'Snap me', y: 0.5 })]);
    await textItem(page, 'Snap me').click();
    const hit = page.locator('.tk-text-layer__hit[data-selected]');
    await settled(hit);
    const frame = (await canvas(page).boundingBox())!;
    const b = (await hit.boundingBox())!;
    const margin = frame.x + 0.05 * frame.width;
    const dx = margin + 6 - b.x;
    const before = await stepsOf(page);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx / 2, b.y + b.height / 2, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2, { steps: 4 });
    // The left margin's guide marks the snap (the centre line the unmoved height sits on marks it too).
    await expect(page.locator('.tk-text-layer__guide--v[data-snapped]')).toHaveCount(1);
    await shot(page, 'preview-text-moving-wide-en-US', browserName);
    await page.mouse.up();
    await expect.poll(async () => (await layersOf(page))[0]!.x).not.toBe(0.5);
    const after = (await hit.boundingBox())!;
    // Its left edge sits on the margin (within a pixel of layout rounding).
    expect(Math.abs(after.x - margin)).toBeLessThanOrEqual(1.5);
    expect(await stepsOf(page)).toBe(before + 1);
  });

  test('F-010.AC4 F-004.R3 dragging a 2–5 s layer’s end handle to 8 s on the text lane ends it at 8 s (one step)', async ({
    page,
  }) => {
    await open(page);
    await tenSeconds(page);
    await withLayers(page, [layer('T', 2, 5, { content: 'Trim me' })]);
    await textItem(page, 'Trim me').click();
    const end = page.locator('.tk-text-lane .tk-trim--end');
    await settled(end);
    const px = await pxPerSecond(page);
    const b = (await end.boundingBox())!;
    const before = await stepsOf(page);
    const grab = b.x + b.width - 1;
    await page.mouse.move(grab, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(grab + 1.5 * px, b.y + b.height / 2, { steps: 4 });
    await page.mouse.move(grab + 3 * px, b.y + b.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await layersOf(page))[0]!.end).toBe(8 * S);
    expect((await layersOf(page))[0]!.start).toBe(2 * S);
    expect(await stepsOf(page)).toBe(before + 1);
  });

  test('F-004.AC5 F-004.R3 a text layer at 1–5 s split at 3 s with the Split control is two layers, 1–3 s and 3–5 s (text half)', async ({
    page,
  }) => {
    await open(page);
    await tenSeconds(page);
    await withLayers(page, [layer('T', 1, 5, { content: 'Split me' })]);
    await textItem(page, 'Split me').click();
    await setPlayhead(page, 3);
    await timeline(page)
      .getByRole('toolbar')
      .getByRole('button', { name: text('en-US', 'action.split') })
      .click();
    await expect
      .poll(async () => (await layersOf(page)).map((t) => [t.start, t.end]))
      .toEqual([
        [1 * S, 3 * S],
        [3 * S, 5 * S],
      ]);
    await expect(page.locator('.tk-tclip')).toHaveCount(2);
  });

  test('F-010.AC6 RULE-11 with 495 characters, pasting 20 more (with tone marks) adds only 5 whole characters; at 500 typing is refused and the limit notice shows', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await tenSeconds(page);
    await addText(page).click();
    await field(page).fill('a'.repeat(495));
    await expect(page.locator('.tk-texteditor__bar')).toContainText('495 / 500');
    // Decomposed letters (e + combining marks) are kept whole and composed (NFC).
    const paste = 'ệ'.normalize('NFD').repeat(3) + 'Đà Lạt 2026 ok';
    await field(page).evaluate((el, data) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', data);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, paste);
    await expect(page.locator('.tk-texteditor__bar')).toContainText('500 / 500');
    await expect(page.locator('.tk-texteditor__count[data-limit]')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: text('en-US', 'text.char_limit') })).toBeVisible();
    const value = await field(page).inputValue();
    expect(value.slice(495)).toBe('ệệệĐà');
    // Typing at the limit is not accepted.
    await page.keyboard.type('xyz');
    expect(await field(page).inputValue()).toBe(value);
    await shot(page, 'editing-limit-wide-en-US', browserName);
    await page.keyboard.press('Escape');
    expect((await layersOf(page))[0]!.content.slice(495)).toBe('ệệệĐà');
  });

  test('F-010.AC7 with two overlapping layers, Send back on the top one puts the other on top in the preview', async ({
    page,
  }) => {
    await open(page);
    await tenSeconds(page);
    const big = { content: 'MMMM', size: 20, y: 0.5, style: 'box' } as const;
    await withLayers(page, [
      layer('A', 0, 5, { ...big, colour: 'red', boxColour: 'red' }),
      layer('B', 0, 5, { ...big, content: 'MMMM ', colour: 'blue', boxColour: 'blue' }),
    ]);
    const centre: Point[] = [[0.5, 0.5]];
    const dominant = async () => {
      const [c] = await previewAt(page, centre);
      return c![0]! > c![2]! ? 'red' : 'blue';
    };
    await expect.poll(dominant, { timeout: 10_000 }).toBe('blue');
    await page.locator('.tk-tclip').nth(1).click();
    await inspector(page)
      .getByRole('button', { name: text('en-US', 'text.send_back') })
      .click();
    expect((await layersOf(page)).map((t) => t.id)).toEqual(['B', 'A']);
    await expect.poll(dominant, { timeout: 10_000 }).toBe('red');
    // Bring forward puts it back.
    await inspector(page)
      .getByRole('button', { name: text('en-US', 'text.bring_forward') })
      .click();
    await expect.poll(dominant, { timeout: 10_000 }).toBe('blue');
  });

  test('F-010.AC8 RULE-13 a layer of only spaces is removed when editing ends, leaving no step', async ({ page }) => {
    await open(page);
    await tenSeconds(page);
    const before = await stepsOf(page);
    await addText(page).click();
    await page.keyboard.type('   ');
    await page.keyboard.press('Escape');
    await expect(field(page)).toHaveCount(0);
    expect(await layersOf(page)).toEqual([]);
    expect(await stepsOf(page)).toBe(before);
    await expect(page.locator('.tk-tclip')).toHaveCount(0);
  });

  test('F-010.AC9 RULE-20 in an empty project, T adds a layer from 0 to 3 s and opens the editor; Mod+Enter finishes', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await page.locator('body').click();
    await page.keyboard.press('t');
    await expect(field(page)).toBeFocused();
    await page.keyboard.type('Xin chào');
    await page.keyboard.press(`${mod(browserName)}+Enter`);
    await expect(field(page)).toHaveCount(0);
    const [t] = await layersOf(page);
    expect([t!.content, t!.start, t!.end]).toEqual(['Xin chào', 0, 3 * S]);
  });

  test('F-010.AC10 RULE-20 RULE-21 Later moves the selected text one frame later; Alt+Left one frame earlier; Shift+Alt+Right 1 s', async ({
    page,
  }) => {
    await open(page);
    await tenSeconds(page);
    await withLayers(page, [layer('T', 2, 5, { content: 'Move me' })]);
    await textItem(page, 'Move me').click();
    const later = timeline(page)
      .getByRole('toolbar')
      .getByRole('button', { name: text('en-US', 'action.time_later') });
    await later.click();
    const frame = S / 30;
    await expect.poll(async () => (await layersOf(page))[0]!.start).toBe(Math.floor(2 * S + frame));
    await textItem(page, 'Move me').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect.poll(async () => (await layersOf(page))[0]!.start).toBe(2 * S);
    await page.keyboard.press('Shift+Alt+ArrowRight');
    await expect.poll(async () => (await layersOf(page))[0]!.start).toBe(3 * S);
    expect((await layersOf(page))[0]!.end).toBe(6 * S);
  });

  test('F-010.AC11 RULE-10 with the text fade on, the text is fully transparent at its start and fully shown at 0.3 s', async ({
    page,
  }) => {
    await open(page);
    await tenSeconds(page);
    await withLayers(page, [layer('T', 2, 5, { content: 'MMMM', size: 12, y: 0.5, style: 'plain' })]);
    await textItem(page, 'MMMM').click();
    await inspector(page)
      .getByRole('button', { name: text('en-US', 'text.fade') })
      .click();
    expect((await layersOf(page))[0]!.fade).toBe(true);
    // Nothing selected: the preview shows the picture alone (no selection outline over the text).
    await clearSelection(page);
    const pts = band(0.2, 0.8, 0.46, 0.54, 40);
    const white = async () => (await previewAt(page, pts)).filter((c) => c.every((v) => v > 240)).length;
    await setPlayhead(page, 2);
    await expect.poll(() => inkAt(page, pts, 8), { timeout: 10_000 }).toBe(0);
    await setPlayhead(page, 2.3);
    await expect.poll(white, { timeout: 10_000 }).toBeGreaterThan(5);
  });

  test('F-010.AC12 duplicating a layer and deleting the original leaves one layer with the same content and times', async ({
    page,
  }) => {
    await open(page);
    await tenSeconds(page);
    await withLayers(page, [layer('T', 2, 5, { content: 'Twin' })]);
    await textItem(page, 'Twin').click();
    const tools = timeline(page).getByRole('toolbar');
    await tools.getByRole('button', { name: text('en-US', 'action.duplicate') }).click();
    await expect(page.locator('.tk-tclip')).toHaveCount(2);
    // The copy is selected and on top; select the original and delete it.
    await page.locator('.tk-tclip[data-text-id="T"]').click();
    await tools.getByRole('button', { name: text('en-US', 'action.delete') }).click();
    const left = await layersOf(page);
    expect(left.map((t) => [t.content, t.start, t.end])).toEqual([['Twin', 2 * S, 5 * S]]);
    expect(left[0]!.id).not.toBe('T');
  });

  test('CMP-TextEditor double-clicking a text item edits it; one later session is one step; activating the selected item again edits it', async ({
    page,
  }) => {
    await open(page);
    await tenSeconds(page);
    await withLayers(page, [layer('T', 2, 5, { content: 'Hi' })]);
    const before = await stepsOf(page);
    await textItem(page, 'Hi').dblclick();
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveValue('Hi');
    await page.keyboard.press('End');
    await page.keyboard.type(' there');
    // Keys inside the field are text, never shortcuts (RULE-20): Space typed, no playback; Delete edits.
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    expect((await layersOf(page))[0]!.content).toBe('Hi ther');
    expect(await stepsOf(page)).toBe(before + 1);
    await expect(textItem(page, 'Hi ther')).toBeFocused();
    // Enter on the selected item opens the editor again.
    await page.keyboard.press('Enter');
    await expect(field(page)).toBeFocused();
    await page.keyboard.press('Escape');
  });

  test('RULE-20 IME: Vietnamese composition is never committed half-composed, and Esc mid-composition does not finish editing', async ({
    page,
  }) => {
    await open(page);
    await tenSeconds(page);
    await addText(page).click();
    await page.keyboard.type('Vi');
    const before = (await layersOf(page))[0]!.content;
    expect(before).toBe('Vi');
    // Telex-style composition "e" → "ê" → "ệ" (synthetic composition events, as an input method sends them).
    await field(page).evaluate((el: HTMLTextAreaElement) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true }));
      for (const step of ['e', 'ê', 'ệ']) {
        el.value = `Vi${step}`;
        el.dispatchEvent(
          new InputEvent('input', { data: step, inputType: 'insertCompositionText', isComposing: true, bubbles: true }),
        );
      }
      el.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      el.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Delete',
          code: 'Delete',
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    // Mid-composition nothing is committed and the editor stays open.
    expect((await layersOf(page))[0]!.content).toBe('Vi');
    await expect(field(page)).toBeFocused();
    await field(page).evaluate((el: HTMLTextAreaElement) => {
      el.value = 'Việ';
      el.dispatchEvent(new CompositionEvent('compositionend', { data: 'ệ', bubbles: true }));
    });
    await expect.poll(async () => (await layersOf(page))[0]!.content).toBe('Việ');
    await expect(page.locator('.tk-texteditor__bar')).toContainText('3 / 500');
    await page.keyboard.press('Escape');
    await expect(field(page)).toHaveCount(0);
  });

  test('Q96 F-014 an edit landing while typing (a media batch) keeps what was typed as its own step; typing goes on in the editor', async ({
    page,
  }) => {
    await open(page);
    await tenSeconds(page);
    const before = await stepsOf(page);
    await addText(page).click();
    await page.keyboard.type('Hel');
    // An outside edit (as a batch of media landing) cuts the editing session's step.
    const p = await stateOf(page);
    await page.evaluate(
      (json) => (window as unknown as Harness).appHarness.load(json),
      JSON.stringify({ ...p, frame: { ...p.frame, background: 'red' } }),
    );
    await expect(field(page)).toBeFocused();
    await page.keyboard.type('lo');
    await page.keyboard.press('Escape');
    expect((await layersOf(page))[0]!.content).toBe('Hello');
    expect(await stepsOf(page)).toBe(before + 3);
    await undoButton(page).click();
    expect((await layersOf(page))[0]!.content).toBe('Hel');
  });
});

test.describe('F-010 layouts and languages (app harness)', () => {
  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`NFR-06 F-010 CMP-TextEditor and CMP-Inspector "text layer" at 1280 px pass axe (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, lang);
      await tenSeconds(page, lang);
      await addText(page, lang).click();
      await page.keyboard.type('Đà Lạt 2026 — mùa hoa dã quỳ');
      await expect(page.locator('.tk-texteditor__bar')).toContainText('28 / 500');
      await shot(page, `editing-vi-wrap-wide-${lang}`, browserName);
      await axe(page);
      await page.keyboard.press('Escape');
      await expect(inspector(page, lang).getByRole('heading', { name: text(lang, 'inspector.text') })).toBeVisible();
      await shot(page, `inspector-text-wide-${lang}`, browserName);
      await axe(page);
    });

    test(`NFR-06 RULE-21 F-010 the phone Text tab adds text; editing shows Done in the top bar and the Font, Colour and Style bar; axe at 320 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      await tenSeconds(page, lang);
      await page.getByRole('tab', { name: text(lang, 'inspector.text') }).click();
      const sheet = page.locator('#tk-sheet-text');
      await expect(sheet).toBeVisible();
      await axe(page);
      await sheet.getByRole('button', { name: text(lang, 'action.add_text') }).click();
      await expect(field(page, lang)).toBeFocused();
      await page.keyboard.type('Chúc mừng sinh nhật');
      const top = toolbar(page, lang).getByRole('button', { name: text(lang, 'action.done') });
      await expect(top).toBeVisible();
      await page.locator('[data-action="text-font"]').click();
      await expect(page.locator('[data-action="text-font"]')).toHaveAttribute('aria-pressed', 'true');
      await page
        .locator('.tk-texteditor__picker')
        .getByRole('radio', { name: text(lang, 'text.rounded') })
        .click();
      await expect(field(page, lang)).toBeFocused();
      await shot(page, `editing-narrow-${lang}`, browserName);
      await axe(page);
      await top.click();
      await expect(field(page, lang)).toHaveCount(0);
      const [t] = await layersOf(page);
      expect([t!.content, t!.typeface]).toEqual(['Chúc mừng sinh nhật', 'rounded']);
      // The Text tab's sheet comes back, holding the selected layer's section at touch size.
      await expect(sheet.locator('[data-section="text"]')).toBeVisible();
      await shot(page, `text-sheet-narrow-${lang}`, browserName);
      await axe(page);
    });
  }
});

test.describe('F-010 text in the export (media harness, INV-02)', () => {
  test('F-010.AC5 F-010.R5 INV-02 NFR-08 NFR-01 every typeface with every Vietnamese tone mark: the decoded export matches the preview paint, the bundled faces draw the glyphs, and no font is requested', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    await page.goto(HARNESS);
    await page.waitForFunction(() => 'harness' in window);
    const fonts: string[] = [];
    page.on('request', (r) => {
      if (/\.woff2?(\?|$)/.test(r.url())) fonts.push(r.url());
    });
    const spec: TextExportSpec = {
      lines: ['Chúc mừng sinh nhật', 'à á ả ã ạ ằ ắ ẳ ẵ ặ ầ ấ ẩ ẫ ậ', 'ề ế ể ễ ệ ờ ớ ở ỡ ợ ừ ứ ử ữ ự Đđ'],
    };
    // A first export loads every export module; the measured one then runs offline.
    await page.evaluate((s) => (window as unknown as Harness).harness.export.textExport(s), { lines: ['Hi'] });
    fonts.length = 0;
    // Offline on Chromium only. WebKit's offline emulation also fails reading the in-memory result (a Blob), so
    // on WebKit this test checks that no font is requested, not that the export works offline.
    const offline = browserName === 'chromium';
    if (offline) await page.context().setOffline(true);
    const r = await page.evaluate((s) => (window as unknown as Harness).harness.export.textExport(s), spec);
    if (offline) await page.context().setOffline(false);
    expect(r.ok, r.reason).toBe(true);
    expect(fonts).toEqual([]);
    for (const face of r.faces) {
      // The bundled face is loaded and is what drew the text (not a fallback): its glyphs differ from a generic one.
      expect(face.loaded, face.typeface).toBe(true);
      expect(face.differsFromFallback, face.typeface).toBe(true);
      // Tone marks draw: "ệ" has ink where "e" has none (above and below the letter).
      expect(face.marksDrawn, face.typeface).toBe(true);
      // INV-02 / NFR-08: the decoded export's text matches the paint (the preview's picture) of the same frame.
      expect(face.inkExport, face.typeface).toBeGreaterThan(200);
      expect(Math.abs(face.inkExport - face.inkPaint) / face.inkPaint, face.typeface).toBeLessThan(0.15);
      expect(face.meanDiff, face.typeface).toBeLessThan(6);
      // The preview's own bitmaps (made at its canvas's size, scaled up) draw the same text: the same lines in
      // the same place (the ink box within 3 px), and about the same ink (scaling softens the edges).
      expect(face.boxShift, face.typeface).toBeLessThanOrEqual(3);
      expect(Math.abs(face.inkPreview - face.inkPaint) / face.inkPaint, face.typeface).toBeLessThan(0.4);
      // Every character is drawn by the bundled face itself, none by a fallback.
      expect(face.fallbackGlyphs, face.typeface).toEqual([]);
    }
  });
});

test.describe('F-002 the preview with everything applied (app harness)', () => {
  test('F-002.AC1 F-002.R1 inside a cross-fade the preview shows both clips blended, with the look and the text layer', async ({
    page,
  }) => {
    await open(page);
    const RED: Rgb = [200, 40, 40];
    const BLUE: Rgb = [40, 40, 200];
    await add(page, [await photo(page, 'red.png', RED), await photo(page, 'blue.png', BLUE)]);
    // Two 3 s photos joined by a 1 s cross-fade (F-009), both with the B&W Classic look (F-008), and a text
    // layer over the whole project (F-010): set through the harness, drawn by the real engine.
    const p = JSON.parse(await page.evaluate(() => (window as unknown as Harness).appHarness.state())) as {
      clips: { duration?: number; crossFadeNext: number; look: { id: string; intensity: number } | null }[];
      textLayers: Layer[];
    };
    p.clips.forEach((c) => {
      c.duration = 3 * S;
      c.look = { id: 'bw-classic', intensity: 100 };
    });
    p.clips[0]!.crossFadeNext = 1 * S;
    p.textLayers = [layer('T', 0, 5, { content: 'MMMM', y: 0.2, size: 10, style: 'plain' })];
    await page.evaluate((json) => (window as unknown as Harness).appHarness.load(json), JSON.stringify(p));
    await expect(page.locator('.tk-transport')).toContainText('/ 0:05');
    const centre: Point[] = [[0.5, 0.6]];
    const grey = (c: number[]) => Math.abs(c[0]! - c[1]!) < 12 && Math.abs(c[1]! - c[2]!) < 12;
    /** The centre's grey level once the paint has settled at `seconds`. */
    const levelAt = async (seconds: number): Promise<number> => {
      await setPlayhead(page, seconds);
      let last: number[] = [];
      await expect
        .poll(
          async () => {
            const [c] = await previewAt(page, centre);
            const same = JSON.stringify(c) === JSON.stringify(last);
            last = c!;
            return same && grey(c!);
          },
          { timeout: 10_000 },
        )
        .toBe(true);
      return last[0]!;
    };
    const a = await levelAt(1);
    const b = await levelAt(4.5);
    const mid = await levelAt(2.5);
    // The look made both greys (B&W), they differ, and inside the cross-fade the picture is between the two.
    expect(Math.abs(a - b)).toBeGreaterThan(10);
    expect(mid).toBeGreaterThan(Math.min(a, b) + 2);
    expect(mid).toBeLessThan(Math.max(a, b) - 2);
    // The text layer is drawn over it (white letters near the top).
    const ink = await previewAt(page, band(0.25, 0.75, 0.16, 0.24, 30));
    expect(ink.filter((c) => c.every((v) => v > 235)).length).toBeGreaterThan(5);
  });
});

test.describe('F-010 editing-session edges (app harness)', () => {
  test('RULE-11 IME Done mid-composition keeps the word being composed', async ({ page }) => {
    await open(page);
    await tenSeconds(page);
    await addText(page).click();
    await page.keyboard.type('Đà ');
    // A phone keyboard or Telex composes "Lạt" and Done is tapped before the composition ends.
    await field(page).evaluate((el: HTMLTextAreaElement) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true }));
      for (const step of ['L', 'La', 'Lạ', 'Lạt']) {
        el.value = `Đà ${step}`;
        el.dispatchEvent(
          new InputEvent('input', { data: step, inputType: 'insertCompositionText', isComposing: true, bubbles: true }),
        );
      }
    });
    expect((await layersOf(page))[0]!.content).toBe('Đà ');
    await done(page).click();
    await expect(field(page)).toHaveCount(0);
    expect((await layersOf(page))[0]!.content).toBe('Đà Lạt');
  });

  test('RULE-20 while editing no shortcut acts, even with focus on Done: Backspace, T, Mod+Z and the arrows are ignored; Esc finishes', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await tenSeconds(page);
    await addText(page).click();
    await page.keyboard.type('Hi');
    // Focus on Done (WebKit's Tab skips buttons, so it is moved there directly).
    await done(page).focus();
    await expect(done(page)).toBeFocused();
    const before = await stateOf(page);
    for (const key of ['Backspace', 'Delete', 't', 's', `${mod(browserName)}+KeyZ`, 'Alt+ArrowRight', 'ArrowRight'])
      await page.keyboard.press(key);
    expect(await stateOf(page)).toEqual(before);
    await expect(field(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(field(page)).toHaveCount(0);
    expect((await layersOf(page)).map((t) => t.content)).toEqual(['Hi']);
  });

  test('Q96 undo while editing an existing layer: the field shows the restored text and the next keystroke types into it', async ({
    page,
  }) => {
    await open(page);
    await tenSeconds(page);
    await withLayers(page, [layer('T', 0, 5, { content: 'Hi' })]);
    await textItem(page, 'Hi').dblclick();
    await expect(field(page)).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.type(' there');
    expect((await layersOf(page))[0]!.content).toBe('Hi there');
    // Undo from outside the field (as the toolbar's would, without moving focus): the session is cut.
    await page.evaluate(() => (window as unknown as Harness).appHarness.undo());
    await expect(field(page)).toHaveValue('Hi');
    await expect(field(page)).toBeFocused();
    await page.keyboard.type('!');
    expect((await layersOf(page))[0]!.content).toBe('Hi!');
    await page.keyboard.press('Escape');
    expect((await layersOf(page))[0]!.content).toBe('Hi!');
  });

  test('F-010.R6 a paste that fits goes in as typed, so the field’s own undo takes it back', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await tenSeconds(page);
    await addText(page).click();
    await page.keyboard.type('Xin ');
    // An over-long or decomposed paste is shortened and inserted as typing (the field's undo keeps working).
    await field(page).evaluate((el, data) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', data);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, 'chào'.normalize('NFD'));
    await expect(field(page)).toHaveValue('Xin chào');
    expect((await layersOf(page))[0]!.content).toBe('Xin chào');
    await page.keyboard.press(`${mod(browserName)}+KeyZ`);
    // The paste is undone (WebKit groups it with the typing before it), and the layer follows the field.
    await expect(field(page)).not.toHaveValue('Xin chào');
    const now = await field(page).inputValue();
    expect(['Xin ', '']).toContain(now);
    expect((await layersOf(page))[0]!.content).toBe(now);
    await page.keyboard.press('Escape');
  });
});
