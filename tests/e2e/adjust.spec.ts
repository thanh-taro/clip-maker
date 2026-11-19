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
import { gradeUniforms, reference } from '../../src/compositor';
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
    greyLook(id: string): void;
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
   * pointer (build question 140) and the drag settles on the nearest one it passes; the default is always
   * reached through RULE-08's drag detent.
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
  }) => {
    await setUp(page);
    const panel = adjustPanel(page);
    // Both engines start at the default (0): WebKit's whole-pixel pointer reaches it through RULE-08's drag
    // detent (build question 140).
    const home = 0;
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

  test('RULE-08 drag detent (Q140): a pointer drag of a bipolar slider never lands on ±1 or ±2 — it lands on 0, which both engines reach; keys and the field still set ±1 and ±2', async ({
    page,
  }) => {
    await setUp(page);
    const panel = adjustPanel(page);
    await type(panel, 'adjust.brightness', '12');
    const s = slider(panel, 'adjust.brightness');
    const box = (await s.boundingBox())!;
    const y = box.y + box.height / 2;
    const steps = await stepsOf(page);
    // From +12 to about −12 a quarter pixel at a time: every value the slider shows while held.
    let x = await thumbX(s, 14);
    const perUnit = (box.width - 14) / 200;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const seen = new Set<number>();
    const xEnd = x - 24 * perUnit;
    while (x > xEnd) {
      x -= 0.25;
      await page.mouse.move(x, y);
      seen.add(Number(await s.inputValue()));
    }
    expect(seen.has(0), `seen ${[...seen].join(' ')}`).toBe(true);
    for (const v of [1, 2, -1, -2]) expect(seen.has(v), `seen ${[...seen].join(' ')}`).toBe(false);
    // Back to the default and released: 0 is stored as the default (nothing stored), one step.
    expect(await settle(page, s, x, y, 0)).toBe(0);
    await page.mouse.up();
    await expect(s).toHaveValue('0');
    await expect(field(panel, 'adjust.brightness')).toHaveValue('0');
    expect(await adjOf(page)).toEqual({});
    expect(await stepsOf(page)).toBe(steps + 1);
    // The arrow keys still step 1 at a time (F-007.R6), and the field still takes ±2.
    await s.focus();
    await page.keyboard.press('ArrowRight');
    await expect(s).toHaveValue('1');
    await page.keyboard.press('ArrowRight');
    await expect(s).toHaveValue('2');
    expect(await adjOf(page)).toEqual({ brightness: 2 });
    await type(panel, 'adjust.brightness', '-2');
    await expect(s).toHaveValue('-2');
    expect(await adjOf(page)).toEqual({ brightness: -2 });
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

  /** Clicking the selected clip `name` again clears the selection (CMP-Timeline). */
  async function selectNothing(page: Page, name: string): Promise<void> {
    await expect(clipButton(page, name)).toHaveAttribute('aria-pressed', 'true');
    await clipButton(page, name).click();
    await expect.poll(async () => (await clipsOf(page)).some((c) => c.selected)).toBe(false);
  }
  const modOf = (browserName: string) => (browserName === 'webkit' ? 'Meta' : 'ControlOrMeta');

  test('RULE-20 F-007.R4 Mod+C and Mod+V copy and paste the selected clip’s colour; with nothing selected they do nothing', async ({
    page,
    browserName,
  }) => {
    await setUp(page, [[MID], [MID]]);
    await type(adjustPanel(page), 'adjust.shadows', '35');
    const mod = modOf(browserName);
    // Nothing selected: Mod+C copies nothing (Paste colour stays unavailable on p2).
    await selectNothing(page, 'p1.png');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(`${mod}+KeyC`);
    await clipButton(page, 'p2.png').click();
    await tabs(page)
      .getByRole('tab', { name: text('en-US', 'inspector.adjust') })
      .click();
    await expect(button(adjustPanel(page), 'action.paste_look')).toBeDisabled();
    // p1 selected, focus on the clip in the timeline (no field edited): copy; then paste onto p2.
    await clipButton(page, 'p1.png').click();
    await clipButton(page, 'p1.png').focus();
    await page.keyboard.press(`${mod}+KeyC`);
    await clipButton(page, 'p2.png').click();
    await page.keyboard.press(`${mod}+KeyV`);
    await expect.poll(async () => (await adjOf(page, 1)).shadows).toBe(35);
    // Nothing selected: Mod+V pastes nowhere and makes no step.
    await type(adjustPanel(page), 'adjust.shadows', '5');
    await selectNothing(page, 'p2.png');
    const steps = await stepsOf(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(`${mod}+KeyV`);
    await page.waitForTimeout(100);
    expect(await stepsOf(page)).toBe(steps);
    expect((await adjOf(page, 1)).shadows).toBe(5);
  });

  test('RULE-20 Mod+V outside a field: the browser fires its paste event first (engine check for the media-or-colour rule)', async ({
    page,
    browserName,
  }) => {
    await setUp(page, [[MID]]);
    await page.evaluate(() => {
      (window as unknown as { pastes: number }).pastes = 0;
      document.addEventListener('paste', () => (window as unknown as { pastes: number }).pastes++);
    });
    await clipButton(page, 'p1.png').focus();
    await page.keyboard.press(`${modOf(browserName)}+KeyV`);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { pastes: number }).pastes), { timeout: 2000 })
      .toBe(1);
  });

  test('RULE-20 Mod+V with files adds them as media and pastes no colour onto the selected clip', async ({ page }) => {
    await setUp(page, [[MID], [MID]]);
    await type(adjustPanel(page), 'adjust.shadows', '35');
    await button(adjustPanel(page), 'action.copy_look').click();
    await clipButton(page, 'p2.png').click();
    const bytes = await page.evaluate(() => (window as unknown as Harness).appHarness.stripes(64, 36, [[10, 200, 10]]));
    // The key, then (as the browser does for Mod+V) its paste event carrying a file.
    await page.evaluate((png) => {
      const mac = /mac/i.test(navigator.platform);
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: 'KeyV',
          key: 'v',
          metaKey: mac,
          ctrlKey: !mac,
          bubbles: true,
          cancelable: true,
        }),
      );
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(png)], 'pasted.png', { type: 'image/png' }));
      const e = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(e, 'clipboardData', { value: data });
      target.dispatchEvent(e);
    }, bytes);
    await expect.poll(async () => (await clipsOf(page)).length, { timeout: 20_000 }).toBe(3);
    await page.waitForTimeout(100);
    expect(await adjOf(page, 1)).toEqual({});
  });

  test('RULE-20 inside a number field Mod+C and Mod+V keep the browser’s copy and paste (no colour copied or pasted)', async ({
    page,
    browserName,
  }) => {
    await setUp(page, [[MID], [MID]]);
    const panel = adjustPanel(page);
    await type(panel, 'adjust.brightness', '20');
    await page.evaluate(() => {
      const w = window as unknown as { prevented: boolean[] };
      w.prevented = [];
      window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyC' || e.code === 'KeyV') w.prevented.push(e.defaultPrevented);
      });
    });
    const steps = await stepsOf(page);
    const f = field(panel, 'adjust.brightness');
    await f.focus();
    await f.selectText();
    const mod = modOf(browserName);
    await page.keyboard.press(`${mod}+KeyC`);
    await page.keyboard.press(`${mod}+KeyV`);
    expect(await page.evaluate(() => (window as unknown as { prevented: boolean[] }).prevented)).toEqual([
      false,
      false,
    ]);
    await f.press('Escape');
    await clipButton(page, 'p2.png').click();
    await expect(button(adjustPanel(page), 'action.paste_look')).toBeDisabled();
    expect(await stepsOf(page)).toBe(steps);
  });

  test('Q144 RULE-20 Mod+C with text selected on the page copies the text, not the colour', async ({
    page,
    browserName,
  }) => {
    await setUp(page, [[MID], [MID]]);
    await type(adjustPanel(page), 'adjust.shadows', '35');
    await clipButton(page, 'p1.png').focus();
    // Select the status bar's text, as a reader would to copy it.
    await page.evaluate(() => {
      const el = document.querySelector('.tk-status-bar')!;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.keyboard.press(`${modOf(browserName)}+KeyC`);
    await clipButton(page, 'p2.png').click();
    await expect(button(adjustPanel(page), 'action.paste_look')).toBeDisabled();
  });

  test('CMP-Inspector "clip Adjust" Enter on a row’s Reset returns the value to 0 and leaves focus on that row’s slider', async ({
    page,
  }) => {
    await setUp(page);
    const panel = adjustPanel(page);
    await type(panel, 'adjust.contrast', '20');
    await button(row(panel, 'adjust.contrast'), 'action.reset').focus();
    await page.keyboard.press('Enter');
    expect(await adjOf(page)).toEqual({});
    await expect(slider(panel, 'adjust.contrast')).toBeFocused();
    await expect(row(panel, 'adjust.contrast').getByRole('button')).toHaveCount(0);
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
    await setUp(page, [[MUTED]]);
    const panel = adjustPanel(page);
    await type(panel, 'adjust.brightness', '50');
    // A look that turns colours grey (the bundled tables come with F-008), chosen on the clip.
    await page.evaluate(() => (window as unknown as Harness).appHarness.greyLook('bw-classic'));
    await page.evaluate(() => (window as unknown as Harness).appHarness.setClip(0, { look: 'bw-classic' }));
    const centre: Point[] = [[0.5, 0.5]];
    /** The look's shift: the warm MUTED colour is grey (and brighter) with the look and Brightness +50. */
    const graded50 = ([c]: number[][]): boolean => Math.abs(c![0]! - c![2]!) <= 8 && c![1]! > MUTED[1]! + 10;
    const original = ([c]: number[][]): boolean => near(c!, MUTED, 6);
    await expectPreview(page, centre, graded50);
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
    // Held: the clip's own colour, without the look's shift and Brightness.
    await expectPreview(page, centre, original);
    await shot(page, 'preview-holding-compare', browserName);
    await page.mouse.up();
    await expect(pill).toHaveCount(0);
    await expectPreview(page, centre, graded50);
    // Hold \ : the same, and Space on the focused control.
    await clipButton(page, 'p1.png').focus();
    await page.keyboard.down('Backslash');
    await expect(pill).toBeVisible();
    await expectPreview(page, centre, original);
    await page.keyboard.up('Backslash');
    await expect(pill).toHaveCount(0);
    await expectPreview(page, centre, graded50);
    await compare.focus();
    await page.keyboard.down('Space');
    await expect(pill).toBeVisible();
    await expectPreview(page, centre, original);
    await page.keyboard.up('Space');
    await expect(pill).toHaveCount(0);
    await expectPreview(page, centre, graded50);
    expect(await stepsOf(page)).toBe(steps);
    expect(await stateOf(page)).toBe(before);
  });

  test('CMP-Inspector "photo clip" Q134 a photo has the tabs Edit, Adjust and Looks (no Sound); a video Edit, Adjust, Looks and Sound', async ({
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
      text('en-US', 'looks.title'),
    ]);
    await clipButton(page, 'coded.mp4').click();
    await expect(tabs(page).getByRole('tab')).toHaveText([
      text('en-US', 'inspector.edit'),
      text('en-US', 'inspector.adjust'),
      text('en-US', 'looks.title'),
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
      // The selection stops being a clip (Delete from the sheet's slider): the sheet closes and focus goes
      // back to the Adjust tab, not to the page.
      await slider(sheet, 'adjust.brightness', lang).focus();
      await page.keyboard.press('Delete');
      await expect(sheet).toHaveCount(0);
      await expect(tab).toBeFocused();
      await expect(tab).toHaveAttribute('aria-disabled', 'true');
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

  /**
   * RULE-08's full-precision result for a grey step `g` (0–255) at clip position `uv`: the grade, then the
   * finish (Vignette is positional, so it is judged at each position against the reference there; Sharpen is
   * a no-op on flat patches and on a straight ramp; Grain is held at 0, as AC2 asks).
   */
  const rampRef = (g: number, adj: Record<string, number>, uv: readonly [number, number]): Rgb => {
    const c = reference.grade([g / 255, g / 255, g / 255], adj);
    return reference.finish(c, gradeUniforms(adj, null), { uv, frag: [0, 0], frame: 0, clip: 0, s: 1080 }) as Rgb;
  };
  /** Worst ΔE00 against the reference and worst reversal (ΔL*, ≤ 0) of 256 8-bit steps. */
  const judge = (
    got: (i: number) => Rgb,
    adj: Record<string, number>,
    uvOf: (i: number) => readonly [number, number],
  ): { de: number; reverse: number } => {
    let de = 0;
    let reverse = 0;
    let prevL = -Infinity;
    for (let i = 0; i < 256; i++) {
      const c = got(i);
      de = Math.max(de, deRgb(c, rampRef(i, adj, uvOf(i))));
      const L = lab(c)[0];
      reverse = Math.min(reverse, L - prevL);
      prevL = Math.max(prevL, L);
    }
    return { de, reverse };
  };
  /** Each adjustment at its minimum and its maximum (Grain stays 0: AC2 is judged with Grain at 0). */
  const EXTREMES: readonly Record<string, number>[] = [
    ...['brightness', 'contrast', 'highlights', 'shadows', 'saturation', 'vibrance', 'temperature', 'tint'].flatMap(
      (n) => [{ [n]: -100 }, { [n]: 100 }],
    ),
    ...['sharpen', 'vignette', 'fade'].flatMap((n) => [{ [n]: 0 }, { [n]: 100 }]),
  ];

  test('F-007.AC2 RULE-08 the 8-bit preview of the grey ramp at every adjustment’s minimum and maximum reverses by no more than ΔL* 0.5 and stays within ΔE00 1 of the full-precision result (Vignette judged at each position)', async ({
    page,
  }) => {
    const lines: string[] = [];
    for (const adj of EXTREMES) {
      const px = await page.evaluate(
        (a) =>
          (
            window as unknown as { harness: { video: { gpuRamp(a: object): Promise<number[]> } } }
          ).harness.video.gpuRamp(a),
        adj,
      );
      // The ramp is 256 × 16, one step per column; row 8 is read.
      const r = judge(
        (i) => [px[i * 4]! / 255, px[i * 4 + 1]! / 255, px[i * 4 + 2]! / 255],
        adj,
        (i) => [(i + 0.5) / 256, 8.5 / 16],
      );
      const name = JSON.stringify(adj);
      lines.push(`${name} ΔE00 ${r.de.toFixed(3)} rev ${r.reverse.toFixed(3)}`);
      expect(r.de, name).toBeLessThanOrEqual(1);
      if (!('vignette' in adj)) expect(r.reverse, name).toBeGreaterThanOrEqual(-0.5);
    }
    test.info().annotations.push({ type: 'ramp', description: lines.join('; ') });
  });

  for (const adj of [
    { brightness: -100 },
    { contrast: 100 },
    { highlights: -100 },
    { shadows: 100 },
    { saturation: 100 },
    { vibrance: -100 },
    { temperature: 100 },
    { tint: -100 },
    { sharpen: 100 },
    { vignette: 100 },
    { fade: 100 },
  ] as const) {
    const name = JSON.stringify(adj);
    test(`F-007.AC2 RULE-08 INV-02 the 8-bit export of the grey ramp ${name} reverses by no more than ΔL* 0.5 and the encoded frame stays within ΔE00 1 of the full-precision result (Vignette judged at each position)`, async ({
      page,
    }) => {
      const r = await run(page, adj, 'ramp');
      expect(r.ok).toBe(true);
      const uvOf = (i: number): readonly [number, number] => [((i % 16) + 0.5) / 16, (Math.floor(i / 16) + 0.5) / 16];
      // The frame the export encodes (the paint, byte-identical to the worker's: AC8) meets AC2's bound.
      const painted = judge((i) => rgb(r.painted[i]!), adj, uvOf);
      // The decoded file.
      const j = judge((i) => rgb(r.exported[i]!), adj, uvOf);
      const worst = r.exported
        .map((c, i) => ({ i, de: deRgb(rgb(c), rampRef(i, adj, uvOf(i))), got: c, paint: r.painted[i] }))
        .sort((x, y) => y.de - x.de)
        .slice(0, 3);
      test.info().annotations.push({
        type: 'ramp',
        description: `file max ΔE00 ${j.de.toFixed(3)}, reversal ${j.reverse.toFixed(3)}; encoded frame max ΔE00 ${painted.de.toFixed(3)}`,
      });
      expect(painted.de, 'encoded frame').toBeLessThanOrEqual(1);
      if (!('vignette' in adj)) {
        expect(painted.reverse, 'encoded frame').toBeGreaterThanOrEqual(-0.5);
        expect(j.reverse, 'file').toBeGreaterThanOrEqual(-0.5);
      }
      if ('temperature' in adj || 'tint' in adj) {
        // Build question 145: lossy 4:2:0 coding moves tinted dark greys by 1–2 code values (ΔE00 up to 3.4
        // against the full-precision result); the file is held to NFR-08's per-patch maximum against the paint.
        const vsPaint = Math.max(...r.exported.map((c, i) => deRgb(rgb(c), rgb(r.painted[i]!))));
        expect(vsPaint, JSON.stringify(worst)).toBeLessThan(4);
      } else {
        expect(j.de, JSON.stringify(worst)).toBeLessThanOrEqual(1);
      }
    });
  }

  test('F-007.AC2 RULE-08 INV-02 Vignette 100 in the export: the corners darken, the centre keeps its value, each patch within ΔE00 1 of the reference at its position', async ({
    page,
  }) => {
    const r = await run(page, { vignette: 100 }, 'ramp');
    expect(r.ok).toBe(true);
    // Fixed positions: patch 0 and 15 (top corners), 240 and 255 (bottom corners), and 119/120/135/136 at the centre.
    const centre = [119, 120, 135, 136];
    for (const i of centre) expect(deRgb(rgb(r.exported[i]!), rgb(r.input[i]!)), `centre ${i}`).toBeLessThan(1);
    for (const i of [15, 255]) expect(r.exported[i]![0]!, `corner ${i}`).toBeLessThan(r.input[i]![0]! * 0.7);
    for (const i of [0, 15, 240, 255, ...centre]) {
      const ref = rampRef(i, { vignette: 100 }, [((i % 16) + 0.5) / 16, (Math.floor(i / 16) + 0.5) / 16]);
      expect(deRgb(rgb(r.exported[i]!), ref), `patch ${i}`).toBeLessThanOrEqual(1);
    }
  });

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

  test('F-007.AC8 RULE-08 ADR-0006 §4 INV-02 Grain 50: the export worker composes frame k byte-identical to the preview’s paint (also painted twice, and by a second compositor), and the encoded file carries that grain pattern', async ({
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
                workerSame: boolean;
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
    expect(r.workerSame).toBe(true);
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
