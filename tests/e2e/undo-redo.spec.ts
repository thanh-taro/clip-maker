// F-014 undo and redo through the real UI (CMP-Toolbar's Undo and Redo, the RULE-20 history keys) on the
// app harness (tests/harness/app.html), with real decoders, the timeline (F-003) and the preview (F-002).
// Edits whose controls are not built yet are made through the harness with the same MOD-Project
// operations and gesture API those features will use, and are marked below:
//   AC1 — the split (F-004), the look (F-008) and Add text with typing (F-010);
//   AC4 — the slider movement (F-007's adjustment sliders; F-005/F-006 sliders alike);
//   AC6 — the text layer typed in CMP-TextEditor (F-010).
// Undo and Redo themselves are always the toolbar buttons or the keys. Axe at 320 and 1280 px in en-US
// and vi-VN.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSetup, ClipSummary, ProjectSummary } from '../harness/app';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}
const VIDEO_BYTES = readFileSync(fileURLToPath(new URL('../fixtures/media/mp4-faststart.mp4', import.meta.url)));
/** A 2 s phone-style video (the F-001 fixture). */
const video = (name: string): Payload => ({ name, mimeType: 'video/mp4', buffer: VIDEO_BYTES });

interface Harness {
  appHarness: {
    project(): ProjectSummary;
    clips(): ClipSummary[];
    setClip(index: number, setup: ClipSetup): void;
    split(index: number, seconds: number): void;
    typeText(seconds: number, content: string): void;
    slide(index: number, values: number[]): void;
    state(): string;
    setPlayhead(seconds: number): void;
    preview(): { playhead: number; state: string; duration: number };
  };
}
const summary = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.project());
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const previewOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.preview());
const state = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.state());

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
}

const toolbar = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('toolbar', { name: text(lang, 'toolbar.label') });
const undoButton = (page: Page, lang: Language = 'en-US') =>
  toolbar(page, lang).getByRole('button', { name: text(lang, 'action.undo'), exact: true });
const redoButton = (page: Page, lang: Language = 'en-US') =>
  toolbar(page, lang).getByRole('button', { name: text(lang, 'action.redo'), exact: true });
const timeline = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('region', { name: text(lang, 'timeline.label') });
const timelineTool = (page: Page, id: CopyId) =>
  timeline(page)
    .getByRole('toolbar')
    .getByRole('button', { name: text('en-US', id) });
const clipButtons = (page: Page) => page.locator('.tk-timeline .tk-clip');
const unavailable = (page: Page, which: 'undo' | 'redo', lang: Language = 'en-US') =>
  expect(which === 'undo' ? undoButton(page, lang) : redoButton(page, lang)).toHaveAttribute('aria-disabled', 'true');
const available = (page: Page, which: 'undo' | 'redo', lang: Language = 'en-US') =>
  expect(which === 'undo' ? undoButton(page, lang) : redoButton(page, lang)).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
/** Mod (Cmd on macOS): Playwright's WebKit needs Meta spelled out (as in arrange-clips.spec.ts). */
const mod = (browserName: string) => (browserName === 'webkit' ? 'Meta' : 'ControlOrMeta');

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

test.describe('F-014 undo and redo (app harness)', () => {
  test('F-014.R1 CMP-Toolbar Undo and Redo are unavailable with nothing to undo or redo, and restore the timeline and preview', async ({
    page,
  }) => {
    await open(page);
    await unavailable(page, 'undo');
    await unavailable(page, 'redo');
    await add(page, [video('A.mp4'), video('B.mp4')]);
    await available(page, 'undo');
    await unavailable(page, 'redo');
    const transport = page.locator('.tk-transport');
    await expect(transport).toContainText('/ 0:04');
    // Undo the batch (one step, F-001.R6) from the keyboard on the button: the editor is empty again.
    await undoButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-state', 'empty');
    await expect(clipButtons(page)).toHaveCount(0);
    await unavailable(page, 'undo');
    await available(page, 'redo');
    // Focus stays on the now-unavailable Undo (aria-disabled keeps it focusable).
    await expect(undoButton(page)).toBeFocused();
    await redoButton(page).click();
    await expect(clipButtons(page)).toHaveCount(2);
    await expect(transport).toContainText('/ 0:04');
    await available(page, 'undo');
    await unavailable(page, 'redo');
    // Activating an unavailable control does nothing.
    await redoButton(page).click({ force: true });
    await expect(clipButtons(page)).toHaveCount(2);
  });

  test('F-014.AC1 undoing a split, a look change and a text added three times restores the project; redoing three times brings all back (split F-004, look F-008, text F-010 via the harness)', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await add(page, [video('A.mp4')]);
    const before = await state(page);
    await page.evaluate(() => (window as unknown as Harness).appHarness.split(0, 1));
    await expect(clipButtons(page)).toHaveCount(2);
    await page.evaluate(() => (window as unknown as Harness).appHarness.setClip(0, { look: 'film-warm' }));
    await page.evaluate(() => (window as unknown as Harness).appHarness.typeText(0, 'Hi'));
    const after = await state(page);
    expect((await summary(page)).texts).toEqual(['Hi']);
    // Undo three times: the toolbar button, then Mod+Z twice.
    await undoButton(page).click();
    expect((await summary(page)).texts).toEqual([]);
    await page.keyboard.press(`${mod(browserName)}+KeyZ`);
    expect((await clipsOf(page))[0]!.look).toBeNull();
    await page.keyboard.press(`${mod(browserName)}+KeyZ`);
    expect(await state(page)).toBe(before);
    await expect(clipButtons(page)).toHaveCount(1);
    // Redo three times: the toolbar button, Mod+Shift+Z and Ctrl+Y.
    await redoButton(page).click();
    await expect(clipButtons(page)).toHaveCount(2);
    await page.keyboard.press(`${mod(browserName)}+Shift+KeyZ`);
    await page.keyboard.press('Control+KeyY');
    expect(await state(page)).toBe(after);
    await unavailable(page, 'redo');
  });

  test('F-014.AC2 of 250 edits at least 200 are undone with Mod+Z', async ({ page, browserName }) => {
    await open(page);
    await add(page, [video('A.mp4')]);
    await page.evaluate(() => {
      for (let i = 1; i <= 250; i++) (window as unknown as Harness).appHarness.slide(0, [i % 100 || 100]);
    });
    const made = (await summary(page)).steps;
    expect(made).toBeGreaterThanOrEqual(200);
    for (let i = 0; i < 250; i++) await page.keyboard.press(`${mod(browserName)}+KeyZ`);
    const left = (await summary(page)).steps;
    expect(made - left).toBeGreaterThanOrEqual(200);
    expect(left).toBe(0);
    await unavailable(page, 'undo');
    await available(page, 'redo');
  });

  test('F-014.AC3 after an undo a new edit (Duplicate) makes Redo unavailable', async ({ page }) => {
    await open(page);
    await add(page, [video('A.mp4')]);
    await clipButtons(page).first().click();
    await timelineTool(page, 'action.duplicate').click();
    await expect(clipButtons(page)).toHaveCount(2);
    await undoButton(page).click();
    await expect(clipButtons(page)).toHaveCount(1);
    await available(page, 'redo');
    await clipButtons(page).first().click();
    await timelineTool(page, 'action.duplicate').click();
    await expect(clipButtons(page)).toHaveCount(2);
    await unavailable(page, 'redo');
  });

  test('F-014.AC4 a slider dragged through many values returns to before the drag in one undo (the slider is F-007; the movement via the harness)', async ({
    page,
  }) => {
    await open(page);
    await add(page, [video('A.mp4')]);
    const before = await state(page);
    const steps = (await summary(page)).steps;
    await page.evaluate(() =>
      (window as unknown as Harness).appHarness.slide(
        0,
        Array.from({ length: 60 }, (_, i) => i - 30),
      ),
    );
    expect((await summary(page)).steps).toBe(steps + 1);
    await undoButton(page).click();
    expect(await state(page)).toBe(before);
  });

  test('F-014.AC5 undoing a delete selects the restored clip; undoing the add of the last clip moves a later playhead to the end', async ({
    page,
  }) => {
    await open(page);
    await add(page, [video('A.mp4'), video('B.mp4')]);
    await clipButtons(page).nth(1).click();
    await timelineTool(page, 'action.delete').click();
    await expect(clipButtons(page)).toHaveCount(1);
    await expect(timeline(page).locator('.tk-clip[aria-pressed="true"]')).toHaveCount(0);
    await undoButton(page).click();
    await expect(clipButtons(page)).toHaveCount(2);
    await expect(clipButtons(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
    // Add a last clip (Duplicate B puts B′ at the end), put the playhead in it, undo the add.
    await timelineTool(page, 'action.duplicate').click();
    await expect(clipButtons(page)).toHaveCount(3);
    await page.evaluate(() => (window as unknown as Harness).appHarness.setPlayhead(5));
    await expect.poll(async () => (await previewOf(page)).playhead).toBe(5);
    await undoButton(page).click();
    await expect(clipButtons(page)).toHaveCount(2);
    const end = (await previewOf(page)).duration;
    expect(end).toBeGreaterThan(4);
    expect(end).toBeLessThan(5);
    await expect.poll(async () => (await previewOf(page)).playhead).toBe(end);
    // B′ no longer exists, so nothing is selected (RULE-13).
    await expect(timeline(page).locator('.tk-clip[aria-pressed="true"]')).toHaveCount(0);
  });

  test('F-014.AC6 a new text layer typed in and finished is gone after one undo (CMP-TextEditor is F-010; the session via the harness)', async ({
    page,
  }) => {
    await open(page);
    await add(page, [video('A.mp4')]);
    const before = await state(page);
    await page.evaluate(() => (window as unknown as Harness).appHarness.typeText(0.5, 'Hello'));
    expect((await summary(page)).texts).toEqual(['Hello']);
    await undoButton(page).click();
    expect((await summary(page)).texts).toEqual([]);
    expect(await state(page)).toBe(before);
  });

  test('F-014.R3 undo during playback: playback continues with the restored project', async ({ page }) => {
    await open(page);
    // A 10 s project (five 2 s clips), then a duplicate: playback is far from either end when Undo runs.
    await add(
      page,
      ['A', 'B', 'C', 'D', 'E'].map((n) => video(`${n}.mp4`)),
    );
    await clipButtons(page).first().click();
    await timelineTool(page, 'action.duplicate').click();
    await expect(clipButtons(page)).toHaveCount(6);
    await page
      .locator('.tk-transport')
      .getByRole('button', { name: text('en-US', 'action.play'), exact: true })
      .click();
    const editor = page.locator('[data-screen="SCR-Editor"]');
    await expect(editor).toHaveAttribute('data-state', 'playing');
    // Read the playback state just before and just after activating Undo, in one task, so a loaded
    // machine can't let playback reach the end in between.
    const r = await page.evaluate(() => {
      const h = (window as unknown as Harness).appHarness;
      const before = h.preview();
      document.querySelector<HTMLButtonElement>('.tk-toolbar [data-action="undo"]')!.click();
      return { before, after: h.preview(), clips: h.clips().length };
    });
    expect(r.before.state).toBe('playing');
    expect(r.clips).toBe(5);
    expect(r.after.state).toBe('playing');
    expect(r.after.duration).toBeLessThan(r.before.duration);
    expect(r.after.playhead).toBeLessThan(r.after.duration);
  });

  test('RULE-20 inside a text field Mod+Z is the field’s own undo; outside it the tool undoes', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await add(page, [video('A.mp4')]);
    // A text field inside the tool (the inspector's fields come with later features).
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('aria-label', 'probe');
      document.querySelector('[data-screen="SCR-Editor"]')!.append(input);
    });
    const field = page.getByRole('textbox', { name: 'probe' });
    await field.fill('abc');
    await field.focus();
    await page.keyboard.press(`${mod(browserName)}+KeyZ`);
    await page.keyboard.press(`${mod(browserName)}+Shift+KeyZ`);
    expect((await summary(page)).steps).toBe(1);
    await expect(clipButtons(page)).toHaveCount(1);
    await field.blur();
    await page.keyboard.press(`${mod(browserName)}+KeyZ`);
    await expect(clipButtons(page)).toHaveCount(0);
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-014.R1 NFR-06 Undo and Redo pass axe at 1280 px, available and unavailable (${lang})`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, lang);
      await unavailable(page, 'undo', lang);
      await axe(page);
      await add(page, [video('A.mp4')], lang);
      await undoButton(page, lang).click();
      await available(page, 'redo', lang);
      await axe(page);
    });

    test(`F-014.R1 NFR-06 the narrow top bar holds Undo and Redo at touch size, and passes axe at 320 px (${lang})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      await unavailable(page, 'undo', lang);
      await unavailable(page, 'redo', lang);
      await axe(page);
      await add(page, [video('A.mp4')], lang);
      for (const b of [undoButton(page, lang), redoButton(page, lang)]) {
        await expect(b).toBeVisible();
        const box = (await b.boundingBox())!;
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      }
      // D-038: More first, then Undo and Redo, then Export at the end.
      const more = (await toolbar(page, lang)
        .getByRole('button', { name: text(lang, 'action.more') })
        .boundingBox())!;
      const undo = (await undoButton(page, lang).boundingBox())!;
      const redo = (await redoButton(page, lang).boundingBox())!;
      expect(more.x).toBeLessThan(undo.x);
      expect(undo.x).toBeLessThan(redo.x);
      await undoButton(page, lang).click();
      await expect(clipButtons(page)).toHaveCount(0);
      await available(page, 'redo', lang);
      await axe(page);
      await redoButton(page, lang).click();
      await expect(clipButtons(page)).toHaveCount(1);
    });
  }
});
