// F-012 set the frame through the real UI (CMP-Inspector's frame section on wide layouts, the Edit
// sheet's frame section on narrow ones) on the app harness (tests/harness/app.html: the real `main()`,
// workers and compositor). Test media is made in the page: a 16:9 photo whose left half is red and right
// half blue (`appHarness.halves()`), and a frame-coded 60 fps clip (`appHarness.codedClip()`). Preview
// pixels come from a screenshot of the preview canvas read back in the page (`appHarness.pixels()`).
// AC6's export half runs on the media harness (tests/harness/export.ts `frameFill`): the real export
// workers, the file decoded, next to the compositor's paint. Axe at 320 and 1280 px in en-US and vi-VN.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSummary } from '../harness/app';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;
const SHOTS = fileURLToPath(new URL('../../.build-my-app/reports/screens/F-012/', import.meta.url));

type Point = readonly [number, number];
interface Harness {
  appHarness: {
    frame(): { aspect: string; frameRate: number; background: string; frameRateChosen?: boolean };
    project(): { steps: number };
    load(json: string): void;
    frames(): number[];
    clips(): ClipSummary[];
    halves(width: number, height: number): Promise<number[]>;
    codedClip(rate: number, frames: number): Promise<number[]>;
    pixels(png: string, points: readonly Point[]): Promise<{ width: number; height: number; at: number[][] }>;
    preview(): { shown: { exact: boolean } | null };
  };
}
const frameOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.frame());
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const framesOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.frames());

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
async function widePhoto(page: Page): Promise<Payload> {
  const bytes = await page.evaluate(() => (window as unknown as Harness).appHarness.halves(320, 180));
  return { name: 'wide.png', mimeType: 'image/png', buffer: Buffer.from(bytes) };
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
}

const inspector = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('complementary', { name: text(lang, 'inspector.frame') });
const group = (page: Page, id: CopyId, lang: Language = 'en-US') =>
  inspector(page, lang).getByRole('radiogroup', { name: text(lang, id) });
const radio = (page: Page, groupId: CopyId, name: string, lang: Language = 'en-US') =>
  group(page, groupId, lang).getByRole('radio', { name, exact: true });
const canvas = (page: Page) => page.locator('.tk-frame canvas');

/** The preview canvas's shape (width ÷ height) on screen. */
async function shape(page: Page): Promise<number> {
  const b = (await canvas(page).boundingBox())!;
  return b.width / b.height;
}

/** Preview colours at fractional points of the canvas (a screenshot read back in the page). */
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
const RED = [255, 0, 0];
const BLUE = [0, 0, 255];
/** COPY-colour.yellow's picture colour (tokens.json text.color.yellow, #FFD60A). */
const YELLOW = [0xff, 0xd6, 0x0a];
/** Above and below a fitted 16:9 clip in a 9:16 frame (the clip is the middle 32 % of the height). */
const TOP: Point = [0.5, 0.1];
const BOTTOM: Point = [0.5, 0.9];
const LEFT_TOP: Point = [0.1, 0.1];
const RIGHT_TOP: Point = [0.9, 0.1];
const CLIP_LEFT: Point = [0.25, 0.5];
const CLIP_RIGHT: Point = [0.75, 0.5];

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

async function shot(page: Page, name: string, browserName: string): Promise<void> {
  if (browserName !== 'chromium') return;
  // The "Added" notice would cover the preview: close it first.
  for (const close of await page.locator('.tk-notice__close').all()) await close.click();
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

/** Waits until the preview shows the picture exactly, then until `check` holds for its colours. */
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

test.describe('F-012 set the frame (app harness)', () => {
  test('F-012.AC1 a 16:9 clip in Original, then 9:16: the preview turns vertical with the clip fitted and black above and below', async ({
    page,
    browserName,
  }) => {
    await open(page);
    // The frame section shows with nothing selected (SCR-Editor "default"), even before media.
    await expect(inspector(page)).toBeVisible();
    await expect(inspector(page).getByRole('heading', { name: text('en-US', 'inspector.frame') })).toBeVisible();
    await expect(radio(page, 'frame.aspect', text('en-US', 'frame.original'))).toHaveAttribute('aria-checked', 'true');
    await add(page, [await widePhoto(page)]);
    await expect.poll(() => shape(page)).toBeCloseTo(16 / 9, 1);
    await radio(page, 'frame.aspect', '9:16').click();
    expect((await frameOf(page)).aspect).toBe('9:16');
    await expect(radio(page, 'frame.aspect', '9:16')).toHaveAttribute('aria-checked', 'true');
    // The preview changes shape immediately (no wait on media).
    await expect.poll(() => shape(page)).toBeCloseTo(9 / 16, 1);
    await expectPreview(
      page,
      [TOP, BOTTOM, CLIP_LEFT, CLIP_RIGHT],
      ([top, bottom, l, r]) =>
        near(top!, BLACK, 8) && near(bottom!, BLACK, 8) && near(l!, RED, 40) && near(r!, BLUE, 40),
    );
    await shot(page, '9x16-black-wide', browserName);
  });

  test('F-012.AC3 Blur fills the empty areas of a fitted 16:9 clip in a 9:16 frame with a blurred, enlarged copy of it', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await add(page, [await widePhoto(page)]);
    await radio(page, 'frame.aspect', '9:16').click();
    await radio(page, 'frame.background', text('en-US', 'frame.blur')).click();
    expect((await frameOf(page)).background).toBe('blur');
    await expect(radio(page, 'frame.background', text('en-US', 'frame.blur'))).toHaveAttribute('aria-checked', 'true');
    // Above the clip: the enlarged copy covers the frame (the frame shows the middle of the clip, so its
    // left edge is still red and its right edge blue); at the middle the halves are blurred together.
    // The fitted clip itself stays sharp.
    await expectPreview(
      page,
      [LEFT_TOP, RIGHT_TOP, TOP, BOTTOM, CLIP_LEFT, CLIP_RIGHT],
      ([lt, rt, top, bottom, l, r]) =>
        lt![0]! > 120 &&
        lt![0]! > lt![2]! + 60 &&
        lt![1]! < 80 &&
        rt![2]! > 120 &&
        rt![2]! > rt![0]! + 60 &&
        top![0]! > 40 &&
        top![2]! > 40 &&
        bottom![0]! > 40 &&
        bottom![2]! > 40 &&
        near(l!, RED, 40) &&
        near(r!, BLUE, 40),
    );
    await shot(page, '9x16-blur-wide', browserName);
  });

  test('F-012.AC6 yellow fills the empty areas of a fitted clip in a 9:16 frame in the preview', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await add(page, [await widePhoto(page)]);
    await radio(page, 'frame.aspect', '9:16').click();
    const yellow = radio(page, 'frame.background', text('en-US', 'colour.yellow'));
    await yellow.click();
    await expect(yellow).toHaveAttribute('aria-checked', 'true');
    expect((await frameOf(page)).background).toBe('yellow');
    await expectPreview(
      page,
      [TOP, BOTTOM, CLIP_LEFT],
      ([top, bottom, l]) => near(top!, YELLOW, 12) && near(bottom!, YELLOW, 12) && near(l!, RED, 40),
    );
    await shot(page, '9x16-yellow-wide', browserName);
  });

  test('F-012.AC2 the first video, recorded at 60 fps with no rate chosen, sets the frame rate to 60', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await open(page);
    await expect(radio(page, 'frame.rate', '30')).toHaveAttribute('aria-checked', 'true');
    const bytes = await page.evaluate(() => (window as unknown as Harness).appHarness.codedClip(60, 60));
    await add(page, [{ name: 'sixty.mp4', mimeType: 'video/mp4', buffer: Buffer.from(bytes) }]);
    expect((await frameOf(page)).frameRate).toBe(60);
    await expect(radio(page, 'frame.rate', '60')).toHaveAttribute('aria-checked', 'true');
  });

  test('F-012.AC4 9:16 → 1:1, then Undo: 9:16 again with every item unchanged; each frame change is one step', async ({
    page,
  }) => {
    await open(page);
    await add(page, [await widePhoto(page)]);
    const steps = async () => (await page.evaluate(() => (window as unknown as Harness).appHarness.project())).steps;
    const added = await steps();
    await radio(page, 'frame.aspect', '9:16').click();
    expect(await steps()).toBe(added + 1);
    const state = () =>
      page.evaluate(() => (window as unknown as { appHarness: { state(): string } }).appHarness.state());
    const before = await state();
    await radio(page, 'frame.aspect', '1:1').click();
    expect((await frameOf(page)).aspect).toBe('1:1');
    expect(await steps()).toBe(added + 2);
    await expect.poll(() => shape(page)).toBeCloseTo(1, 1);
    await page
      .getByRole('toolbar', { name: text('en-US', 'toolbar.label') })
      .getByRole('button', { name: text('en-US', 'action.undo'), exact: true })
      .click();
    expect(await state()).toBe(before);
    expect(await steps()).toBe(added + 1);
    await expect(radio(page, 'frame.aspect', '9:16')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => shape(page)).toBeCloseTo(9 / 16, 1);
  });

  test('F-012.AC5 25 → 24 fps on a 600 s project: photo 3 frames, video shortened to 14,397, COPY-notice.length_limited', async ({
    page,
  }) => {
    await open(page);
    // A 25 fps project of a 3-frame photo and a 599.897 s video (no control sets this up yet).
    const S = 1_000_000;
    const base = {
      placement: { mode: 'fit', scale: 100, offsetX: 0, offsetY: 0, rotation: 0, flipH: false, flipV: false },
      adjustments: {},
      look: null,
      fadeIn: 0,
      fadeOut: 0,
      crossFadeNext: 0,
    };
    const project = {
      frame: { aspect: 'original', frameRate: 25, background: 'black' },
      sources: [
        { id: 's-p', kind: 'photo', name: 'p.png', bytes: 1, width: 1920, height: 1080 },
        {
          id: 's-v',
          kind: 'video',
          name: 'v.mp4',
          bytes: 1,
          duration: 599_897_000,
          width: 1920,
          height: 1080,
          frameRate: 25,
          hasSound: false,
        },
      ],
      clips: [
        { id: 'P', sourceId: 's-p', kind: 'photo', duration: 0.12 * S, ...base },
        {
          id: 'V',
          sourceId: 's-v',
          kind: 'video',
          in: 0,
          out: 599_897_000,
          speedPct: 100,
          volume: 100,
          muted: false,
          ...base,
        },
      ],
      textLayers: [],
      audioClips: [],
    };
    await page.evaluate((json) => (window as unknown as Harness).appHarness.load(json), JSON.stringify(project));
    expect(await framesOf(page)).toEqual([3, 14_997]);
    await expect(radio(page, 'frame.rate', '25')).toHaveAttribute('aria-checked', 'true');
    await radio(page, 'frame.rate', '24').click();
    expect(await frameOf(page)).toMatchObject({ frameRate: 24, frameRateChosen: true });
    expect(await framesOf(page)).toEqual([3, 14_397]);
    await expect(page.locator('[data-notice="length_limited"]')).toContainText(text('en-US', 'notice.length_limited'));
    await expect(page.locator('.tk-transport')).toContainText('10:00');
  });

  test('CMP-Inspector option groups are radio groups: one tab stop, the arrows move the choice without stepping the preview', async ({
    page,
  }) => {
    await open(page);
    await add(page, [await widePhoto(page)]);
    const rate30 = radio(page, 'frame.rate', '30');
    await expect(rate30).toHaveAttribute('tabindex', '0');
    await expect(radio(page, 'frame.rate', '24')).toHaveAttribute('tabindex', '-1');
    await rate30.focus();
    await page.keyboard.press('ArrowRight');
    await expect(radio(page, 'frame.rate', '60')).toBeFocused();
    await expect(radio(page, 'frame.rate', '60')).toHaveAttribute('aria-checked', 'true');
    expect((await frameOf(page)).frameRate).toBe(60);
    // RULE-20: the arrow belonged to the radio group, so the playhead did not move a frame.
    await expect(page.locator('.tk-time__now')).toHaveText('0:00');
    await expect(page.locator('.tk-time__frame')).toContainText('00');
    // Wraps from the last to the first.
    await page.keyboard.press('ArrowRight');
    await expect(radio(page, 'frame.rate', '24')).toBeFocused();
    expect((await frameOf(page)).frameRate).toBe(24);
    // Swatches carry colour names (CMP-Inspector "Accessibility").
    for (const id of ['colour.white', 'colour.black', 'colour.yellow', 'colour.pink'] as const)
      await expect(radio(page, 'frame.background', text('en-US', id))).toBeVisible();
    // With a clip selected the inspector is the selection's (the frame section goes).
    await page
      .getByRole('region', { name: text('en-US', 'timeline.label') })
      .getByRole('button', { name: /^wide\.png / })
      .click();
    // A photo's inspector is its Edit section under a plain title row (F-006, build question 134).
    await expect(page.getByRole('complementary', { name: text('en-US', 'inspector.edit') })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: text('en-US', 'frame.aspect') })).toHaveCount(0);
  });

  test('RULE-04 F-012.R2 clicking the rate already shown chooses it: a 60 fps video added later keeps 30 fps', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await open(page);
    const thirty = radio(page, 'frame.rate', '30');
    await expect(thirty).toHaveAttribute('aria-checked', 'true');
    await thirty.click();
    expect(await frameOf(page)).toMatchObject({ frameRate: 30, frameRateChosen: true });
    const bytes = await page.evaluate(() => (window as unknown as Harness).appHarness.codedClip(60, 60));
    await add(page, [{ name: 'sixty.mp4', mimeType: 'video/mp4', buffer: Buffer.from(bytes) }]);
    expect((await frameOf(page)).frameRate).toBe(30);
  });

  test('CMP-Inspector focus moves to the panel heading when the frame section holding it goes (redo selects a clip)', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await add(page, [await widePhoto(page)]);
    const tl = page.getByRole('region', { name: text('en-US', 'timeline.label') });
    await tl
      .getByRole('button', { name: /^wide\.png / })
      .first()
      .click();
    await tl
      .getByRole('toolbar')
      .getByRole('button', { name: text('en-US', 'action.duplicate') })
      .click();
    const undoRedo = page.getByRole('toolbar', { name: text('en-US', 'toolbar.label') });
    // Undo the duplicate: its copy is gone, so nothing is selected and the frame section shows.
    await undoRedo.getByRole('button', { name: text('en-US', 'action.undo'), exact: true }).click();
    const one = radio(page, 'frame.aspect', '1:1');
    await one.focus();
    // Redo from the keyboard while a frame radio has focus: RULE-13 selects the copy.
    await page.keyboard.press(browserName === 'webkit' ? 'Meta+Shift+KeyZ' : 'ControlOrMeta+Shift+KeyZ');
    // A photo's panel is its Edit section under a plain title row (F-006, build question 134).
    const heading = page
      .getByRole('complementary', { name: text('en-US', 'inspector.edit') })
      .getByRole('heading', { name: text('en-US', 'inspector.edit'), level: 2 });
    await expect(heading).toBeFocused();
  });

  test('SCR-Editor compact with the media drawer open: the inspector steps aside and the preview and transport stay in the preview area', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 700, height: 500 });
    await open(page, 'vi-VN');
    const chooser = page.waitForEvent('filechooser');
    await page
      .locator('.tk-empty')
      .getByRole('button', { name: text('vi-VN', 'action.add_media') })
      .click();
    await (await chooser).setFiles([await widePhoto(page)]);
    await expect.poll(async () => (await clipsOf(page)).length, { timeout: 20_000 }).toBe(1);
    await expect(page.locator('.tk-media')).toBeVisible();
    await expect(page.locator('.tk-inspector')).toBeHidden();
    const area = (await page.locator('.tk-preview-area').boundingBox())!;
    for (const sel of ['.tk-frame canvas', '.tk-transport']) {
      const b = (await page.locator(sel).boundingBox())!;
      expect(b.x, sel).toBeGreaterThanOrEqual(area.x - 0.5);
      expect(b.x + b.width, sel).toBeLessThanOrEqual(area.x + area.width + 0.5);
    }
    // Closing the drawer brings the inspector back.
    await page
      .locator('.tk-media')
      .getByRole('button', { name: text('vi-VN', 'action.close') })
      .click();
    await expect(page.locator('.tk-inspector')).toBeVisible();
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`NFR-06 the frame section passes axe at 1280 px (${lang})`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, lang);
      await add(page, [await widePhoto(page)], lang);
      await radio(page, 'frame.aspect', '9:16', lang).click();
      await radio(page, 'frame.background', text(lang, 'frame.blur'), lang).click();
      await expect(inspector(page, lang).getByRole('heading')).toHaveText(text(lang, 'inspector.frame'));
      await axe(page);
    });

    test(`F-012 the phone Edit sheet holds the frame section at touch size and passes axe at 320 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      await add(page, [await widePhoto(page)], lang);
      // The docked inspector is hidden on narrow layouts.
      await expect(page.locator('.tk-inspector')).toBeHidden();
      await page.getByRole('tab', { name: text(lang, 'inspector.edit') }).click();
      const sheet = page.getByRole('tabpanel', { name: text(lang, 'inspector.edit') });
      const section = sheet.getByRole('region', { name: text(lang, 'inspector.frame') });
      await expect(section.getByRole('heading', { name: text(lang, 'inspector.frame') })).toBeVisible();
      const nine = section.getByRole('radio', { name: '9:16', exact: true });
      await nine.click();
      expect((await frameOf(page)).aspect).toBe('9:16');
      await expect.poll(() => shape(page)).toBeCloseTo(9 / 16, 1);
      // Touch-size rows (CMP-Inspector "narrow sheets", RULE-21).
      for (const r of await section.getByRole('radio').all()) {
        await r.scrollIntoViewIfNeeded();
        const b = (await r.boundingBox())!;
        expect(b.height, (await r.getAttribute('data-value')) ?? '').toBeGreaterThanOrEqual(44);
        expect(b.width, (await r.getAttribute('data-value')) ?? '').toBeGreaterThanOrEqual(44);
      }
      await axe(page);
      if (lang === 'en-US') {
        await nine.scrollIntoViewIfNeeded();
        await shot(page, '9x16-black-narrow', browserName);
        const yellow = section.getByRole('radio', { name: text(lang, 'colour.yellow') });
        await yellow.click();
        await expectPreview(page, [TOP], ([top]) => near(top!, YELLOW, 12));
        await shot(page, '9x16-yellow-narrow', browserName);
        await section.getByRole('radio', { name: text(lang, 'frame.blur') }).click();
        // The blurred copy: red at the left edge (not the yellow it replaces), blue at the right.
        await expectPreview(
          page,
          [LEFT_TOP, RIGHT_TOP],
          ([lt, rt]) => lt![0]! > 120 && lt![1]! < 80 && rt![2]! > 120 && rt![1]! < 80,
        );
        await shot(page, '9x16-blur-narrow', browserName);
      }
    });
  }
});

test.describe('F-012 the frame in export (media harness)', () => {
  test('F-012.AC6 yellow fills the empty areas of a fitted clip in a 9:16 frame in the exported video, as in the preview’s paint', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(HARNESS);
    await expect(page.locator('#out')).toHaveText('ready');
    const points: Point[] = [TOP, BOTTOM, [0.05, 0.05], [0.95, 0.95], [0.5, 0.5]];
    const r = await page.evaluate(
      (pts) =>
        (
          window as unknown as {
            harness: {
              export: {
                frameFill(
                  f: { aspect: string; background: string },
                  p: readonly Point[],
                ): Promise<{ ok: boolean; width: number; height: number; exported: number[][]; painted: number[][] }>;
              };
            };
          }
        ).harness.export.frameFill({ aspect: '9:16', background: 'yellow' }, pts),
      points,
    );
    expect(r.ok).toBe(true);
    expect(r.height).toBeGreaterThan(r.width); // a 9:16 file
    expect(Math.abs(r.width / r.height - 9 / 16)).toBeLessThan(0.02);
    // The four empty-area points are yellow in the file and in the paint; the middle is the clip.
    for (let i = 0; i < 4; i++) {
      expect(near(r.exported[i]!, YELLOW, 16), `export ${points[i]} ${r.exported[i]}`).toBe(true);
      expect(near(r.painted[i]!, YELLOW, 4), `paint ${points[i]} ${r.painted[i]}`).toBe(true);
    }
    expect(near(r.exported[4]!, YELLOW, 40)).toBe(false);
  });
});

test.describe('F-012 the frame section with a coarse pointer (compact)', () => {
  test.use({ hasTouch: true, viewport: { width: 800, height: 700 } });

  test('RULE-21 touch-size options and swatches fit the docked inspector without overflow', async ({ page }) => {
    await open(page);
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    test.skip(!coarse, 'this engine does not report a coarse pointer with touch emulation');
    for (const g of await inspector(page).getByRole('radiogroup').all()) {
      const { scroll, client } = await g.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(scroll, (await g.getAttribute('aria-labelledby')) ?? '').toBeLessThanOrEqual(client);
      const box = (await g.boundingBox())!;
      const body = (await page.locator('.tk-inspector__body').boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(body.x + body.width);
      for (const r of await g.getByRole('radio').all()) {
        const b = (await r.boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.x + b.width).toBeLessThanOrEqual(body.x + body.width);
      }
    }
  });
});
