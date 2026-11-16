// F-006 place, rotate and flip clips through the real UI on the app harness (tests/harness/app.html: the
// real `main()`, workers and compositor): CMP-Inspector's Position section (wide and compact), the phone
// Edit sheet's Position and Scale rows, and the preview's placement outline and handles (drag to move with
// the RULE-07 centre snap, a corner handle to scale, Esc to cancel). Test media is made in the page: a 16:9
// photo whose left half is red and right half blue (`appHarness.halves()`). Preview pixels come from a
// screenshot of the preview canvas read back in the page (`appHarness.pixels()`). AC3's export half runs on
// the media harness (tests/harness/export.ts `frameFill` with a placement): the real export workers, the
// file decoded, next to the compositor's paint (INV-02). Also: the compact inspector's resize grip
// (Q105), axe at 320, 800 and 1280 px in en-US and vi-VN.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSummary } from '../harness/app';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;
const SHOTS = fileURLToPath(new URL('../../.build-my-app/reports/screens/F-006/', import.meta.url));

type Point = readonly [number, number];
interface Harness {
  appHarness: {
    project(): { steps: number };
    clips(): ClipSummary[];
    halves(width: number, height: number): Promise<number[]>;
    pixels(png: string, points: readonly Point[]): Promise<{ width: number; height: number; at: number[][] }>;
  };
}
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const stepsOf = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as Harness).appHarness.project())).steps;
const placementOf = async (page: Page, i = 0) => (await clipsOf(page))[i]!.placement;

async function open(page: Page, lang: Language = 'en-US'): Promise<void> {
  await page.goto(`${APP}?effects=fast&lang=${lang}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}

/** A 16:9 photo (320 × 180), left half red, right half blue. */
async function widePhoto(page: Page, name = 'wide.png'): Promise<Payload> {
  const bytes = await page.evaluate(() => (window as unknown as Harness).appHarness.halves(320, 180));
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
/** A selected photo's inspector: its Edit section under a plain title row (build question 134). */
const inspector = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('complementary', { name: text(lang, 'inspector.edit') });
const frameInspector = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('complementary', { name: text(lang, 'inspector.frame') });
const position = (scope: Locator, lang: Language = 'en-US') =>
  scope.getByRole('region', { name: text(lang, 'inspector.placement') });
const modeRadio = (scope: Locator, id: 'placement.fit' | 'placement.fill', lang: Language = 'en-US') =>
  scope
    .getByRole('radiogroup', { name: text(lang, 'placement.mode') })
    .getByRole('radio', { name: text(lang, id), exact: true });
const button = (scope: Locator, id: CopyId, lang: Language = 'en-US') =>
  scope.getByRole('button', { name: text(lang, id), exact: true });
const field = (scope: Locator, id: CopyId, lang: Language = 'en-US') =>
  scope.getByRole('spinbutton', { name: text(lang, id) });
const canvas = (page: Page) => page.locator('.tk-frame canvas');
const layer = (page: Page) => page.locator('.tk-place-layer');

/** The preview canvas's shape (width ÷ height) on screen. */
async function shape(page: Page): Promise<number> {
  const b = (await canvas(page).boundingBox())!;
  return b.width / b.height;
}

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
const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];
const RED = [255, 0, 0];
const BLUE = [0, 0, 255];

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

/** Opens the app at 1280 px, picks the aspect with nothing selected, adds the wide photo and selects it. */
async function setUp(page: Page, aspect: string | null, lang: Language = 'en-US'): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, lang);
  await add(page, [await widePhoto(page)], lang);
  if (aspect)
    await frameInspector(page, lang)
      .getByRole('radiogroup', { name: text(lang, 'frame.aspect') })
      .getByRole('radio', { name: aspect, exact: true })
      .click();
  await clipButton(page, 'wide.png', lang).click();
  await expect(inspector(page, lang)).toBeVisible();
}

const DEFAULT = { mode: 'fit', scale: 100, offsetX: 0, offsetY: 0, rotation: 0, flipH: false, flipV: false };

test.describe('F-006 place, rotate and flip (app harness)', () => {
  test('F-006.AC1 F-006.R1 a 16:9 clip in a 9:16 frame: Fill covers the frame and cuts its sides; Fit shows the whole clip with black above and below', async ({
    page,
    browserName,
  }) => {
    await setUp(page, '9:16');
    const pos = position(inspector(page));
    await expect(modeRadio(pos, 'placement.fit')).toHaveAttribute('aria-checked', 'true');
    const steps = await stepsOf(page);
    await modeRadio(pos, 'placement.fill').click();
    expect((await placementOf(page)).mode).toBe('fill');
    expect(await stepsOf(page)).toBe(steps + 1);
    await expect(modeRadio(pos, 'placement.fill')).toHaveAttribute('aria-checked', 'true');
    // Fill: no background anywhere, top to bottom; only the middle of the clip shows (red left of the
    // centre, blue right of it), its sides cut off.
    await expectPreview(
      page,
      [
        [0.2, 0.05],
        [0.8, 0.95],
        [0.2, 0.5],
        [0.8, 0.5],
      ],
      ([top, bottom, l, r]) =>
        near(top!, RED, 40) && near(bottom!, BLUE, 40) && near(l!, RED, 40) && near(r!, BLUE, 40),
    );
    await shot(page, 'fill-9x16-wide', browserName);
    await modeRadio(pos, 'placement.fit').click();
    // Fit: the whole clip (the middle third of the height) with black above and below.
    await expectPreview(
      page,
      [
        [0.5, 0.1],
        [0.5, 0.9],
        [0.25, 0.5],
        [0.75, 0.5],
      ],
      ([top, bottom, l, r]) =>
        near(top!, BLACK, 8) && near(bottom!, BLACK, 8) && near(l!, RED, 40) && near(r!, BLUE, 40),
    );
  });

  test('F-006.AC2 F-006.R2 RULE-07 dragging the clip in the preview moves it; within 8 px of the frame centre it snaps to the centre lines (one step per drag)', async ({
    page,
    browserName,
  }) => {
    await setUp(page, '9:16');
    await expect(layer(page)).toBeVisible();
    await expect(layer(page).locator('[data-handle]')).toHaveCount(8);
    const b = (await canvas(page).boundingBox())!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const steps = await stepsOf(page);
    // Away from the centre: 60 px right, 50 px down.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy + 25, { steps: 4 });
    await page.mouse.move(cx + 60, cy + 50, { steps: 4 });
    await page.mouse.up();
    let p = await placementOf(page);
    expect(p.offsetX).toBeCloseTo(60 / b.width, 3);
    expect(p.offsetY).toBeCloseTo(50 / b.height, 3);
    expect(await stepsOf(page)).toBe(steps + 1);
    // Back towards the centre, ending 5 px right and 6 px below it: the centre snaps to both lines.
    await page.mouse.move(cx + 10, cy + 10);
    await page.mouse.down();
    await page.mouse.move(cx - 20, cy - 20, { steps: 4 });
    await page.mouse.move(cx - 45, cy - 34, { steps: 4 });
    await expect(page.locator('.tk-place-layer__guide--x')).toBeVisible();
    await expect(page.locator('.tk-place-layer__guide--y')).toBeVisible();
    await shot(page, 'drag-snapped-centre', browserName);
    await page.mouse.up();
    p = await placementOf(page);
    expect([p.offsetX, p.offsetY]).toEqual([0, 0]);
    expect(await stepsOf(page)).toBe(steps + 2);
    await expect(page.locator('.tk-place-layer__guide--x')).toBeHidden();
    // 9 px from the centre does not snap.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 9, cy, { steps: 3 });
    await page.mouse.up();
    expect((await placementOf(page)).offsetX).toBeCloseTo(9 / b.width, 3);
    // One undo per drag.
    await page.getByRole('button', { name: text('en-US', 'action.undo'), exact: true }).click();
    p = await placementOf(page);
    expect([p.offsetX, p.offsetY]).toEqual([0, 0]);
  });

  test('F-006.R2 CMP-Preview a corner handle scales the clip from its centre; Esc during a drag puts it back with no step', async ({
    page,
    browserName,
  }) => {
    await setUp(page, '9:16');
    const se = (await layer(page).locator('[data-handle="se"]').boundingBox())!;
    const b = (await canvas(page).boundingBox())!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const hx = se.x + se.width / 2;
    const hy = se.y + se.height / 2;
    const steps = await stepsOf(page);
    // Twice as far from the centre: 200 %.
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(cx + (hx - cx) * 1.5, cy + (hy - cy) * 1.5, { steps: 4 });
    await page.mouse.move(cx + (hx - cx) * 2, cy + (hy - cy) * 2, { steps: 4 });
    await page.mouse.up();
    const scale = (await placementOf(page)).scale;
    expect(Math.abs(scale - 200)).toBeLessThanOrEqual(2);
    expect(await stepsOf(page)).toBe(steps + 1);
    await expect(field(inspector(page), 'placement.scale')).toHaveValue(String(scale));
    await shot(page, 'handle-scaled-200', browserName);
    // Esc mid-drag: back where it was, no step.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 40, { steps: 4 });
    expect((await placementOf(page)).offsetX).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    expect((await placementOf(page)).offsetX).toBe(0);
    await page.mouse.up();
    expect((await placementOf(page)).offsetX).toBe(0);
    expect(await stepsOf(page)).toBe(steps + 1);
  });

  test('F-006.AC3 F-006.R3 RULE-07 Rotate turns the clip 90° clockwise in the preview; a flip then mirrors it as displayed', async ({
    page,
    browserName,
  }) => {
    await setUp(page, '16:9');
    const pos = position(inspector(page));
    // Unrotated: red left, blue right.
    await expectPreview(
      page,
      [
        [0.25, 0.5],
        [0.75, 0.5],
      ],
      ([l, r]) => near(l!, RED, 40) && near(r!, BLUE, 40),
    );
    await button(pos, 'action.rotate').click();
    expect((await placementOf(page)).rotation).toBe(90);
    // Turned clockwise: the left (red) half is now on top, the right (blue) at the bottom; the sideways clip
    // is fitted, with black at the sides.
    const points: Point[] = [
      [0.5, 0.2],
      [0.5, 0.8],
      [0.1, 0.5],
      [0.9, 0.5],
    ];
    await expectPreview(
      page,
      points,
      ([top, bottom, l, r]) =>
        near(top!, RED, 40) && near(bottom!, BLUE, 40) && near(l!, BLACK, 8) && near(r!, BLACK, 8),
    );
    await shot(page, 'rotated-90', browserName);
    // Flip vertical mirrors the picture as displayed (after the rotation): blue on top.
    const flipV = button(pos, 'action.flip_v');
    await expect(flipV).toHaveAttribute('aria-pressed', 'false');
    await flipV.click();
    await expect(flipV).toHaveAttribute('aria-pressed', 'true');
    await expectPreview(page, points, ([top, bottom]) => near(top!, BLUE, 40) && near(bottom!, RED, 40));
    // Reset, then Flip horizontal alone: blue left, red right.
    await button(pos, 'action.reset').click();
    expect(await placementOf(page)).toEqual(DEFAULT);
    const flipH = button(pos, 'action.flip_h');
    await flipH.click();
    await expect(flipH).toHaveAttribute('aria-pressed', 'true');
    await expectPreview(
      page,
      [
        [0.25, 0.5],
        [0.75, 0.5],
      ],
      ([l, r]) => near(l!, BLUE, 40) && near(r!, RED, 40),
    );
  });

  test('F-006.AC4 F-006.R4 a clip at 200 % and moved: Reset makes it Fit, 100 % and centred, in one step', async ({
    page,
  }) => {
    await setUp(page, '9:16');
    const pos = position(inspector(page));
    const reset = button(pos, 'action.reset');
    // At the defaults Reset is unavailable.
    await expect(reset).toHaveAttribute('aria-disabled', 'true');
    await modeRadio(pos, 'placement.fill').click();
    const scale = field(pos, 'placement.scale');
    await scale.fill('200');
    await scale.press('Enter');
    await button(pos, 'placement.nudge_right').click();
    await button(pos, 'placement.nudge_down').click({ modifiers: ['Shift'] });
    expect(await placementOf(page)).toMatchObject({ mode: 'fill', scale: 200, offsetX: 0.01, offsetY: 0.1 });
    await expect(field(pos, 'placement.offset_x')).toHaveValue('1');
    await expect(field(pos, 'placement.offset_y')).toHaveValue('10');
    await expect(reset).not.toHaveAttribute('aria-disabled', 'true');
    const steps = await stepsOf(page);
    await reset.click();
    expect(await placementOf(page)).toEqual(DEFAULT);
    expect(await stepsOf(page)).toBe(steps + 1);
    await expect(scale).toHaveValue('100');
    await expect(modeRadio(pos, 'placement.fit')).toHaveAttribute('aria-checked', 'true');
    await expect(reset).toHaveAttribute('aria-disabled', 'true');
  });

  test('F-006.AC5 F-006.R5 NFR-06 keyboard only: scale 150 % and two nudges right put the centre 2 % of the frame width right of centre', async ({
    page,
    browserName,
  }) => {
    await setUp(page, '9:16');
    const pos = position(inspector(page));
    const scale = field(pos, 'placement.scale');
    await scale.focus();
    await page.keyboard.press('ControlOrMeta+KeyA');
    await page.keyboard.type('150');
    await page.keyboard.press('Enter');
    expect((await placementOf(page)).scale).toBe(150);
    // Tab on through the offset fields to the nudges: left, up, down, right.
    const right = button(pos, 'placement.nudge_right');
    for (let i = 0; i < 8 && !(await right.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(right).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    expect(await placementOf(page)).toMatchObject({ scale: 150, offsetX: 0.02, offsetY: 0 });
    await expect(field(pos, 'placement.offset_x')).toHaveValue('2');
    // The preview did not step a frame (Enter belonged to the button, RULE-20).
    await expect(page.locator('.tk-time__now')).toHaveText('0:00');
    // The slider has the same label and shows the value (CMP-Inspector "Accessibility").
    const slider = pos.getByRole('slider', { name: text('en-US', 'placement.scale') });
    await expect(slider).toHaveValue('150');
    await expect(slider).toHaveAttribute('aria-valuetext', '150 %');
    // A slider key is one step of 1 %.
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    expect((await placementOf(page)).scale).toBe(151);
  });

  test('F-006.AC6 RULE-04 with Original aspect, rotating a sideways first clip turns the frame to its new shape', async ({
    page,
    browserName,
  }) => {
    await setUp(page, null);
    await expect.poll(() => shape(page)).toBeCloseTo(16 / 9, 1);
    await button(position(inspector(page)), 'action.rotate').click();
    await expect.poll(() => shape(page)).toBeCloseTo(9 / 16, 1);
    // The turned clip fills its new frame: red top, blue bottom, no background.
    await expectPreview(
      page,
      [
        [0.5, 0.25],
        [0.5, 0.75],
      ],
      ([top, bottom]) => near(top!, RED, 40) && near(bottom!, BLUE, 40),
    );
    await shot(page, 'original-rotated', browserName);
    await page.getByRole('button', { name: text('en-US', 'action.undo'), exact: true }).click();
    await expect.poll(() => shape(page)).toBeCloseTo(16 / 9, 1);
  });

  test('F-006 Edge cases a clip moved fully outside the frame shows only background, with no message', async ({
    page,
  }) => {
    await setUp(page, '9:16');
    const x = field(position(inspector(page)), 'placement.offset_x');
    await x.fill('150');
    await x.press('Enter');
    expect((await placementOf(page)).offsetX).toBe(1.5);
    await expectPreview(
      page,
      [
        [0.5, 0.5],
        [0.25, 0.5],
        [0.75, 0.5],
      ],
      (at) => at.every((c) => near(c, BLACK, 8)),
    );
    await expect(page.locator('.tk-notice')).toHaveCount(0);
  });

  test('CMP-Inspector a video clip’s Edit tab starts with Position, then Speed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    const bytes = await page.evaluate(() =>
      (
        window as unknown as { appHarness: { codedClip(r: number, f: number): Promise<number[]> } }
      ).appHarness.codedClip(30, 30),
    );
    await add(page, [{ name: 'coded.mp4', mimeType: 'video/mp4', buffer: Buffer.from(bytes) }]);
    await clipButton(page, 'coded.mp4').click();
    const panel = page.getByRole('complementary', { name: text('en-US', 'inspector.label') });
    const headings = panel.getByRole('tabpanel').getByRole('heading');
    await expect(headings.nth(0)).toHaveText(text('en-US', 'inspector.placement'));
    await expect(headings.nth(1)).toContainText(text('en-US', 'inspector.speed'));
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-006 NFR-06 axe passes with the Position section and the placement handles at 1280 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      await setUp(page, '9:16', lang);
      const pos = position(inspector(page, lang), lang);
      await expect(modeRadio(pos, 'placement.fit', lang)).toBeVisible();
      await button(pos, 'action.flip_h', lang).click();
      await expect(layer(page)).toBeVisible();
      await axe(page);
      await shot(page, `inspector-position-wide-${lang}`, browserName);
    });

    test(`F-006.R5 RULE-21 NFR-06 the phone Edit sheet’s Position, Scale and turn rows at touch size at 320 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      await add(page, [await widePhoto(page)], lang);
      await clipButton(page, 'wide.png', lang).click();
      await page.getByRole('tab', { name: text(lang, 'inspector.edit') }).click();
      const sheet = page.getByRole('tabpanel', { name: text(lang, 'inspector.edit') });
      const pos = sheet.getByRole('region', { name: text(lang, 'inspector.placement') });
      await pos.scrollIntoViewIfNeeded();
      // The Position row: Fit / Fill named by the row label, then the four nudges.
      const modes = pos.getByRole('radiogroup', { name: text(lang, 'inspector.placement') });
      await expect(modes.getByRole('radio')).toHaveCount(2);
      for (const id of [
        'placement.nudge_left',
        'placement.nudge_up',
        'placement.nudge_down',
        'placement.nudge_right',
        'action.rotate',
        'action.flip_h',
        'action.flip_v',
      ] as const) {
        const box = (await button(pos, id, lang).boundingBox())!;
        expect(box.width, id).toBeGreaterThanOrEqual(44);
        expect(box.height, id).toBeGreaterThanOrEqual(44);
      }
      await expect(pos.getByRole('slider', { name: text(lang, 'placement.scale') })).toBeVisible();
      await expect(field(pos, 'placement.scale', lang)).toBeVisible();
      await button(pos, 'placement.nudge_right', lang).click();
      expect((await placementOf(page)).offsetX).toBe(0.01);
      await modes.getByRole('radio', { name: text(lang, 'placement.fill'), exact: true }).click();
      expect((await placementOf(page)).mode).toBe('fill');
      // Nothing overflows the 320 px sheet.
      const sheetBox = (await sheet.boundingBox())!;
      const posBox = (await pos.boundingBox())!;
      expect(posBox.x + posBox.width).toBeLessThanOrEqual(sheetBox.x + sheetBox.width + 0.5);
      await axe(page);
      await shot(page, `sheet-position-narrow-${lang}`, browserName);
    });
  }
});

test.describe('F-006 Q105 the compact inspector’s resize grip (app harness)', () => {
  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`Q105 CMP-Inspector "compact" at 800 px: the grip resizes by keys and drag from size.inspector to 40 %, and the width stays while the page is open (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 800, height: 700 });
      await open(page, lang);
      await add(page, [await widePhoto(page, 'a.png'), await widePhoto(page, 'b.png')], lang);
      const panel = page.locator('.tk-inspector');
      const grip = page.getByRole('separator', { name: text(lang, 'inspector.resize') });
      await expect(grip).toBeVisible();
      // No Close in the compact inspector.
      await expect(panel.getByRole('button', { name: text(lang, 'action.close'), exact: true })).toHaveCount(0);
      const width = async () => (await panel.boundingBox())!.width;
      const w0 = await width();
      expect(Math.round(w0)).toBe(288);
      await expect(grip).toHaveAttribute('aria-valuemin', '288');
      await expect(grip).toHaveAttribute('aria-valuemax', '320');
      await expect(grip).toHaveAttribute('aria-valuenow', '288');
      // Keyboard: Left widens by 16 px; End and Home go to the limits; Right narrows.
      await grip.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(grip).toHaveAttribute('aria-valuenow', '304');
      await expect.poll(async () => Math.round(await width())).toBe(304);
      // The arrows belonged to the grip: the preview did not step (RULE-20).
      await expect(page.locator('.tk-time__now')).toHaveText('0:00');
      await page.keyboard.press('End');
      await expect.poll(async () => Math.round(await width())).toBe(320);
      await page.keyboard.press('ArrowLeft');
      await expect.poll(async () => Math.round(await width())).toBe(320);
      await page.keyboard.press('Home');
      await expect.poll(async () => Math.round(await width())).toBe(288);
      await page.keyboard.press('ArrowRight');
      await expect.poll(async () => Math.round(await width())).toBe(288);
      // Drag: 20 px left widens by 20 px, no further than 40 %.
      const g = (await grip.boundingBox())!;
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
      await page.mouse.down();
      await page.mouse.move(g.x + g.width / 2 - 20, g.y + g.height / 2, { steps: 4 });
      await page.mouse.up();
      await expect.poll(async () => Math.round(await width())).toBe(308);
      const g2 = (await grip.boundingBox())!;
      await page.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2);
      await page.mouse.down();
      await page.mouse.move(g2.x - 200, g2.y + g2.height / 2, { steps: 4 });
      await page.mouse.up();
      await expect.poll(async () => Math.round(await width())).toBe(320);
      // Not an edit: no undo step.
      expect(await stepsOf(page)).toBe(1);
      // The width stays through a selection and the media drawer.
      await clipButton(page, 'b.png', lang).click();
      await expect.poll(async () => Math.round(await width())).toBe(320);
      await page
        .getByRole('toolbar', { name: text(lang, 'toolbar.label') })
        .locator('[data-action="add-media"]')
        .click();
      await expect(page.locator('.tk-media')).toBeVisible();
      await expect(panel).toBeHidden();
      await page
        .locator('.tk-media')
        .getByRole('button', { name: text(lang, 'action.close') })
        .click();
      await expect(panel).toBeVisible();
      await expect.poll(async () => Math.round(await width())).toBe(320);
      await axe(page);
      await shot(page, `compact-grip-${lang}`, browserName);
    });
  }

  test('Q105 the grip is only on compact layouts', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    await expect(page.locator('.tk-inspector__grip')).toBeHidden();
    await expect(page.getByRole('separator', { name: text('en-US', 'inspector.resize') })).toHaveCount(0);
  });
});

test.describe('F-006 placement in the export (media harness)', () => {
  type Report = { ok: boolean; width: number; height: number; exported: number[][]; painted: number[][] };
  const run = (page: Page, placement: Record<string, unknown>, points: readonly Point[]) =>
    page.evaluate(
      ([pl, pts]) =>
        (
          window as unknown as {
            harness: {
              export: {
                frameFill(
                  f: { aspect: string },
                  p: readonly Point[],
                  k: number,
                  placement: Record<string, unknown>,
                ): Promise<Report>;
              };
            };
          }
        ).harness.export.frameFill({ aspect: '16:9' }, pts, 15, pl),
      [placement, points] as const,
    );
  /** Frame 15 of the coded 4:3 clip: the top-left of the picture white, the top-right black, the bottom a hue. */
  const hue = (c: readonly number[]): boolean => c[2]! > 120 && c[0]! < 110;
  // The clip turned clockwise is 3:4, fitted in the 16:9 frame: it spans x 0.289–0.711. Points in it, in
  // the clip's own (displayed) fractions: (0.75, 0.2) and (0.25, 0.2) at the top, (0.75, 0.7) and (0.25, 0.5).
  const at = (u: number, v: number): Point => [0.289 + u * 0.422, v];

  test('F-006.AC3 INV-02 a clip rotated once is turned 90° clockwise in the exported video, as in the preview’s paint', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(HARNESS);
    await expect(page.locator('#out')).toHaveText('ready');
    const points = [at(0.75, 0.2), at(0.75, 0.7), at(0.25, 0.5), [0.1, 0.5], [0.9, 0.5]] as const;
    const r = await run(page, { rotation: 90 }, points);
    expect(r.ok).toBe(true);
    expect(Math.abs(r.width / r.height - 16 / 9)).toBeLessThan(0.02);
    for (const [name, i, check] of [
      ['top-right white (was top-left)', 0, (c: number[]) => near(c, WHITE, 60)],
      ['right below it black (was top-right)', 1, (c: number[]) => near(c, BLACK, 40)],
      ['left half the hue (was the bottom)', 2, hue],
      ['background left', 3, (c: number[]) => near(c, BLACK, 16)],
      ['background right', 4, (c: number[]) => near(c, BLACK, 16)],
    ] as const) {
      expect(check(r.exported[i]!), `export ${name} ${r.exported[i]}`).toBe(true);
      expect(check(r.painted[i]!), `paint ${name} ${r.painted[i]}`).toBe(true);
    }
  });

  test('F-006.R3 RULE-07 INV-02 a flip mirrors the clip as displayed, after its rotation, in the exported video and the paint', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(HARNESS);
    await expect(page.locator('#out')).toHaveText('ready');
    const points = [at(0.25, 0.2), at(0.75, 0.2), at(0.75, 0.5)] as const;
    const r = await run(page, { rotation: 90, flipH: true }, points);
    expect(r.ok).toBe(true);
    for (const [name, i, check] of [
      ['top-left white', 0, (c: number[]) => near(c, WHITE, 60)],
      ['top-right not white', 1, (c: number[]) => !near(c, WHITE, 60)],
      ['right half the hue', 2, hue],
    ] as const) {
      expect(check(r.exported[i]!), `export ${name} ${r.exported[i]}`).toBe(true);
      expect(check(r.painted[i]!), `paint ${name} ${r.painted[i]}`).toBe(true);
    }
  });
});
