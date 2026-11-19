// F-022.R6 / NFR-07: no slider-row label is clipped in vi-VN — CMP-Inspector's Edit (Scale, Speed Exact,
// Duration, Fade in / Fade out), Adjust (the twelve adjustments) and Sound (Volume) rows, in the docked
// inspector at 1280 and 800 px and in the phone sheets at 320 px. A label is clipped when its content is wider
// than its box (scrollWidth > clientWidth); long labels wrap to a second line instead (the label columns keep
// their width so the rows stay aligned). Axe passes in each state. App harness (tests/harness/app.html): a
// clip with a tone in its sound (`appHarness.toneClip()`) and a flat photo (`appHarness.stripes()`).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSummary } from '../harness/app';
import type { ToneSpec } from '../harness/sound';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const LANG: Language = 'vi-VN';
const text = (id: CopyId): string => CATALOG[LANG][id] as string;

interface Harness {
  appHarness: {
    clips(): ClipSummary[];
    stripes(width: number, height: number, colours: readonly (readonly number[])[]): Promise<number[]>;
    toneClip(spec: ToneSpec): Promise<number[]>;
  };
}
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());

/** Every slider row's label class (CMP-Inspector rows, wide and touch). */
const LABELS = '.tk-fades__label, .tk-adjust__label, .tk-speed__exact, .tk-place__label, .tk-sound__label';

async function setUp(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: width < 700 ? 720 : 800 });
  await page.goto(`${APP}?effects=fast&lang=${LANG}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
  const spec: ToneSpec = { seconds: 2, onset: 0, freq: 440, amp: 0.25, codec: 'aac', sampleRate: 48_000 };
  const video = await page.evaluate((s) => (window as unknown as Harness).appHarness.toneClip(s), spec);
  const photo = await page.evaluate(() => (window as unknown as Harness).appHarness.stripes(320, 180, [[90, 90, 90]]));
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('.tk-empty')
    .getByRole('button', { name: text('action.add_media') })
    .click();
  await (
    await chooser
  ).setFiles([
    { name: 'V.mp4', mimeType: 'video/mp4', buffer: Buffer.from(video) },
    { name: 'P.png', mimeType: 'image/png', buffer: Buffer.from(photo) },
  ]);
  await expect.poll(async () => (await clipsOf(page)).length, { timeout: 30_000 }).toBe(2);
  const media = page.locator('.tk-media');
  await media.getByRole('button', { name: text('action.close') }).click();
  await expect(media).toHaveCount(0);
  for (const close of await page.locator('.tk-notice__close').all()) await close.click();
}

const clipButton = (page: Page, name: string) =>
  page
    .getByRole('region', { name: text('timeline.label') })
    .getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')} `) });

/** The rendered slider-row labels and any that are clipped (inline boxes can't clip and are skipped). */
async function clippedLabels(page: Page): Promise<{ seen: string[]; clipped: string[] }> {
  return page.locator(LABELS).evaluateAll((els) => {
    const seen: string[] = [];
    const clipped: string[] = [];
    for (const el of els as HTMLElement[]) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.display === 'inline' || el.getClientRects().length === 0) continue;
      const name = (el.textContent ?? '').trim();
      seen.push(name);
      // scrollWidth and clientWidth are whole pixels, so a label clipped by less than a pixel (an ellipsis
      // after "Thời lượ") also compares its text's laid-out width with its box at sub-pixel precision.
      const range = document.createRange();
      range.selectNodeContents(el);
      const textWidth = range.getBoundingClientRect().width;
      const boxWidth = el.getBoundingClientRect().width;
      if (el.scrollWidth > el.clientWidth || textWidth > boxWidth + 0.01)
        clipped.push(
          `${name} (${el.className}: text ${textWidth} > box ${boxWidth}, scroll ${el.scrollWidth} > ${el.clientWidth})`,
        );
    }
    return { seen, clipped };
  });
}

async function expectNoClipping(page: Page, state: string, expectLabels: readonly string[]): Promise<void> {
  // Layout settles after the tab or sheet opens.
  await expect
    .poll(
      async () => {
        const { seen } = await clippedLabels(page);
        return expectLabels.every((l) => seen.includes(l));
      },
      { message: `${state}: labels shown` },
    )
    .toBe(true);
  const { clipped } = await clippedLabels(page);
  expect(clipped, state).toEqual([]);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`),
    state,
  ).toEqual([]);
}

const EDIT_VIDEO = [text('placement.scale'), text('speed.exact'), text('fades.in'), text('fades.out')];
const EDIT_PHOTO = [text('placement.scale'), text('photo.duration'), text('fades.in'), text('fades.out')];
const ADJUST = [
  text('adjust.brightness'),
  text('adjust.temperature'),
  text('adjust.saturation'),
  text('adjust.vibrance'),
  text('adjust.highlights'),
];
const SOUND = [text('sound.volume')];

test.describe('F-022.R6 NFR-07 slider-row labels are never clipped (vi-VN)', () => {
  for (const width of [1280, 800] as const) {
    test(`F-022.R6 no slider-row label is clipped in the docked inspector's Edit, Adjust and Sound tabs at ${width} px (vi-VN); axe passes`, async ({
      page,
    }) => {
      await setUp(page, width);
      const tabs = page
        .getByRole('complementary', { name: text('inspector.label') })
        .getByRole('tablist', { name: text('inspector.label') });
      await clipButton(page, 'V.mp4').click();
      await tabs.getByRole('tab', { name: text('inspector.edit') }).click();
      await expectNoClipping(page, `${width} video Edit`, EDIT_VIDEO);
      await tabs.getByRole('tab', { name: text('inspector.adjust') }).click();
      await expectNoClipping(page, `${width} video Adjust`, ADJUST);
      await tabs.getByRole('tab', { name: text('inspector.sound') }).click();
      await expectNoClipping(page, `${width} video Sound`, SOUND);
      await clipButton(page, 'P.png').click();
      await tabs.getByRole('tab', { name: text('inspector.edit') }).click();
      await expectNoClipping(page, `${width} photo Edit`, EDIT_PHOTO);
    });
  }

  test('F-022.R6 no slider-row label is clipped in the phone Edit, Adjust and Audio sheets at 320 px (vi-VN); axe passes', async ({
    page,
  }) => {
    await setUp(page, 320);
    const tab = (id: CopyId) => page.getByRole('tab', { name: text(id) });
    await clipButton(page, 'V.mp4').click();
    await tab('inspector.edit').click();
    await expectNoClipping(page, '320 video Edit sheet', EDIT_VIDEO);
    await tab('inspector.adjust').click();
    await expectNoClipping(page, '320 video Adjust sheet', ADJUST);
    await tab('tab.audio').click();
    await expectNoClipping(page, '320 video Audio sheet', SOUND);
    await page.keyboard.press('Escape');
    await clipButton(page, 'P.png').click();
    await tab('inspector.edit').click();
    await expectNoClipping(page, '320 photo Edit sheet', EDIT_PHOTO);
  });
});
