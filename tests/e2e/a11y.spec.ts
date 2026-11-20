// QA accessibility fixes through the real UI on the app harness (tests/harness/app.html): RULE-20's scope for
// single-character keys (F-017.R6, owner decision QA-1), the polite announcements of edits, undo/redo, keyboard
// playback and rejected typed values (F-017.R7, F-017.R8), the phone transport's Go to start / Go to end and the
// time ruler as a slider (F-002.R4, F-002.R8, QA-2), the region names and heading, and axe plus no horizontal
// scrolling at landscape phone (667 × 375), 390, 768 and 1920 px in both themes (NFR-06, NFR-07).
// Screenshots are written only when A11Y_SHOTS names a folder (they are evidence, not baselines).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSummary } from '../harness/app';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;
/** A catalogue text with its placeholders filled (plain `{name}` replacement; no plurals here). */
const fill = (lang: Language, id: CopyId, params: Record<string, string | number>): string =>
  text(lang, id).replace(/\{(\w+)\}/g, (_, k: string) => String(params[k]));

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}
const VIDEO_BYTES = readFileSync(fileURLToPath(new URL('../fixtures/media/mp4-faststart.mp4', import.meta.url)));
const video = (name: string): Payload => ({ name, mimeType: 'video/mp4', buffer: VIDEO_BYTES });
/** A 1 × 1 photo: 3 s on the timeline (RULE-05). */
const photo = (name: string): Payload => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
});

interface Harness {
  appHarness: {
    clips(): ClipSummary[];
    setPlayhead(seconds: number): void;
    setClip(index: number, setup: { seconds?: number }): void;
    preview(): { playhead: number; state: string };
  };
}
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const preview = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.preview());
const at = (page: Page, seconds: number) =>
  page.evaluate((s) => (window as unknown as Harness).appHarness.setPlayhead(s), seconds);

async function open(page: Page, lang: Language = 'en-US'): Promise<void> {
  await page.goto(`${APP}?effects=fast&lang=${lang}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
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
const clip = (page: Page, name: string, lang: Language = 'en-US'): Locator =>
  timeline(page, lang)
    .getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')} \\d:\\d\\d$`) })
    .first();
const tool = (page: Page, id: CopyId, lang: Language = 'en-US') =>
  timeline(page, lang)
    .getByRole('toolbar', { name: text(lang, 'timeline.actions') })
    .getByRole('button', { name: text(lang, id) });
const status = (page: Page) => page.locator('.tk-preview-status');
/** The status region's text (a repeated message carries a trailing no-break space). */
const said = async (page: Page) => ((await status(page).textContent()) ?? '').replace(/\u00a0$/, '');
const ruler = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('slider', { name: text(lang, 'timeline.ruler') });
const modOf = (browserName: string) => (browserName === 'webkit' ? 'Meta' : 'ControlOrMeta');

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

async function noSideways(page: Page): Promise<void> {
  const over = await page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll<HTMLElement>('.tk-editor > *, .tk-transport, .tk-toolbar')]
      .filter((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().right > window.innerWidth + 1)
      .map((el) => el.className);
    return { page: doc.scrollWidth - doc.clientWidth, wide };
  });
  expect(over).toEqual({ page: 0, wide: [] });
}

async function shot(page: Page, name: string, browserName: string): Promise<void> {
  const dir = process.env['A11Y_SHOTS'];
  if (!dir || browserName !== 'chromium') return;
  await page.screenshot({ path: `${dir}/${name}.png` });
}

test.describe('QA accessibility: keys, announcements, phone seek (app harness)', () => {
  test('F-017.AC8 RULE-20 single-character keys do nothing off the preview, timeline and transport; S splits from the transport', async ({
    page,
  }) => {
    await open(page);
    await add(page, [photo('A.png'), photo('B.png')]);
    await at(page, 1);
    const track = page.locator('.tk-track');
    const width = async () => (await track.boundingBox())!.width;
    const fit = await width();
    // Off the shortcut area: the editor toolbar's Add media, then no control at all.
    const addMedia = page
      .getByRole('toolbar', { name: text('en-US', 'toolbar.label') })
      .getByRole('button', { name: text('en-US', 'action.add_media') });
    for (const focus of [
      () => addMedia.focus(),
      () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()),
    ]) {
      await focus();
      for (const key of ['KeyS', 'KeyT', 'Equal', 'Shift+Slash', 'KeyN']) await page.keyboard.press(key);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect(await clipsOf(page)).toHaveLength(2);
      await expect(page.locator('.tk-texteditor__field')).toHaveCount(0);
      await expect(page.getByRole('dialog', { name: text('en-US', 'help.title') })).toHaveCount(0);
      expect(await width()).toBeCloseTo(fit, 0);
    }
    // Mod keys keep their scope there: nothing to undo yet, but Space still plays from no focus.
    // On the transport (Next frame), S splits the clip under the playhead.
    await page.getByRole('button', { name: text('en-US', 'action.next_frame') }).focus();
    await page.keyboard.press('KeyS');
    await expect.poll(async () => (await clipsOf(page)).length).toBe(3);
    // On the timeline's ruler, = zooms in.
    await ruler(page).focus();
    await page.keyboard.press('Equal');
    await expect.poll(width).toBeGreaterThan(fit * 1.05);
  });

  test('F-017.AC9 F-017.AC10 split, duplicate, move and delete are announced; undo and redo name the step (en-US)', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await add(page, [photo('A.png'), photo('B.png'), photo('C.png')]);
    await clip(page, 'B.png').click();
    await at(page, 4);
    await tool(page, 'action.split').click();
    await expect.poll(() => said(page)).toBe(fill('en-US', 'announce.split', { time: '0:04' }));
    await tool(page, 'action.duplicate').click();
    await expect.poll(() => said(page)).toBe(fill('en-US', 'announce.duplicated', { name: 'B.png' }));
    await tool(page, 'action.move_left').click();
    await expect
      .poll(() => said(page))
      .toBe(fill('en-US', 'announce.moved_place', { name: 'B.png', place: 1, count: 5 }));
    await tool(page, 'action.delete').click();
    await expect.poll(() => said(page)).toBe(fill('en-US', 'announce.deleted', { name: 'B.png' }));
    // Undo from the keyboard (focus is on the timeline after the delete), redo from the toolbar.
    await page.keyboard.press(`${modOf(browserName)}+KeyZ`);
    await expect
      .poll(() => said(page))
      .toBe(fill('en-US', 'announce.undone', { action: text('en-US', 'action.delete') }));
    await page
      .getByRole('toolbar', { name: text('en-US', 'toolbar.label') })
      .getByRole('button', { name: text('en-US', 'action.redo'), exact: true })
      .click();
    await expect
      .poll(() => said(page))
      .toBe(fill('en-US', 'announce.redone', { action: text('en-US', 'action.delete') }));
    // The region is a polite status message.
    await expect(status(page)).toHaveAttribute('role', 'status');
  });

  test('F-017.AC9 the announcements follow the active language (vi-VN)', async ({ page }) => {
    await open(page, 'vi-VN');
    await add(page, [photo('A.png'), photo('B.png')], 'vi-VN');
    await at(page, 1);
    await tool(page, 'action.split', 'vi-VN').click();
    await expect.poll(() => said(page)).toBe(fill('vi-VN', 'announce.split', { time: '0:01' }));
    expect(await said(page)).toBe('Đã tách tại 0:01');
  });

  test('F-017.AC11 Space on a focused timeline item starts playback and announces it', async ({ page }) => {
    await open(page);
    await add(page, [photo('A.png'), photo('B.png')]);
    await clip(page, 'A.png').focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: text('en-US', 'action.pause'), exact: true })).toBeVisible();
    await expect.poll(() => said(page)).toBe(text('en-US', 'announce.playing'));
    await page.keyboard.press('Space');
  });

  test('F-017.AC12 a number field: unreadable text comes back marked invalid and announced; a value past the range is limited and announced', async ({
    page,
  }) => {
    await open(page);
    await add(page, [video('A.mp4')]);
    await clip(page, 'A.mp4').click();
    const inspector = page.getByRole('complementary', { name: text('en-US', 'inspector.label') });
    await inspector.getByRole('tab', { name: text('en-US', 'inspector.adjust') }).click();
    const field = inspector.locator('[data-control="adjust-brightness-field"]');
    await field.fill('abc');
    await field.press('Enter');
    await expect(field).toHaveValue('0');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect.poll(() => said(page)).toBe(fill('en-US', 'announce.kept', { value: '0' }));
    // The next edit clears the mark.
    await field.fill('500');
    await expect(field).not.toHaveAttribute('aria-invalid', 'true');
    await field.press('Enter');
    await expect(field).toHaveValue('+100');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect.poll(() => said(page)).toBe(fill('en-US', 'announce.limited', { value: '+100' }));
  });

  test('F-002.AC9 F-002.R4 on a phone, Go to start and Go to end are shown and move the playhead; the transport fits 320 px', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    await add(page, [photo('A.png'), photo('B.png')]);
    await at(page, 3);
    const end = page.getByRole('button', { name: text('en-US', 'action.go_end') });
    const start = page.getByRole('button', { name: text('en-US', 'action.go_start') });
    await expect(end).toBeVisible();
    await expect(start).toBeVisible();
    await end.click();
    await expect.poll(async () => (await preview(page)).playhead).toBeCloseTo(6, 1);
    await start.click();
    await expect.poll(async () => (await preview(page)).playhead).toBeCloseTo(0, 3);
    // Every transport control is a RULE-21 touch target and the row doesn't overflow.
    for (const b of await page.locator('.tk-transport button').all()) {
      const box = (await b.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    }
    expect(await page.locator('.tk-transport').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(
      0,
    );
    await noSideways(page);
    await shot(page, 'phone-transport-320', browserName);
  });

  test('F-002.AC10 F-002.R8 the time ruler is a slider: arrows 1 s, Page Up 10 s, End and Home; its value reads the time with the length', async ({
    page,
  }) => {
    await open(page);
    await add(page, [photo('P.png')]);
    await page.evaluate(() => (window as unknown as Harness).appHarness.setClip(0, { seconds: 20 }));
    await at(page, 2);
    const slider = ruler(page);
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await preview(page)).playhead).toBeCloseTo(3, 2);
    await expect(slider).toHaveAttribute('aria-valuetext', '0:03 / 0:20');
    await expect(slider).toHaveAttribute('aria-valuenow', '3');
    await expect(slider).toHaveAttribute('aria-valuemax', '20');
    await page.keyboard.press('PageUp');
    await expect.poll(async () => (await preview(page)).playhead).toBeCloseTo(13, 2);
    await expect(slider).toHaveAttribute('aria-valuetext', '0:13 / 0:20');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await preview(page)).playhead).toBeCloseTo(12, 2);
    await page.keyboard.press('End');
    await expect.poll(async () => (await preview(page)).playhead).toBeCloseTo(20, 2);
    await page.keyboard.press('Home');
    await expect.poll(async () => (await preview(page)).playhead).toBeCloseTo(0, 3);
    await expect(slider).toHaveAttribute('aria-valuetext', '0:00 / 0:20');
    // Space on the ruler still plays (a slider doesn't take it, RULE-20).
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: text('en-US', 'action.pause'), exact: true })).toBeVisible();
    await page.keyboard.press('Space');
  });

  test('CMP-Timeline SCR-Editor NFR-06 distinct toolbar names, one top heading with media, the main track shows focus', async ({
    page,
  }) => {
    await open(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(text('en-US', 'empty.title'));
    await add(page, [photo('A.png')]);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(text('en-US', 'app.name'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('toolbar', { name: text('en-US', 'timeline.actions') })).toHaveCount(1);
    await expect(page.getByRole('toolbar', { name: text('en-US', 'timeline.label'), exact: true })).toHaveCount(0);
    // Deleting the last clip from the keyboard leaves focus on the main track, with a visible ring.
    await clip(page, 'A.png').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Delete');
    const track = page.locator('.tk-track');
    await expect(track).toBeFocused();
    expect(await track.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  });

  test('CMP-MediaPanel the narrow media sheet makes the editor behind it inert; closing gives it back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const chooser = page.waitForEvent('filechooser');
    await page
      .locator('.tk-empty')
      .getByRole('button', { name: text('en-US', 'action.add_media') })
      .click();
    await (await chooser).setFiles([photo('A.png')]);
    await expect.poll(async () => (await clipsOf(page)).length, { timeout: 20_000 }).toBe(1);
    const sheet = page.locator('.tk-media[data-variant="sheet"]');
    await expect(sheet).toBeVisible();
    expect(await page.locator('.tk-timeline').evaluate((el) => (el as HTMLElement).inert)).toBe(true);
    expect(await page.locator('.tk-transport').evaluate((el) => (el as HTMLElement).inert)).toBe(true);
    // The status region and the notices stay live.
    expect(await status(page).evaluate((el) => el.closest('[inert]') === null)).toBe(true);
    await sheet.getByRole('button', { name: text('en-US', 'action.close') }).click();
    await expect(sheet).toHaveCount(0);
    expect(await page.locator('.tk-timeline').evaluate((el) => (el as HTMLElement).inert)).toBe(false);
    await expect(page.locator(':focus')).toHaveCount(1);
  });
});

/** NFR-07 sizes the earlier suites did not cover (QA a11y M4). */
const SIZES = [
  { name: 'landscape-667x375', width: 667, height: 375 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1920', width: 1920, height: 1080 },
] as const;

test.describe('NFR-06 NFR-07 layouts and themes (app harness)', () => {
  for (const size of SIZES)
    for (const scheme of ['light', 'dark'] as const)
      test(`NFR-06 NFR-07 editor states pass axe with no horizontal scrolling (${size.name}, ${scheme})`, async ({
        page,
        browserName,
      }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.emulateMedia({ colorScheme: scheme });
        await open(page);
        await axe(page);
        await noSideways(page);
        await add(page, [photo('A.png'), photo('B.png')]);
        await clip(page, 'A.png').click();
        await axe(page);
        await noSideways(page);
        // The preview keeps a usable height (a quarter of the window at least).
        const stage = (await page.locator('.tk-stage').boundingBox())!;
        expect(stage.height).toBeGreaterThanOrEqual(size.height * 0.25 - 1);
        await shot(page, `selected-${size.name}-${scheme}`, browserName);
        // Phones: the Edit sheet; wider: the inspector is already shown. Then the export panel.
        if (size.width < 700) {
          await page.locator('.tk-tabbar__tab').first().click();
          const sheet = page.locator('.tk-sheet').first();
          await expect(sheet).toBeVisible();
          await axe(page);
          await noSideways(page);
          // The sheet fits the window (its content scrolls inside it) and can be brought fully into view; the
          // preview keeps its height.
          await sheet.scrollIntoViewIfNeeded();
          const body = await sheet.evaluate((el) => {
            const scroller =
              [el, ...el.querySelectorAll<HTMLElement>('*')].find(
                (n) => /auto|scroll/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight,
              ) ?? null;
            const r = el.getBoundingClientRect();
            return {
              scrolls: scroller !== null || el.scrollHeight <= el.clientHeight,
              top: r.top,
              bottom: r.bottom,
            };
          });
          expect(body.scrolls).toBe(true);
          expect(body.top).toBeGreaterThanOrEqual(-1);
          expect(body.bottom).toBeLessThanOrEqual(size.height + 1);
          expect((await page.locator('.tk-stage').boundingBox())!.height).toBeGreaterThanOrEqual(
            size.height * 0.25 - 1,
          );
          await shot(page, `edit-sheet-${size.name}-${scheme}`, browserName);
          await page.locator('.tk-tabbar__tab').first().click();
        }
        await page
          .getByRole('toolbar', { name: text('en-US', 'toolbar.label') })
          .getByRole('button', { name: text('en-US', 'action.export') })
          .click();
        await expect(page.locator('.tk-export')).toBeVisible();
        await axe(page);
        await noSideways(page);
        await shot(page, `export-${size.name}-${scheme}`, browserName);
      });
});
