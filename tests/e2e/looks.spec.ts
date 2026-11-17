// F-008 apply a look through the real UI on the app harness (tests/harness/app.html: the real `main()`, workers,
// compositor and the bundled looks read by MOD-Assets): CMP-LookGallery in CMP-Inspector's Looks tab (wide)
// and the phone Looks sheet (touch), hover and keyboard previews, choosing, Intensity, None, and the
// adjustments kept. Test media is made in the page: photos of flat colour (`appHarness.stripes()`). Preview
// pixels come from a screenshot of the preview canvas read back in the page (`appHarness.pixels()`);
// thumbnails are read from their canvases. Expected colours are the CPU reference of RULE-08/RULE-09
// (MOD-Compositor `reference`) with the committed look strips (DEP-13). The export half (AC6) runs on the media
// harness (tests/harness/export.ts `gradeExport`): every look at 100 on the 24-patch chart, exported through
// the real export workers and decoded, next to the compositor's paint (INV-02). The look sign-off contact
// sheet is drawn there too. Axe at 320 and 1280 px in en-US and vi-VN.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- plain ESM build script without type declarations
import { decodePng } from '../../scripts/lib/png.mjs';
import { reference, tableFromStrip, type LookTable } from '../../src/compositor';
import { LOOK_GROUPS, LOOK_IDS, LOOKS, type Adjustments } from '../../src/core';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSummary } from '../harness/app';
import { deRgb, lab, de00, type Rgb } from '../support/colour';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;
const SHOTS = fileURLToPath(new URL('../../.build-my-app/reports/screens/F-008/', import.meta.url));
const GROUP_COPY: Readonly<Record<string, CopyId>> = {
  Natural: 'looks.group_natural',
  Film: 'looks.group_film',
  Cinematic: 'looks.group_cinematic',
  'Black & White': 'looks.group_bw',
};
const lookName = (lang: Language, id: string): string =>
  text(lang, LOOKS[id as (typeof LOOK_IDS)[number]].copyId as CopyId);

/** The committed strips (DEP-13) as tables, the oracle's input. */
const TABLES: Readonly<Record<string, LookTable>> = Object.fromEntries(
  LOOK_IDS.map((id) => {
    const png = readFileSync(fileURLToPath(new URL(`../../src/assets/looks/${id}.png`, import.meta.url)));
    const { rgba, width, height } = decodePng(png) as { rgba: Uint8Array; width: number; height: number };
    return [id, tableFromStrip(rgba, width, height)];
  }),
);
const unit = (c: readonly number[]): Rgb => [c[0]! / 255, c[1]! / 255, c[2]! / 255];
/** RULE-08 then RULE-09 on an 8-bit colour, the look at `intensity` (CPU reference, ADR-0006 §6). */
const graded = (c: readonly number[], adj: Adjustments, id: string | null, intensity = 100): number[] =>
  reference.grade(unit(c), adj, id ? { id, intensity } : null, id ? TABLES[id]! : null).map((x) => Math.round(x * 255));
const dE = (a: readonly number[], b: readonly number[]): number => deRgb(unit(a), unit(b));

type Point = readonly [number, number];
interface Harness {
  appHarness: {
    project(): { steps: number };
    clips(): ClipSummary[];
    state(): string;
    stripes(width: number, height: number, colours: readonly (readonly number[])[]): Promise<number[]>;
    pixels(png: string, points: readonly Point[]): Promise<{ width: number; height: number; at: number[][] }>;
  };
}
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const stepsOf = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as Harness).appHarness.project())).steps;
/** Undo steps made since `setUp` (adding the photo is one). */
let base = 0;
const madeSince = async (page: Page) => (await stepsOf(page)) - base;
const stateOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.state());

async function open(page: Page, lang: Language = 'en-US'): Promise<void> {
  await page.goto(`${APP}?effects=fast&lang=${lang}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}

const MUTED = [150, 110, 90];

/** A 16:9 photo (320 × 180) of one flat colour. */
async function photo(page: Page, name: string, colour: readonly number[]): Promise<Payload> {
  const bytes = await page.evaluate(([c]) => (window as unknown as Harness).appHarness.stripes(320, 180, [c]), [
    colour,
  ] as const);
  return { name, mimeType: 'image/png', buffer: Buffer.from(bytes) };
}

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
const gallery = (scope: Locator | Page, lang: Language = 'en-US') =>
  scope.getByRole('region', { name: text(lang, 'looks.title') });
const groups = (scope: Locator, lang: Language = 'en-US') =>
  scope.getByRole('tablist', { name: text(lang, 'looks.groups') });
const tiles = (scope: Locator, lang: Language = 'en-US') =>
  scope.getByRole('radiogroup', { name: text(lang, 'looks.title') });
const tile = (scope: Locator, id: string | null, lang: Language = 'en-US') =>
  tiles(scope, lang).getByRole('radio', {
    name: id === null ? text(lang, 'looks.none') : lookName(lang, id),
    exact: true,
  });
const intensity = (scope: Locator, lang: Language = 'en-US') =>
  scope.getByRole('group', { name: text(lang, 'looks.intensity'), exact: true });
const groupPill = (scope: Locator, group: string, lang: Language = 'en-US') =>
  groups(scope, lang).getByRole('tab', { name: text(lang, GROUP_COPY[group]!), exact: true });
const canvas = (page: Page) => page.locator('.tk-frame canvas');

async function previewAt(page: Page, points: readonly Point[]): Promise<number[][]> {
  const png = (await canvas(page).screenshot()).toString('base64');
  const r = await page.evaluate(([p, pts]) => (window as unknown as Harness).appHarness.pixels(p, pts), [
    png,
    points,
  ] as const);
  return r.at;
}

const CENTRE: Point[] = [[0.5, 0.5]];
/** Waits until the preview's centre is within ΔE00 `tol` of `want`. */
async function expectPreview(page: Page, want: readonly number[], tol = 2.5): Promise<void> {
  let last: number[] = [];
  await expect
    .poll(
      async () => {
        last = (await previewAt(page, CENTRE))[0]!;
        return dE(last, want) < tol;
      },
      { timeout: 15_000, message: 'preview colour' },
    )
    .toBe(true)
    .catch((e: unknown) => {
      throw new Error(`${String(e)}\nlast ${JSON.stringify(last)}, wanted ${JSON.stringify(want)}`);
    });
}

/** The centre pixel of a tile's thumbnail canvas, once drawn. */
async function thumbCentre(t: Locator): Promise<number[]> {
  const c = t.locator('canvas[data-drawn]');
  await expect(c).toHaveCount(1, { timeout: 20_000 });
  return c.evaluate((el: HTMLCanvasElement) => {
    const d = el.getContext('2d')!.getImageData(Math.floor(el.width / 2), Math.floor(el.height / 2), 1, 1).data;
    return [d[0]!, d[1]!, d[2]!];
  });
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

async function shot(page: Page, name: string, browserName: string, target?: Locator): Promise<void> {
  if (browserName !== 'chromium') return;
  for (const close of await page.locator('.tk-notice__close').all()) await close.click();
  if (target) await target.screenshot({ path: `${SHOTS}${name}.png` });
  else await page.screenshot({ path: `${SHOTS}${name}.png` });
}

/** Opens the app at 1280 px with a flat MUTED photo, selects it and opens its Looks tab. */
async function setUp(page: Page, lang: Language = 'en-US'): Promise<Locator> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, lang);
  await add(page, [await photo(page, 'p1.png', MUTED)], lang);
  await clipButton(page, 'p1.png', lang).click();
  await tabs(page, lang)
    .getByRole('tab', { name: text(lang, 'looks.title'), exact: true })
    .click();
  const g = gallery(inspector(page, lang), lang);
  await expect(g).toBeVisible();
  await expectPreview(page, MUTED);
  base = await stepsOf(page);
  return g;
}

test.describe('F-008 apply a look (app harness)', () => {
  test('F-008.AC1 F-008.R1 RULE-09 the four groups are listed and every look shows a thumbnail of the selected clip with the look applied', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(90_000);
    const g = await setUp(page);
    await expect(groups(g).getByRole('tab')).toHaveText(LOOK_GROUPS.map((x) => text('en-US', GROUP_COPY[x]!)));
    // Natural is shown first (nothing chosen yet).
    await expect(groupPill(g, 'Natural')).toHaveAttribute('aria-selected', 'true');
    for (const group of LOOK_GROUPS) {
      await groupPill(g, group).click();
      const ids = LOOK_IDS.filter((id) => LOOKS[id].group === group);
      await expect(tiles(g).getByRole('radio')).toHaveText([
        text('en-US', 'looks.none'),
        ...ids.map((id) => lookName('en-US', id)),
      ]);
      for (const id of ids) {
        const got = await thumbCentre(tile(g, id));
        const want = graded(MUTED, {}, id);
        expect(dE(got, want), `${id}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`).toBeLessThan(2.5);
      }
      if (group === 'Natural') await shot(page, 'inspector-looks-wide-en-US', browserName, inspector(page));
    }
    // Choosing nothing changed the project.
    expect(await madeSince(page)).toBe(0);
  });

  test('F-008.AC2 F-008.R2 RULE-13 pointing at a look or focusing it previews it with a status line; leaving returns the preview and leaves no undo step', async ({
    page,
    browserName,
  }) => {
    const g = await setUp(page);
    const before = await stateOf(page);
    const status = g.getByRole('status');
    // Pointer: hover Vivid.
    await tile(g, 'natural-vivid').hover();
    await expectPreview(page, graded(MUTED, {}, 'natural-vivid'));
    await expect(status).toHaveText(
      text('en-US', 'looks.previewing').replace('{look}', lookName('en-US', 'natural-vivid')),
    );
    await shot(page, 'inspector-looks-previewing-en-US', browserName, inspector(page));
    await page.mouse.move(5, 5);
    await expectPreview(page, MUTED);
    await expect(status).toHaveText('');
    // Keyboard: focus enters on None (nothing chosen), Right moves to Fresh and previews it.
    await groupPill(g, 'Film').click();
    await page.keyboard.press('Tab');
    await expect(tile(g, null)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tile(g, 'film-faded')).toBeFocused();
    await expectPreview(page, graded(MUTED, {}, 'film-faded'));
    await expect(status).toHaveText(
      text('en-US', 'looks.previewing').replace('{look}', lookName('en-US', 'film-faded')),
    );
    // Focus leaves the tiles without choosing: the preview returns.
    await page.keyboard.press('Tab');
    await expect(tiles(g).getByRole('radio', { checked: true })).toHaveText([text('en-US', 'looks.none')]);
    expect((await clipsOf(page))[0]!.look).toBeNull();
    await expectPreview(page, MUTED);
    expect(await madeSince(page)).toBe(0);
    expect(await stateOf(page)).toBe(before);
  });

  test('F-008.R2 RULE-13 Enter on a focused look chooses it as one undo step; the chosen tile is checked', async ({
    page,
  }) => {
    const g = await setUp(page);
    await groupPill(g, 'Cinematic').click();
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(tile(g, 'cine-moody')).toBeFocused();
    await page.keyboard.press('Enter');
    expect((await clipsOf(page))[0]!.look).toBe('cine-moody');
    expect(await madeSince(page)).toBe(1);
    await expect(tile(g, 'cine-moody')).toHaveAttribute('aria-checked', 'true');
    await expect(tile(g, null)).toHaveAttribute('aria-checked', 'false');
    await expectPreview(page, graded(MUTED, {}, 'cine-moody'));
  });

  test('F-008.AC3 F-008.R3 with a chosen look, Intensity 0 makes the preview match the clip with no look', async ({
    page,
    browserName,
  }) => {
    const g = await setUp(page);
    await groupPill(g, 'Film').click();
    await tile(g, 'film-retro').click();
    await page.mouse.move(5, 5);
    await expectPreview(page, graded(MUTED, {}, 'film-retro'));
    const field = intensity(g).getByRole('spinbutton');
    await expect(field).toHaveValue('100');
    await field.fill('60');
    await field.press('Enter');
    await expectPreview(page, graded(MUTED, {}, 'film-retro', 60));
    await shot(page, 'inspector-looks-chosen-en-US', browserName, inspector(page));
    await field.fill('0');
    await field.press('Enter');
    expect((await clipsOf(page))[0]).toMatchObject({ look: 'film-retro', intensity: 0 });
    await expectPreview(page, MUTED, 1.5);
    expect(dE(graded(MUTED, {}, 'film-retro', 0), MUTED)).toBeLessThan(0.5);
    // Typed values clamp; the slider follows.
    await field.fill('250');
    await field.press('Enter');
    expect((await clipsOf(page))[0]!.intensity).toBe(100);
    await expect(intensity(g).getByRole('slider')).toHaveValue('100');
    expect(await madeSince(page)).toBe(4);
  });

  test('F-008.AC4 F-008.R4 a clip with Brightness +30: choosing a look keeps Brightness +30 and both apply', async ({
    page,
  }) => {
    const g = await setUp(page);
    await tabs(page)
      .getByRole('tab', { name: text('en-US', 'inspector.adjust') })
      .click();
    const b = inspector(page).getByRole('group', { name: text('en-US', 'adjust.brightness'), exact: true });
    await b.getByRole('spinbutton').fill('30');
    await b.getByRole('spinbutton').press('Enter');
    await tabs(page)
      .getByRole('tab', { name: text('en-US', 'looks.title'), exact: true })
      .click();
    await groupPill(g, 'Cinematic').click();
    await tile(g, 'cine-golden').click();
    await page.mouse.move(5, 5);
    const [c] = await clipsOf(page);
    expect(c!.adjustments).toEqual({ brightness: 30 });
    expect(c!.look).toBe('cine-golden');
    await expectPreview(page, graded(MUTED, { brightness: 30 }, 'cine-golden'));
    // Both apply: neither the look alone nor Brightness alone.
    expect(dE(graded(MUTED, { brightness: 30 }, 'cine-golden'), graded(MUTED, {}, 'cine-golden'))).toBeGreaterThan(3);
    expect(
      dE(graded(MUTED, { brightness: 30 }, 'cine-golden'), graded(MUTED, { brightness: 30 }, null)),
    ).toBeGreaterThan(3);
  });

  test('F-008.AC5 F-008.R5 a clip with a look: picking None removes it (one step); Intensity is then unavailable', async ({
    page,
    browserName,
  }) => {
    const g = await setUp(page);
    await groupPill(g, 'Black & White').click();
    await tile(g, 'bw-sepia').click();
    await expectPreview(page, graded(MUTED, {}, 'bw-sepia'));
    await tile(g, null).click();
    await page.mouse.move(5, 5);
    expect((await clipsOf(page))[0]!.look).toBeNull();
    expect(await madeSince(page)).toBe(2);
    await expectPreview(page, MUTED);
    await expect(tile(g, null)).toHaveAttribute('aria-checked', 'true');
    await expect(intensity(g).getByRole('slider')).toBeDisabled();
    await expect(intensity(g).getByRole('spinbutton')).toBeDisabled();
    await shot(page, 'inspector-looks-none-en-US', browserName, inspector(page));
  });

  test('CMP-LookGallery the group control switches the visible looks; the chosen look stays chosen across groups; the group shown follows it', async ({
    page,
  }) => {
    const g = await setUp(page);
    await tile(g, 'natural-cool').click();
    await groupPill(g, 'Film').click();
    await expect(tiles(g).getByRole('radio', { checked: true })).toHaveCount(0);
    await groupPill(g, 'Natural').click();
    await expect(tile(g, 'natural-cool')).toHaveAttribute('aria-checked', 'true');
    // Group pills: Left/Right move and select.
    await groupPill(g, 'Natural').focus();
    await page.keyboard.press('ArrowRight');
    await expect(groupPill(g, 'Film')).toBeFocused();
    await expect(groupPill(g, 'Film')).toHaveAttribute('aria-selected', 'true');
    expect(await madeSince(page)).toBe(1);
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-008 NFR-06 the Looks tab at 1280 px: every group name in full, accessible (${lang})`, async ({
      page,
      browserName,
    }) => {
      const g = await setUp(page, lang);
      for (const pill of await groups(g, lang).getByRole('tab').all())
        expect(await pill.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await tile(g, 'natural-warm', lang).click();
      await tile(g, 'natural-vivid', lang).hover();
      await expect(g.getByRole('status')).not.toHaveText('');
      await axe(page);
      await shot(page, `inspector-looks-wide-hover-${lang}`, browserName, inspector(page, lang));
    });

    test(`F-008 RULE-21 NFR-06 the phone Looks sheet at 320 px: touch-size controls, accessible (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      await add(page, [await photo(page, 'p1.png', MUTED)], lang);
      const tab = page.getByRole('tab', { name: text(lang, 'looks.title'), exact: true });
      // Nothing selected: the Looks tab is unavailable.
      await expect(tab).toHaveAttribute('aria-disabled', 'true');
      await clipButton(page, 'p1.png', lang).click();
      await tab.click();
      const sheet = page.getByRole('tabpanel', { name: text(lang, 'looks.title') });
      const g = gallery(sheet, lang);
      await expect(g).toBeVisible();
      for (const pill of await groups(g, lang).getByRole('tab').all()) {
        const box = (await pill.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width).toBeLessThanOrEqual(320);
        expect(await pill.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
      for (const r of await tiles(g, lang).getByRole('radio').all())
        expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await intensity(g, lang).getByRole('slider').boundingBox())!.height).toBeGreaterThanOrEqual(44);
      // Below 360 px four tiles show and the row scrolls sideways to the fifth.
      const row = tiles(g, lang);
      expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      await thumbCentre(tile(g, 'natural-fresh', lang));
      await shot(page, `sheet-looks-narrow-${lang}`, browserName);
      await axe(page);
      await tile(g, 'natural-warm', lang).click();
      expect((await clipsOf(page))[0]!.look).toBe('natural-warm');
      await axe(page);
    });
  }

  test.describe('on a phone (touch)', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('F-008.AC7 F-008.R2 RULE-09 RULE-13 on a phone, tapping three looks in turn applies the last and makes three undo steps', async ({
      page,
      browserName,
    }) => {
      await open(page);
      await add(page, [await photo(page, 'p1.png', MUTED)]);
      await clipButton(page, 'p1.png').tap();
      await page.getByRole('tab', { name: text('en-US', 'looks.title'), exact: true }).tap();
      const g = gallery(page.getByRole('tabpanel', { name: text('en-US', 'looks.title') }));
      await expect(g).toBeVisible();
      const steps = await stepsOf(page);
      await tile(g, 'natural-fresh').tap();
      await tile(g, 'natural-warm').tap();
      await groupPill(g, 'Film').tap();
      await tile(g, 'film-instant').tap();
      const [c] = await clipsOf(page);
      expect(c!.look).toBe('film-instant');
      expect(await stepsOf(page)).toBe(steps + 3);
      await expectPreview(page, graded(MUTED, {}, 'film-instant'));
      await expect(tile(g, 'film-instant')).toHaveAttribute('aria-checked', 'true');
      await shot(page, 'sheet-looks-phone-chosen', browserName);
    });
  });
});

test.describe('F-008 looks in the export (media harness)', () => {
  type Report = {
    ok: boolean;
    width: number;
    height: number;
    input: number[][];
    exported: number[][];
    painted: number[][];
  };
  const run = (page: Page, look: string) =>
    page.evaluate(
      ([id]) =>
        (
          window as unknown as {
            harness: {
              export: { gradeExport(a: Record<string, number>, c: string, l: unknown): Promise<Report> };
            };
          }
        ).harness.export.gradeExport({}, 'colours', { id, intensity: 100 }),
      [look] as const,
    );

  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
    await expect(page.locator('#out')).toHaveText('ready');
  });

  test('F-008.AC6 F-008.R6 NFR-08 INV-02 each bundled look at 100 on the 24-patch chart: the exported video matches the preview (mean ΔE00 < 2, max < 4)', async ({
    page,
  }) => {
    test.setTimeout(600_000);
    const lines: string[] = [];
    for (const id of LOOK_IDS) {
      const r = await run(page, id);
      expect(r.ok, id).toBe(true);
      const d = r.exported.map((e, i) => de00(lab(unit(e)), lab(unit(r.painted[i]!))));
      const mean = d.reduce((s, x) => s + x, 0) / d.length;
      const max = Math.max(...d);
      lines.push(`${id}: mean ${mean.toFixed(2)} max ${max.toFixed(2)}`);
      expect(mean, id).toBeLessThan(2);
      expect(max, id).toBeLessThan(4);
      // The paint is the look (not None): it moved the chart.
      const moved = r.painted.map((p, i) => dE(p, r.input[i]!));
      expect(Math.max(...moved), id).toBeGreaterThan(2);
      // And it is the look of the committed strip (the CPU reference), within the GPU's precision.
      const ref = r.input.map((c) => graded(c, {}, id));
      const off = r.painted.map((p, i) => dE(p, ref[i]!));
      expect(Math.max(...off), id).toBeLessThan(2);
    }
    test.info().annotations.push({ type: 'F-008.AC6', description: lines.join('; ') });
  });

  test('F-008 look sign-off: the contact sheet of the 16 looks on the 24-patch chart and a photo-like picture (for the owner)', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    const names = Object.fromEntries(LOOK_IDS.map((id) => [id, lookName('en-US', id)]));
    const r = await page.evaluate(
      (n) =>
        (
          window as unknown as {
            harness: { export: { lookContactSheet(n: Record<string, string>): Promise<{ looks: number }> } };
          }
        ).harness.export.lookContactSheet(n),
      names,
    );
    expect(r.looks).toBe(16);
    if (browserName === 'chromium')
      await page.locator('#look-sheet').screenshot({ path: `${SHOTS}looks-contact-sheet.png` });
  });
});
