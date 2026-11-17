// F-007 adjust colour and light through the real UI on the app harness (tests/harness/app.html: the real
// `main()`, workers and compositor): CMP-Inspector's Adjust tab (wide), the phone Adjust sheet (320 px), the
// compare hold (control and \ key) with CMP-Preview's "holding compare" pill, Copy / Paste colour (buttons
// and Mod+C / Mod+V), Apply to all clips. Test media is made in the page: photos of flat vertical stripes
// (`appHarness.stripes()`). Preview pixels come from a screenshot of the preview canvas read back in the
// page (`appHarness.pixels()`). The export halves run on the media harness (tests/harness/export.ts
// `gradeExport`, `grainParity`): the real export workers, the file decoded, next to the compositor's paint
// of the same frame (INV-02). Axe at 320 and 1280 px in en-US and vi-VN.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { reference } from '../../src/compositor';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSetup, ClipSummary } from '../harness/app';
import { deRgb, lab, type Rgb } from '../support/colour';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;
const SHOTS = fileURLToPath(new URL('../../.build-my-app/reports/screens/F-007/', import.meta.url));

type Point = readonly [number, number];
interface Harness {
  appHarness: {
    project(): { steps: number };
    clips(): ClipSummary[];
    setClip(index: number, setup: ClipSetup): void;
    state(): string;
    stripes(width: number, height: number, colours: readonly (readonly number[])[]): Promise<number[]>;
    pixels(png: string, points: readonly Point[]): Promise<{ width: number; height: number; at: number[][] }>;
  };
}
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const stepsOf = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as Harness).appHarness.project())).steps;
const stateOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.state());
const adjOf = async (page: Page, i = 0) => (await clipsOf(page))[i]!.adjustments;

async function open(page: Page, lang: Language = 'en-US'): Promise<void> {
  await page.goto(`${APP}?effects=fast&lang=${lang}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}

const DARK = [60, 60, 60];
const MID = [128, 128, 128];
const MUTED = [150, 110, 90];

/** A 16:9 photo (320 × 180) of vertical stripes. */
async function photo(page: Page, name: string, colours: readonly (readonly number[])[]): Promise<Payload> {
  const bytes = await page.evaluate(([c]) => (window as unknown as Harness).appHarness.stripes(320, 180, c), [
    colours,
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
  await expect.poll(async () => (await clipsOf(page)).length, { timeout: 20_000 }).toBe(files.length);
  const media = page.locator('.tk-media');
  await media.getByRole('button', { name: text(lang, 'action.close') }).click();
  await expect(media).toHaveCount(0);
  for (const close of await page.locator('.tk-notice__close').all()) await close.click();
}

const timeline = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('region', { name: text(lang, 'timeline.label') });
const clipButton = (page: Page, name: string, lang: Language = 'en-US') =>
  timeline(page, lang).getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')} `) });
const inspector = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('complementary', { name: text(lang, 'inspector.label') });
const tabs = (page: Page, lang: Language = 'en-US') =>
  inspector(page, lang).getByRole('tablist', { name: text(lang, 'inspector.label') });
const adjustPanel = (page: Page, lang: Language = 'en-US') =>
  inspector(page, lang).getByRole('tabpanel', { name: text(lang, 'inspector.adjust') });
const row = (scope: Locator, id: `adjust.${string}` & CopyId, lang: Language = 'en-US') =>
  scope.getByRole('group', { name: text(lang, id), exact: true });
const slider = (scope: Locator, id: `adjust.${string}` & CopyId, lang: Language = 'en-US') =>
  row(scope, id, lang).getByRole('slider');
const field = (scope: Locator, id: `adjust.${string}` & CopyId, lang: Language = 'en-US') =>
  row(scope, id, lang).getByRole('spinbutton');
const button = (scope: Locator, id: CopyId, lang: Language = 'en-US') =>
  scope.getByRole('button', { name: text(lang, id), exact: true });
const undoButton = (page: Page) =>
  page
    .getByRole('toolbar', { name: text('en-US', 'toolbar.label') })
    .getByRole('button', { name: text('en-US', 'action.undo'), exact: true });
const canvas = (page: Page) => page.locator('.tk-frame canvas');

async function previewAt(page: Page, points: readonly Point[]): Promise<number[][]> {
  const png = (await canvas(page).screenshot()).toString('base64');
  const r = await page.evaluate(([p, pts]) => (window as unknown as Harness).appHarness.pixels(p, pts), [
    png,
    points,
  ] as const);
  return r.at;
}

const near = (got: readonly number[], want: readonly number[], tol: number): boolean =>
  got.every((v, i) => Math.abs(v - want[i]!) <= tol);
/** The CPU reference of RULE-08 on an 8-bit colour (the shaders must match it, ADR-0006 §6). */
const graded = (c: readonly number[], adj: Record<string, number>): number[] =>
  reference.grade([c[0]! / 255, c[1]! / 255, c[2]! / 255], adj).map((x) => Math.round(x * 255));

/** Waits until the preview's colours at `points` pass `check`. */
async function expectPreview(page: Page, points: readonly Point[], check: (at: number[][]) => boolean): Promise<void> {
  let last: number[][] = [];
  await expect
    .poll(
      async () => {
        last = await previewAt(page, points);
        return check(last);
      },
      { timeout: 15_000, message: 'preview colours' },
    )
    .toBe(true)
    .catch((e: unknown) => {
      throw new Error(`${String(e)}\nlast colours: ${JSON.stringify(last)}`);
    });
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

async function shot(page: Page, name: string, browserName: string): Promise<void> {
  if (browserName !== 'chromium') return;
  for (const close of await page.locator('.tk-notice__close').all()) await close.click();
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

/** Opens the app at 1280 px with these photos, selects the first and opens its Adjust tab. */
async function setUp(
  page: Page,
  photos: readonly (readonly (readonly number[])[])[] = [[DARK]],
  lang: Language = 'en-US',
): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, lang);
  await add(page, await Promise.all(photos.map((c, i) => photo(page, `p${i + 1}.png`, c))), lang);
  await clipButton(page, 'p1.png', lang).click();
  await tabs(page, lang)
    .getByRole('tab', { name: text(lang, 'inspector.adjust') })
    .click();
  await expect(adjustPanel(page, lang)).toBeVisible();
}

/** Types a value into an adjustment's field and commits it with Enter. */
async function type(
  scope: Locator,
  id: `adjust.${string}` & CopyId,
  value: string,
  lang: Language = 'en-US',
): Promise<void> {
  const f = field(scope, id, lang);
  await f.fill(value);
  await f.press('Enter');
}

/** The x of a range input's thumb centre for its value (knob `knob` px wide). */
const thumbX = (s: Locator, knob: number) =>
  s.evaluate((el: HTMLInputElement, k) => {
    const r = el.getBoundingClientRect();
    const min = Number(el.min);
    const max = Number(el.max);
    return r.left + k / 2 + ((Number(el.value) - min) / (max - min)) * (r.width - k);
  }, knob);

test.describe('F-007 adjust colour and light (app harness)', () => {
  /**
   * Drags the held thumb until the slider reads `target`, a quarter pixel at a time (engines map the pointer
   * a little differently). The docked inspector's slider is about 93 px for 201 values; WebKit places the
   * pointer on whole CSS pixels (about 2.5 values per pixel), so there some values can't be reached by
   * pointer (build question 139) and the drag settles on the nearest one it passes.
   */
  async function settle(page: Page, s: Locator, from: number, y: number, target: number): Promise<number> {
    let x = from;
    let best = Number(await s.inputValue());
    let bestX = x;
    for (let i = 0; i < 160 && (await s.inputValue()) !== String(target); i++) {
      const v = Number(await s.inputValue());
      if (Math.abs(v - target) < Math.abs(best - target)) {
        best = v;
        bestX = x;
      }
      x += v < target ? 0.25 : -0.25;
      await page.mouse.move(x, y);
    }
    if ((await s.inputValue()) !== String(target)) await page.mouse.move(bestX, y);
    return Number(await s.inputValue());
  }

  test('F-007.AC1 F-007.R1 a dark clip: dragging Brightness to +40 while paused updates the preview during the drag and settles at +40, one step', async ({
    page,
    browserName,
  }) => {
    await setUp(page);
    const panel = adjustPanel(page);
    const s = slider(panel, 'adjust.brightness');
    await expect(s).toHaveValue('0');
    const centre: Point[] = [[0.5, 0.5]];
    const [start] = await previewAt(page, centre);
    expect(near(start!, DARK, 6), `start ${start}`).toBe(true);
    const steps = await stepsOf(page);
    const box = (await s.boundingBox())!;
    const y = box.y + box.height / 2;
    const x0 = await thumbX(s, 14);
    const perUnit = (box.width - 14) / 200;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    // Part way (about +20): the preview already shows it while the pointer is held.
    await page.mouse.move(x0 + 10 * perUnit, y, { steps: 3 });
    await page.mouse.move(x0 + 20 * perUnit, y, { steps: 3 });
    expect(Number(await s.inputValue())).toBeGreaterThan(5);
    await expectPreview(page, centre, ([c]) => c![0]! > start![0]! + 3);
    await page.mouse.move(x0 + 40 * perUnit, y, { steps: 4 });
    const v = await settle(page, s, x0 + 40 * perUnit, y, 40);
    await page.mouse.up();
    // Chromium reaches +40 exactly; WebKit the nearest value its whole-pixel pointer reaches (±2).
    if (browserName === 'chromium') expect(v).toBe(40);
    else expect(Math.abs(v - 40)).toBeLessThanOrEqual(2);
    const label = `+${v}`;
    await expect(s).toHaveValue(String(v));
    await expect(field(panel, 'adjust.brightness')).toHaveValue(label);
    await expect(s).toHaveAttribute('aria-valuetext', label);
    expect(await adjOf(page)).toEqual({ brightness: v });
    expect(await stepsOf(page)).toBe(steps + 1);
    const want = graded(DARK, { brightness: v });
    await expectPreview(page, centre, ([c]) => near(c!, want, 6));
    await shot(page, 'inspector-adjust-brightness-40', browserName);
    // One undo returns to before the drag.
    await undoButton(page).click();
    expect(await adjOf(page)).toEqual({});
    await expectPreview(page, centre, ([c]) => near(c!, DARK, 6));
  });

  test('F-014.AC4 Q104 a Brightness slider dragged through many values is undone in one step; dragged away and back to where it began it leaves no step and keeps redo', async ({
    page,
    browserName,
  }) => {
    await setUp(page);
    const panel = adjustPanel(page);
    // Chromium starts at the default (0); WebKit can't point at 0 on this slider (question 139), so it starts
    // at +39, a value it reaches (Q104's "back at the start" holds for any start; the default case is in
    // tests/unit/app.adjust.test.ts).
    const home = browserName === 'chromium' ? 0 : 39;
    if (home !== 0) await type(panel, 'adjust.brightness', String(home));
    // A redo step to keep: Contrast +10, undone.
    await type(panel, 'adjust.contrast', '10');
    await undoButton(page).click();
    const redo = page
      .getByRole('toolbar', { name: text('en-US', 'toolbar.label') })
      .getByRole('button', { name: text('en-US', 'action.redo'), exact: true });
    await expect(redo).not.toHaveAttribute('aria-disabled', 'true');
    const before = await stateOf(page);
    const steps = await stepsOf(page);
    const s = slider(panel, 'adjust.brightness');
    const box = (await s.boundingBox())!;
    const y = box.y + box.height / 2;
    const x0 = await thumbX(s, 14);
    // Away and back to the start: no step, redo kept.
    await page.mouse.move(x0, y);
    await page.mouse.down();
    for (let k = 1; k <= 6; k++) await page.mouse.move(x0 + k * box.width * 0.04, y);
    for (let k = 5; k >= 0; k--) await page.mouse.move(x0 + k * box.width * 0.04, y);
    expect(await settle(page, s, x0, y, home)).toBe(home);
    await page.mouse.up();
    await expect(s).toHaveValue(String(home));
    expect(await stepsOf(page)).toBe(steps);
    expect(await stateOf(page)).toBe(before);
    await expect(redo).not.toHaveAttribute('aria-disabled', 'true');
    // Many values in one movement: one step; one undo restores the document.
    await page.mouse.move(x0, y);
    await page.mouse.down();
    const seen = new Set<string>();
    for (let k = 1; k <= 10; k++) {
      await page.mouse.move(x0 + k * box.width * 0.04, y);
      seen.add(await s.inputValue());
    }
    await page.mouse.up();
    expect(seen.size).toBeGreaterThan(5);
    expect(await stepsOf(page)).toBe(steps + 1);
    await undoButton(page).click();
    expect(await stateOf(page)).toBe(before);
    await expect(s).toHaveValue(String(home));
  });

  test('F-007.AC3 F-007.R3 with every adjustment non-zero, Reset on Temperature returns only it to 0; Reset all returns all to default', async ({
    page,
    browserName,
  }) => {
    await setUp(page);
    const panel = adjustPanel(page);
    const resetAll = button(panel, 'action.reset_all');
    await expect(resetAll).toHaveAttribute('aria-disabled', 'true');
    // No per-row Reset at the default.
    await expect(row(panel, 'adjust.temperature').getByRole('button')).toHaveCount(0);
    const values: Record<string, number> = {
      brightness: 10,
      contrast: 20,
      highlights: -30,
      shadows: 40,
      temperature: 50,
      tint: -60,
      saturation: 70,
      vibrance: -80,
      fade: 15,
      sharpen: 25,
      vignette: 35,
      grain: 45,
    };
    for (const [name, v] of Object.entries(values))
      await type(panel, `adjust.${name}` as `adjust.${string}` & CopyId, String(v));
    expect(await adjOf(page)).toEqual(values);
    await expect(field(panel, 'adjust.tint')).toHaveValue('−60');
    await expect(field(panel, 'adjust.grain')).toHaveValue('45');
    await shot(page, 'inspector-adjust-all-changed', browserName);
    const steps = await stepsOf(page);
    await button(row(panel, 'adjust.temperature'), 'action.reset').click();
    const { temperature: _t, ...rest } = values;
    expect(await adjOf(page)).toEqual(rest);
    await expect(field(panel, 'adjust.temperature')).toHaveValue('0');
    await expect(row(panel, 'adjust.temperature').getByRole('button')).toHaveCount(0);
    expect(await stepsOf(page)).toBe(steps + 1);
    await resetAll.click();
    expect(await adjOf(page)).toEqual({});
    expect(await stepsOf(page)).toBe(steps + 2);
    for (const name of Object.keys(values))
      await expect(field(panel, `adjust.${name}` as `adjust.${string}` & CopyId)).toHaveValue('0');
    await expect(resetAll).toHaveAttribute('aria-disabled', 'true');
  });

  test('F-007.AC4 F-007.R4 RULE-13 three clips, clip 1 with adjustments and a look: Apply to all gives clips 2 and 3 the same; one undo restores them', async ({
    page,
  }) => {
    await setUp(page, [[MID], [MID], [MID]]);
    const panel = adjustPanel(page);
    await type(panel, 'adjust.brightness', '30');
    await type(panel, 'adjust.saturation', '-20');
    await page.evaluate(() => (window as unknown as Harness).appHarness.setClip(0, { look: 'bw-classic' }));
    // Clip 3 has its own value first.
    await clipButton(page, 'p3.png').click();
    await type(adjustPanel(page), 'adjust.vignette', '40');
    await clipButton(page, 'p1.png').click();
    const steps = await stepsOf(page);
    await button(adjustPanel(page), 'action.apply_all').click();
    const clips = await clipsOf(page);
    for (const c of clips)
      expect(c).toMatchObject({ adjustments: { brightness: 30, saturation: -20 }, look: 'bw-classic' });
    expect(await stepsOf(page)).toBe(steps + 1);
    await undoButton(page).click();
    const back = await clipsOf(page);
    expect(back[1]).toMatchObject({ adjustments: {}, look: null });
    expect(back[2]).toMatchObject({ adjustments: { vignette: 40 }, look: null });
    expect(back[0]).toMatchObject({ adjustments: { brightness: 30, saturation: -20 }, look: 'bw-classic' });
  });

  test('F-007.AC5 F-007.R4 clip 1’s colour copied and pasted onto clip 3: clip 3 matches its adjustments and look; Paste colour is unavailable until something is copied', async ({
    page,
  }) => {
    await setUp(page, [[MID], [MID], [MID]]);
    const panel = adjustPanel(page);
    await expect(button(panel, 'action.paste_look')).toBeDisabled();
    await type(panel, 'adjust.temperature', '25');
    await type(panel, 'adjust.fade', '30');
    await page.evaluate(() => (window as unknown as Harness).appHarness.setClip(0, { look: 'film-retro' }));
    const steps = await stepsOf(page);
    await button(panel, 'action.copy_look').click();
    expect(await stepsOf(page)).toBe(steps);
    await clipButton(page, 'p3.png').click();
    const paste = button(adjustPanel(page), 'action.paste_look');
    await expect(paste).toBeEnabled();
    await paste.click();
    const clips = await clipsOf(page);
    expect(clips[2]).toMatchObject({ adjustments: clips[0]!.adjustments, look: 'film-retro' });
    expect(clips[1]).toMatchObject({ adjustments: {}, look: null });
    expect(await stepsOf(page)).toBe(steps + 1);
    await expect(field(adjustPanel(page), 'adjust.temperature')).toHaveValue('+25');
  });

  test('RULE-20 F-007.R4 Mod+C and Mod+V copy and paste the selected clip’s colour; with nothing selected they do nothing', async ({
    page,
    browserName,
  }) => {
    await setUp(page, [[MID], [MID]]);
    await type(adjustPanel(page), 'adjust.shadows', '35');
    const mod = browserName === 'webkit' ? 'Meta' : 'ControlOrMeta';
    // Focus on the clip in the timeline (no field edited).
    await clipButton(page, 'p1.png').focus();
    await page.keyboard.press(`${mod}+KeyC`);
    await clipButton(page, 'p2.png').click();
    await page.keyboard.press(`${mod}+KeyV`);
    await expect.poll(async () => (await adjOf(page, 1)).shadows).toBe(35);
  });

  test('F-007.AC7 F-007.R6 NFR-06 keyboard focus on Saturation: each arrow key changes it by 1; typing 25 sets 25', async ({
    page,
  }) => {
    await setUp(page);
    const panel = adjustPanel(page);
    const s = slider(panel, 'adjust.saturation');
    await s.focus();
    const steps = await stepsOf(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    expect((await adjOf(page)).saturation).toBe(3);
    await page.keyboard.press('ArrowLeft');
    expect((await adjOf(page)).saturation).toBe(2);
    expect(await stepsOf(page)).toBe(steps + 4);
    // The preview did not step a frame (the arrows belong to the slider, RULE-20).
    await expect(page.locator('.tk-time__now')).toHaveText('0:00');
    // The slider and its field share the label (CMP-Inspector "Accessibility").
    const f = field(panel, 'adjust.saturation');
    await expect(f).toHaveValue('+2');
    await f.focus();
    await page.keyboard.press('ControlOrMeta+KeyA');
    await page.keyboard.type('25');
    await page.keyboard.press('Enter');
    expect((await adjOf(page)).saturation).toBe(25);
    await expect(s).toHaveValue('25');
    // Typed values clamp to the range.
    await type(panel, 'adjust.saturation', '250');
    expect((await adjOf(page)).saturation).toBe(100);
  });

  test('F-007.AC9 F-007.R7 a clip with a look and Brightness +50: holding compare shows it without them, with the comparing pill; release restores them; no undo step', async ({
    page,
    browserName,
  }) => {
    await setUp(page, [[MID]]);
    const panel = adjustPanel(page);
    await type(panel, 'adjust.brightness', '50');
    await page.evaluate(() => (window as unknown as Harness).appHarness.setClip(0, { look: 'bw-classic' }));
    const centre: Point[] = [[0.5, 0.5]];
    const bright = graded(MID, { brightness: 50 });
    await expectPreview(page, centre, ([c]) => c![0]! > MID[0]! + 15);
    const before = await stateOf(page);
    const steps = await stepsOf(page);
    const pill = page
      .locator('.tk-stage')
      .getByRole('status')
      .filter({ hasText: text('en-US', 'preview.comparing') });
    await expect(pill).toHaveCount(0);
    const compare = button(panel, 'action.compare');
    await compare.hover();
    await page.mouse.down();
    await expect(pill).toBeVisible();
    await expectPreview(page, centre, ([c]) => near(c!, MID, 6));
    await shot(page, 'preview-holding-compare', browserName);
    await page.mouse.up();
    await expect(pill).toHaveCount(0);
    await expectPreview(page, centre, ([c]) => c![0]! > MID[0]! + 15 && near(c!, bright, 40));
    // Hold \ : the same, and Space on the focused control.
    await clipButton(page, 'p1.png').focus();
    await page.keyboard.down('Backslash');
    await expect(pill).toBeVisible();
    await expectPreview(page, centre, ([c]) => near(c!, MID, 6));
    await page.keyboard.up('Backslash');
    await expect(pill).toHaveCount(0);
    await compare.focus();
    await page.keyboard.down('Space');
    await expect(pill).toBeVisible();
    await page.keyboard.up('Space');
    await expect(pill).toHaveCount(0);
    expect(await stepsOf(page)).toBe(steps);
    expect(await stateOf(page)).toBe(before);
  });

  test('CMP-Inspector "photo clip" Q134 a photo has the tabs Edit and Adjust (no Sound); a video Edit, Adjust and Sound', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    const bytes = await page.evaluate(() =>
      (
        window as unknown as { appHarness: { codedClip(r: number, f: number): Promise<number[]> } }
      ).appHarness.codedClip(30, 30),
    );
    await add(page, [
      await photo(page, 'p1.png', [MID]),
      { name: 'coded.mp4', mimeType: 'video/mp4', buffer: Buffer.from(bytes) },
    ]);
    await clipButton(page, 'p1.png').click();
    await expect(tabs(page).getByRole('tab')).toHaveText([
      text('en-US', 'inspector.edit'),
      text('en-US', 'inspector.adjust'),
    ]);
    await clipButton(page, 'coded.mp4').click();
    await expect(tabs(page).getByRole('tab')).toHaveText([
      text('en-US', 'inspector.edit'),
      text('en-US', 'inspector.adjust'),
      text('en-US', 'inspector.sound'),
    ]);
    // The Sound tab chosen on the video shows the photo's Edit tab, and comes back on the video.
    await tabs(page)
      .getByRole('tab', { name: text('en-US', 'inspector.sound') })
      .click();
    await clipButton(page, 'p1.png').click();
    await expect(tabs(page).getByRole('tab', { name: text('en-US', 'inspector.edit') })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await clipButton(page, 'coded.mp4').click();
    await expect(tabs(page).getByRole('tab', { name: text('en-US', 'inspector.sound') })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-007 NFR-06 axe passes with the Adjust tab and its footer at 1280 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      await setUp(page, [[MUTED], [MID]], lang);
      const panel = adjustPanel(page, lang);
      await type(panel, 'adjust.brightness', '12', lang);
      await type(panel, 'adjust.highlights', '-8', lang);
      await type(panel, 'adjust.temperature', '24', lang);
      await type(panel, 'adjust.saturation', '18', lang);
      await type(panel, 'adjust.vignette', '20', lang);
      for (const id of ['action.compare', 'action.copy_look', 'action.paste_look', 'action.apply_all'] as const)
        await expect(button(panel, id, lang)).toBeVisible();
      await axe(page);
      await shot(page, `inspector-adjust-wide-${lang}`, browserName);
    });

    test(`F-007 RULE-21 NFR-06 the phone Adjust sheet: rows and footer at touch size, More holds Copy and Paste colour, at 320 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      await add(page, [await photo(page, 'p1.png', [MUTED]), await photo(page, 'p2.png', [MID])], lang);
      const tab = page.getByRole('tab', { name: text(lang, 'inspector.adjust') });
      // Nothing selected: the Adjust tab is unavailable (SCR-Editor default narrow).
      await expect(tab).toHaveAttribute('aria-disabled', 'true');
      await tab.dispatchEvent('click');
      await expect(page.getByRole('tabpanel', { name: text(lang, 'inspector.adjust') })).toHaveCount(0);
      await clipButton(page, 'p1.png', lang).click();
      await expect(tab).not.toHaveAttribute('aria-disabled', 'true');
      await tab.click();
      const sheet = page.getByRole('tabpanel', { name: text(lang, 'inspector.adjust') });
      await expect(sheet).toBeVisible();
      const s = slider(sheet, 'adjust.brightness', lang);
      const box = (await s.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      const f = field(sheet, 'adjust.brightness', lang);
      await f.fill('20');
      await f.press('Enter');
      expect((await adjOf(page)).brightness).toBe(20);
      const reset = button(row(sheet, 'adjust.brightness', lang), 'action.reset', lang);
      expect((await reset.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      for (const id of ['action.compare', 'action.apply_all', 'action.more'] as const) {
        const b = (await button(sheet, id, lang).boundingBox())!;
        expect(b.height, id).toBeGreaterThanOrEqual(44);
        // The footer stays in the sheet and nothing overflows 320 px.
        expect(b.x + b.width).toBeLessThanOrEqual(320);
      }
      // More: Copy colour, then Paste colour on the second clip.
      await button(sheet, 'action.more', lang).click();
      const menu = page.getByRole('menu', { name: text(lang, 'action.more') });
      await expect(menu.getByRole('menuitem')).toHaveText([
        text(lang, 'action.copy_look'),
        text(lang, 'action.paste_look'),
      ]);
      await expect(menu.getByRole('menuitem', { name: text(lang, 'action.paste_look') })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await shot(page, `sheet-adjust-more-narrow-${lang}`, browserName);
      await axe(page);
      await menu.getByRole('menuitem', { name: text(lang, 'action.copy_look') }).click();
      await expect(menu).toHaveCount(0);
      await clipButton(page, 'p2.png', lang).click();
      await button(sheet, 'action.more', lang).click();
      await menu.getByRole('menuitem', { name: text(lang, 'action.paste_look') }).click();
      expect((await adjOf(page, 1)).brightness).toBe(20);
      // Esc closes the menu and leaves the sheet open.
      await button(sheet, 'action.more', lang).click();
      await expect(menu.getByRole('menuitem').first()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(sheet).toBeVisible();
      await expect(button(sheet, 'action.more', lang)).toBeFocused();
      await sheet.getByRole('heading', { name: text(lang, 'inspector.adjust') }).scrollIntoViewIfNeeded();
      await shot(page, `sheet-adjust-narrow-${lang}`, browserName);
      await axe(page);
    });
  }
});

test.describe('F-007 adjustments in the export (media harness)', () => {
  type Report = {
    ok: boolean;
    width: number;
    height: number;
    input: number[][];
    exported: number[][];
    painted: number[][];
  };
  const run = (page: Page, adjustments: Record<string, number>, chart: 'ramp' | 'colours') =>
    page.evaluate(
      ([a, c]) =>
        (
          window as unknown as {
            harness: { export: { gradeExport(a: Record<string, number>, c: string): Promise<Report> } };
          }
        ).harness.export.gradeExport(a, c),
      [adjustments, chart] as const,
    );
  const rgb = (c: readonly number[]): Rgb => [c[0]! / 255, c[1]! / 255, c[2]! / 255];

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(HARNESS);
    await expect(page.locator('#out')).toHaveText('ready');
  });

  test('F-007.AC2 RULE-08 INV-02 the 256-step grey ramp at default settings: the export matches the input and the paint (ΔE00 < 0.5 at every step)', async ({
    page,
  }) => {
    const r = await run(page, {}, 'ramp');
    expect(r.ok).toBe(true);
    let worstIn = 0;
    let worstPaint = 0;
    for (let i = 0; i < 256; i++) {
      worstIn = Math.max(worstIn, deRgb(rgb(r.exported[i]!), rgb(r.input[i]!)));
      worstPaint = Math.max(worstPaint, deRgb(rgb(r.painted[i]!), rgb(r.input[i]!)));
    }
    test.info().annotations.push({
      type: 'ramp',
      description: `export vs input max ΔE00 ${worstIn.toFixed(3)}; paint vs input ${worstPaint.toFixed(3)}`,
    });
    expect(worstPaint).toBeLessThan(0.5);
    expect(worstIn).toBeLessThan(0.5);
  });

  for (const [name, adj] of [
    ['contrast +100', { contrast: 100 }],
    ['brightness −100', { brightness: -100 }],
    ['shadows +100 highlights −100', { shadows: 100, highlights: -100 }],
    ['fade 100', { fade: 100 }],
  ] as const) {
    test(`F-007.AC2 RULE-08 INV-02 the 8-bit export of the grey ramp (${name}) reverses by no more than ΔL* 0.5 and stays within ΔE00 1 of the full-precision result`, async ({
      page,
    }) => {
      const r = await run(page, adj, 'ramp');
      expect(r.ok).toBe(true);
      let worstDe = 0;
      let worstReverse = 0;
      let prevL = -Infinity;
      for (let i = 0; i < 256; i++) {
        const got = rgb(r.exported[i]!);
        const ref = reference.grade([i / 255, i / 255, i / 255], adj) as Rgb;
        worstDe = Math.max(worstDe, deRgb(got, ref));
        const L = lab(got)[0];
        worstReverse = Math.min(worstReverse, L - prevL);
        prevL = Math.max(prevL, L);
      }
      test.info().annotations.push({
        type: 'ramp',
        description: `max ΔE00 ${worstDe.toFixed(3)}, worst reversal ${worstReverse.toFixed(3)}`,
      });
      expect(worstDe).toBeLessThanOrEqual(1);
      expect(worstReverse).toBeGreaterThanOrEqual(-0.5);
    });
  }

  test('F-007.AC6 F-007.R5 NFR-08 INV-02 every adjustment non-zero (Grain 0, as NFR-08 measures): the exported 24-patch chart matches the preview’s paint (mean ΔE00 < 2, max < 4)', async ({
    page,
  }) => {
    const adj = {
      brightness: 20,
      contrast: 25,
      highlights: -30,
      shadows: 35,
      saturation: 40,
      vibrance: -20,
      temperature: 30,
      tint: -15,
      sharpen: 50,
      vignette: 30,
      fade: 20,
      grain: 0,
    };
    const r = await run(page, adj, 'colours');
    expect(r.ok).toBe(true);
    const des = r.exported.map((c, i) => deRgb(rgb(c), rgb(r.painted[i]!)));
    const mean = des.reduce((a, b) => a + b, 0) / des.length;
    const max = Math.max(...des);
    test.info().annotations.push({ type: 'chart', description: `mean ΔE00 ${mean.toFixed(3)}, max ${max.toFixed(3)}` });
    expect(mean).toBeLessThan(2);
    expect(max).toBeLessThan(4);
    // The adjustments did act (the chart is not the input).
    const moved = r.painted.map((c, i) => deRgb(rgb(c), rgb(r.input[i]!)));
    expect(Math.max(...moved)).toBeGreaterThan(5);
  });

  test('F-007.AC8 RULE-08 ADR-0006 §4 Grain 50: the same frame painted twice, by a second compositor at the export’s size, and in the export carries the same grain', async ({
    page,
  }) => {
    // A 1080p export (grain cells of 2 px survive the coding better than at 480p), on software encoders too.
    test.setTimeout(240_000);
    const r = await page.evaluate(() =>
      (
        window as unknown as {
          harness: {
            export: {
              grainParity(g: number): Promise<{
                ok: boolean;
                sameTwice: boolean;
                sameElsewhere: boolean;
                nextDiffers: boolean;
                corrSame: number;
                corrOther: number;
              }>;
            };
          };
        }
      ).harness.export.grainParity(50),
    );
    test.info().annotations.push({ type: 'grain', description: JSON.stringify(r) });
    expect(r.ok).toBe(true);
    expect(r.sameTwice).toBe(true);
    expect(r.sameElsewhere).toBe(true);
    expect(r.nextDiffers).toBe(true);
    // The decoded export carries frame k's grain pattern (lossy coding softens it), not frame k + 1's.
    expect(r.corrSame, JSON.stringify(r)).toBeGreaterThan(0.1);
    expect(Math.abs(r.corrOther) * 4, JSON.stringify(r)).toBeLessThan(r.corrSame);
  });
});

test.describe('F-007 grain in the preview (app harness)', () => {
  test('F-007.AC8 F-007.R2 Grain 50: the same frame shown twice in the preview is pixel-identical', async ({
    page,
  }) => {
    await setUp(page, [[MID]]);
    await type(adjustPanel(page), 'adjust.grain', '50');
    // Wait for the grain to show, then compare two showings of frame 0 with another frame between.
    await expectPreview(page, [[0.5, 0.5]], () => true);
    // Let the paint settle: two screenshots in a row agree.
    let first = await canvas(page).screenshot();
    await expect
      .poll(async () => {
        const again = await canvas(page).screenshot();
        const same = again.equals(first);
        first = again;
        return same;
      })
      .toBe(true);
    const transport = (id: CopyId) => page.getByRole('button', { name: text('en-US', id), exact: true });
    await transport('action.next_frame').click();
    // The next frame has other grain.
    await expect.poll(async () => (await canvas(page).screenshot()).equals(first), { timeout: 10_000 }).toBe(false);
    await transport('action.prev_frame').click();
    await expect.poll(async () => (await canvas(page).screenshot()).equals(first), { timeout: 10_000 }).toBe(true);
  });
});
