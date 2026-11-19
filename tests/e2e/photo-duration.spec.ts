// F-004.R8 a photo clip's Duration row (build question 150) through the real UI on the app harness
// (tests/harness/app.html: the real `main()`, workers and compositor): CMP-Inspector's Edit tab of a photo
// (Position, Duration, Fades; board CMP-Inspector "photo clip") at 1280 px and the phone Edit sheet's Duration
// row at 320 px. Test media is made in the page: flat photos (`appHarness.stripes()`). A long project for the
// RULE-03 limit is loaded through `appHarness.load()`. Axe at 320 and 1280 px in en-US and vi-VN.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSummary } from '../harness/app';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;
const SHOTS = fileURLToPath(new URL('../../.build-my-app/reports/screens/F-004/', import.meta.url));
const S = 1_000_000;

interface Harness {
  appHarness: {
    project(): { steps: number };
    clips(): ClipSummary[];
    state(): string;
    load(json: string): void;
    stripes(width: number, height: number, colours: readonly (readonly number[])[]): Promise<number[]>;
  };
}
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const stepsOf = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as Harness).appHarness.project())).steps;
const stateOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.state());

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}

async function open(page: Page, lang: Language): Promise<void> {
  await page.goto(`${APP}?effects=fast&lang=${lang}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

async function photo(page: Page, name: string, colour: readonly number[]): Promise<Payload> {
  const bytes = await page.evaluate(([c]) => (window as unknown as Harness).appHarness.stripes(320, 180, [c]), [
    colour,
  ] as const);
  return { name, mimeType: 'image/png', buffer: Buffer.from(bytes) };
}

/** Adds two 3 s photos A and B through Add media, then closes the media panel and the notices. */
async function twoPhotos(page: Page, lang: Language): Promise<void> {
  await open(page, lang);
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('.tk-empty')
    .getByRole('button', { name: text(lang, 'action.add_media') })
    .click();
  await (
    await chooser
  ).setFiles([await photo(page, 'A.png', [200, 40, 40]), await photo(page, 'B.png', [40, 40, 200])]);
  await expect.poll(async () => (await clipsOf(page)).length, { timeout: 30_000 }).toBe(2);
  const media = page.locator('.tk-media');
  await media.getByRole('button', { name: text(lang, 'action.close') }).click();
  await expect(media).toHaveCount(0);
  await closeNotices(page);
}

async function closeNotices(page: Page): Promise<void> {
  for (const close of await page.locator('.tk-notice__close').all()) await close.click();
}

const timeline = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('region', { name: text(lang, 'timeline.label') });
const clipButton = (page: Page, name: string, lang: Language = 'en-US') =>
  timeline(page, lang).getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')} `) });
const inspector = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('complementary', { name: text(lang, 'inspector.label') });
const durationField = (scope: Locator, lang: Language = 'en-US') =>
  scope.getByRole('spinbutton', { name: text(lang, 'photo.duration'), exact: true });
const durationSlider = (scope: Locator, lang: Language = 'en-US') =>
  scope.getByRole('slider', { name: text(lang, 'photo.duration'), exact: true });
const undoButton = (page: Page) =>
  page
    .getByRole('toolbar', { name: text('en-US', 'toolbar.label') })
    .getByRole('button', { name: text('en-US', 'action.undo'), exact: true });

async function typeDuration(scope: Locator, value: string, lang: Language = 'en-US'): Promise<void> {
  const f = durationField(scope, lang);
  await f.fill(value);
  await f.press('Enter');
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

async function shot(page: Page, name: string, browserName: string): Promise<void> {
  if (browserName !== 'chromium') return;
  await closeNotices(page);
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

test.describe('F-004.R8 a photo’s Duration row (app harness)', () => {
  test('F-004.AC11 F-004.R8 CMP-Inspector "photo clip" the Edit tab is Position, Duration, Fades; a 3 s photo typed to 4.5 s moves the next clip to 4.5 s in one step; undo restores 3 s', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await twoPhotos(page, 'en-US');
    await clipButton(page, 'A.png').click();
    const panel = inspector(page);
    const order = await panel
      .locator('[data-section]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-section')));
    expect(order.filter((s) => ['placement', 'duration', 'speed', 'fades'].includes(s!))).toEqual([
      'placement',
      'duration',
      'fades',
    ]);
    await expect(panel.getByRole('heading', { name: text('en-US', 'photo.duration'), exact: true })).toBeVisible();
    await expect(durationField(panel)).toHaveValue('3.0');
    await expect(durationSlider(panel)).toHaveAttribute('aria-valuetext', '3.0 s');
    const steps = await stepsOf(page);
    await typeDuration(panel, '4.5');
    await expect(durationField(panel)).toHaveValue('4.5');
    expect((await clipsOf(page)).map((c) => c.start)).toEqual([0, 4.5]);
    expect(await stepsOf(page)).toBe(steps + 1);
    await undoButton(page).click();
    await expect(durationField(panel)).toHaveValue('3.0');
    expect((await clipsOf(page)).map((c) => c.start)).toEqual([0, 3]);
  });

  test('F-004.AC12 F-004.R8 RULE-13 Q104 a Duration slider movement through many values is one step; dragged away and back to where it began it leaves no step', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await twoPhotos(page, 'en-US');
    await clipButton(page, 'A.png').click();
    const panel = inspector(page);
    const s = durationSlider(panel);
    await s.scrollIntoViewIfNeeded();
    const box = (await s.boundingBox())!;
    const y = box.y + box.height / 2;
    const x0 = await s.evaluate((el: HTMLInputElement) => {
      const r = el.getBoundingClientRect();
      return r.left + 7 + ((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * (r.width - 14);
    });
    const before = await stateOf(page);
    const steps = await stepsOf(page);
    // Many values in one movement: one step; the next clip follows.
    await page.mouse.move(x0, y);
    await page.mouse.down();
    const seen = new Set<string>();
    let x = x0;
    for (let k = 1; k <= 10; k++) {
      x = x0 + k * box.width * 0.03;
      await page.mouse.move(x, y);
      seen.add(await s.inputValue());
    }
    await page.mouse.up();
    expect(seen.size).toBeGreaterThan(5);
    expect(await stepsOf(page)).toBe(steps + 1);
    const tenths = Number(await s.inputValue());
    expect(tenths).toBeGreaterThan(30);
    expect((await clipsOf(page))[1]!.start).toBeCloseTo(tenths / 10, 5);
    // Away and back to where this movement began (the same pointer position): no step (Q104).
    const after = await stateOf(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let k = 1; k <= 6; k++) await page.mouse.move(x + k * 4, y);
    expect(Number(await s.inputValue())).toBeGreaterThan(tenths);
    for (let k = 5; k >= 0; k--) await page.mouse.move(x + k * 4, y);
    await page.mouse.up();
    await expect(s).toHaveValue(String(tenths));
    expect(await stepsOf(page)).toBe(steps + 1);
    expect(await stateOf(page)).toBe(after);
    // One undo restores the duration before the first movement.
    await undoButton(page).click();
    expect(await stateOf(page)).toBe(before);
    await expect(s).toHaveValue('30');
  });

  test('F-004.AC13 F-004.R8 RULE-05 RULE-03 typed values clamp to 0.1–60 s; in a 9 min 58 s project a 10 s duration stops at 5 s with COPY-notice.length_limited', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await twoPhotos(page, 'en-US');
    await clipButton(page, 'A.png').click();
    const panel = inspector(page);
    await typeDuration(panel, '0');
    await expect(durationField(panel)).toHaveValue('0.1');
    await typeDuration(panel, '90');
    await expect(durationField(panel)).toHaveValue('60.0');
    // 3 s + 9 × 60 s + 55 s = 9 min 58 s.
    const state = JSON.parse(await stateOf(page)) as { clips: Record<string, unknown>[] };
    const [a, b] = state.clips as [Record<string, unknown>, Record<string, unknown>];
    state.clips = [
      { ...a, duration: 3 * S },
      ...Array.from({ length: 10 }, (_, i) => ({
        ...b,
        id: `${String(b['id'])}-${i}`,
        duration: (i < 9 ? 60 : 55) * S,
      })),
    ];
    await page.evaluate((json) => (window as unknown as Harness).appHarness.load(json), JSON.stringify(state));
    await expect.poll(async () => (await clipsOf(page)).at(-1)!.end).toBe(598);
    // A stays selected (the same item); at this scale its end handle covers it on the timeline.
    await expect(durationField(panel)).toHaveValue('3.0');
    await typeDuration(panel, '10');
    await expect(durationField(panel)).toHaveValue('5.0');
    await expect(page.getByText(text('en-US', 'notice.length_limited'))).toBeVisible();
    expect((await clipsOf(page)).at(-1)!.end).toBe(600);
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-004.R8 NFR-06 the Duration row in a photo's Edit tab passes axe at 1280 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await twoPhotos(page, lang);
      await clipButton(page, 'A.png', lang).click();
      const panel = inspector(page, lang);
      await typeDuration(panel, lang === 'vi-VN' ? '4,5' : '4.5', lang);
      await expect(durationField(panel, lang)).toHaveValue(lang === 'vi-VN' ? '4,5' : '4.5');
      await expect(durationSlider(panel, lang)).toHaveAttribute('aria-valuetext', lang === 'vi-VN' ? '4,5 s' : '4.5 s');
      await shot(page, `inspector-photo-duration-wide-${lang}`, browserName);
      await axe(page);
    });

    test(`F-004.R8 RULE-21 NFR-06 the phone Edit sheet's Duration row at touch size at 320 px; axe passes (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await twoPhotos(page, lang);
      await clipButton(page, 'A.png', lang).click();
      await page.getByRole('tab', { name: text(lang, 'inspector.edit') }).click();
      const sheet = page.locator('.tk-sheet');
      await expect(sheet).toBeVisible();
      const section = sheet.locator('[data-section="duration"]');
      await section.scrollIntoViewIfNeeded();
      await expect(section).toBeVisible();
      // In place of Speed, before Fades.
      const order = await sheet
        .locator('[data-section]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-section')));
      expect(order.filter((s) => ['duration', 'speed', 'fades'].includes(s!))).toEqual(['duration', 'fades']);
      expect((await durationSlider(sheet, lang).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await durationField(sheet, lang).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await typeDuration(sheet, lang === 'vi-VN' ? '7,5' : '7.5', lang);
      await expect(durationField(sheet, lang)).toHaveValue(lang === 'vi-VN' ? '7,5' : '7.5');
      expect((await clipsOf(page))[1]!.start).toBe(7.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      await shot(page, `sheet-photo-duration-narrow-${lang}`, browserName);
      await axe(page);
    });
  }
});
