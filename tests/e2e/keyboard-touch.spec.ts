// F-017 control by keyboard and touch through the real UI (MOD-App + MOD-Keys + MOD-Timeline, real decoders) on the
// app harness (tests/harness/app.html): the RULE-20 keys in and out of scope, CMP-ShortcutHelp (? and
// COPY-action.shortcuts, wide dialog and narrow sheet, both languages), roving focus in the toolbars (build
// question 102) and the phone tab bar, a keyboard-only walkthrough (add media through the file input, arrange,
// trim, adjust, text, export), RULE-21's touch gestures and their equivalent controls on a phone, and axe at 320
// and 1280 px in en-US and vi-VN. Touch input is the DevTools protocol (Chromium only, as in F-003/F-013).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSummary, ProjectSummary } from '../harness/app';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const SHOTS = fileURLToPath(new URL('../../.build-my-app/reports/screens/F-017/', import.meta.url));
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
    project(): ProjectSummary;
    clips(): ClipSummary[];
    setPlayhead(seconds: number): void;
    setClip(index: number, setup: { seconds?: number }): void;
    typeText(seconds: number, content: string): void;
    state(): string;
    preview(): { playhead: number; state: string };
  };
}
const harness = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const clipsOf = harness;
const projectOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.project());
const order = async (page: Page) => (await clipsOf(page)).map((c) => c.source);
const preview = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.preview());
const at = (page: Page, seconds: number) =>
  page.evaluate((s) => (window as unknown as Harness).appHarness.setPlayhead(s), seconds);
const projectJson = async (page: Page) =>
  JSON.parse(await page.evaluate(() => (window as unknown as Harness).appHarness.state())) as {
    textLayers: { id: string; content: string; x: number; y: number; start: number; end: number }[];
    frame: { frameRate: number };
  };

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
const mainToolbar = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('toolbar', { name: text(lang, 'toolbar.label') });
const helpDialog = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('dialog', { name: text(lang, 'help.title') });
const modOf = (browserName: string) => (browserName === 'webkit' ? 'Meta' : 'ControlOrMeta');
const tabKey = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
const focused = (target: Locator) => target.evaluate((el) => el === document.activeElement);

/** Presses Tab (forward) until `target` has focus: keyboard-only navigation. */
async function tabTo(page: Page, target: Locator, browserName: string, max = 80): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await focused(target)) return;
    await page.keyboard.press(tabKey(browserName));
  }
  expect(await focused(target), 'Tab never reached the target').toBe(true);
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

/** RULE-20 as CMP-ShortcutHelp lists it (the board's rows, in order). */
const HELP_ROWS: readonly CopyId[] = [
  'help.play_pause',
  'help.frame_step',
  'help.go_ends',
  'action.undo',
  'action.redo',
  'action.add_media',
  'action.export',
  'action.split',
  'action.set_in',
  'action.set_out',
  'action.delete',
  'action.duplicate',
  'help.move',
  'help.mute',
  'action.add_text',
  'action.copy_look',
  'help.paste',
  'action.compare',
  'help.zoom',
  'action.zoom_fit',
  'help.snapping',
  'action.shortcuts',
  'help.esc',
  'help.finish_editing',
];
const HELP_GROUPS: readonly CopyId[] = [
  'help.group_playback',
  'help.group_history',
  'help.group_files',
  'help.group_edit',
  'help.group_view',
  'help.group_help',
];

test.describe('F-017 keyboard (app harness)', () => {
  test('F-017.AC1 with focus on the timeline, Space toggles playback, S splits the clip at the playhead and Mod+Z undoes the split', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await add(page, [photo('P.png')]);
    await at(page, 1);
    await timeline(page)
      .getByRole('group', { name: text('en-US', 'timeline.main_track') })
      .focus();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await preview(page)).state).toBe('playing');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await preview(page)).state).toBe('paused');
    await at(page, 1);
    await page.keyboard.press('KeyS');
    await expect.poll(async () => (await clipsOf(page)).length).toBe(2);
    expect((await clipsOf(page))[0]!.end).toBeCloseTo(1, 2);
    await page.keyboard.press(`${modOf(browserName)}+KeyZ`);
    await expect.poll(async () => (await clipsOf(page)).length).toBe(1);
    expect((await clipsOf(page))[0]!.end).toBeCloseTo(3, 2);
  });

  test('F-017.R1 RULE-20 Scope (build question 205) with focus on a timeline clip, Space plays and pauses and does not select it; Enter selects it', async ({
    page,
  }) => {
    await open(page);
    await add(page, [photo('P.png'), photo('Q.png')]);
    const item = clip(page, 'Q.png');
    await item.focus();
    await expect(item).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await preview(page)).state).toBe('playing');
    await expect(item).toBeFocused();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await preview(page)).state).toBe('paused');
    // Space never selected the clip (no click from the button's own Space).
    await expect(item).toHaveAttribute('aria-pressed', 'false');
    expect((await clipsOf(page)).map((c) => c.selected)).toEqual([false, false]);
    // Enter selects it, and playback stays paused.
    await page.keyboard.press('Enter');
    await expect(item).toHaveAttribute('aria-pressed', 'true');
    expect((await clipsOf(page)).map((c) => c.selected)).toEqual([false, true]);
    expect((await preview(page)).state).toBe('paused');
    // With the clip selected and focused, Space still plays and keeps the selection.
    await page.keyboard.press('Space');
    await expect.poll(async () => (await preview(page)).state).toBe('playing');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await preview(page)).state).toBe('paused');
    await expect(item).toHaveAttribute('aria-pressed', 'true');
  });

  test('CMP-MediaPanel (build question 208) Esc in the wide media drawer closes it and returns focus to Add media; an open dialog takes Esc first', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    const chooser = page.waitForEvent('filechooser');
    await page
      .locator('.tk-empty')
      .getByRole('button', { name: text('en-US', 'action.add_media') })
      .click();
    await (await chooser).setFiles([photo('P.png')]);
    await expect.poll(async () => (await clipsOf(page)).length, { timeout: 20_000 }).toBe(1);
    const drawer = page.locator('.tk-media');
    await expect(drawer).toHaveAttribute('data-variant', 'drawer');
    const row = drawer.getByRole('button', { name: text('en-US', 'media.place_again') }).first();
    await row.focus();
    // RULE-20 *Scope* (F-017.R6): ? does nothing in the drawer (not the preview, timeline or transport).
    await page.keyboard.press('Shift+Slash');
    await expect(helpDialog(page)).toHaveCount(0);
    // Layering: the shortcut list opened with the drawer open takes the first Esc; the drawer stays open.
    await mainToolbar(page)
      .getByRole('button', { name: text('en-US', 'action.shortcuts') })
      .click();
    await expect(helpDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(helpDialog(page)).toHaveCount(0);
    await expect(drawer).toBeVisible();
    // Esc with focus in the drawer closes it; focus returns to Add media.
    await row.focus();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(mainToolbar(page).getByRole('button', { name: text('en-US', 'action.add_media') })).toBeFocused();
    // The project is untouched (Esc is not an edit).
    expect((await clipsOf(page)).length).toBe(1);
  });

  test('F-017.AC2 while a text field is edited, S types an s and nothing splits; Mod+Enter finishes editing', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await add(page, [photo('P.png')]);
    await at(page, 1);
    await timeline(page)
      .getByRole('group', { name: text('en-US', 'timeline.main_track') })
      .focus();
    // T adds a text layer and opens CMP-TextEditor with its field focused (F-010).
    await page.keyboard.press('KeyT');
    const field = page.locator('.tk-texteditor__field');
    await expect(field).toBeFocused();
    await page.keyboard.type('ss');
    await page.keyboard.press('KeyS');
    await expect(field).toHaveValue(/sss$/);
    expect((await clipsOf(page)).length).toBe(1);
    await page.keyboard.press(`${modOf(browserName)}+Enter`);
    await expect(field).toHaveCount(0);
    expect((await projectOf(page)).texts.some((t) => t.endsWith('sss'))).toBe(true);
    expect((await clipsOf(page)).length).toBe(1);
  });

  test('F-017.AC6 F-017.R5 the focused Brightness slider takes Right and the playhead stays; a focused button takes Space and playback does not toggle', async ({
    page,
  }) => {
    await open(page);
    await add(page, [video('A.mp4')]);
    await clip(page, 'A.mp4').click();
    const inspector = page.getByRole('complementary', { name: text('en-US', 'inspector.label') });
    await inspector.getByRole('tab', { name: text('en-US', 'inspector.adjust') }).click();
    const brightness = inspector
      .getByRole('group', { name: text('en-US', 'adjust.brightness'), exact: true })
      .getByRole('slider');
    await at(page, 1);
    await brightness.focus();
    const before = Number(await brightness.inputValue());
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => Number(await brightness.inputValue())).toBeGreaterThan(before);
    expect((await preview(page)).playhead).toBeCloseTo(1, 3);
    expect((await clipsOf(page))[0]!.adjustments).toHaveProperty('brightness');
    // A focused button takes Space: Next frame steps (it activated) and playback stays paused.
    await page.getByRole('button', { name: text('en-US', 'action.next_frame') }).focus();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await preview(page)).playhead).toBeGreaterThan(1);
    expect((await preview(page)).state).toBe('paused');
  });

  test('F-017.AC7 with a video clip selected, Mod+V with a video file on the clipboard adds it as media; with no file it pastes the copied adjustments', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await add(page, [video('A.mp4'), video('B.mp4')]);
    // Copy A's colour with Mod+C (A selected, focus on it): first give A an adjustment through its slider.
    await clip(page, 'A.mp4').click();
    const inspector = page.getByRole('complementary', { name: text('en-US', 'inspector.label') });
    await inspector.getByRole('tab', { name: text('en-US', 'inspector.adjust') }).click();
    const brightness = inspector
      .getByRole('group', { name: text('en-US', 'adjust.brightness'), exact: true })
      .getByRole('slider');
    await brightness.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await clipsOf(page))[0]!.adjustments.brightness ?? 0).toBeGreaterThan(0);
    const copied = (await clipsOf(page))[0]!.adjustments;
    await clip(page, 'A.mp4').focus();
    await page.keyboard.press(`${modOf(browserName)}+KeyC`);
    // B selected; the clipboard holds a video file: Mod+V adds it (the browser's paste event carries it).
    await clip(page, 'B.mp4').click();
    await page.evaluate(
      (bytes) => {
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
        data.items.add(new File([new Uint8Array(bytes)], 'C.mp4', { type: 'video/mp4' }));
        const e = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(e, 'clipboardData', { value: data });
        target.dispatchEvent(e);
      },
      [...VIDEO_BYTES],
    );
    await expect.poll(async () => (await clipsOf(page)).length, { timeout: 20_000 }).toBe(3);
    await page.waitForTimeout(100);
    expect((await clipsOf(page))[1]!.adjustments).toEqual({});
    for (const close of await page.locator('.tk-notice__close').all()) await close.click();
    // No file on the clipboard: Mod+V pastes the copied adjustments onto B (still selected).
    expect((await clipsOf(page))[1]!.selected).toBe(true);
    await clip(page, 'B.mp4').focus();
    await page.keyboard.press(`${modOf(browserName)}+KeyV`);
    await expect.poll(async () => (await clipsOf(page))[1]!.adjustments).toEqual(copied);
  });

  test('F-017.R1 RULE-20 View keys: = and - zoom the timeline, Shift+Z fits it, N toggles snapping; none acts in the empty state', async ({
    page,
  }) => {
    await open(page);
    const snap = timeline(page)
      .getByRole('toolbar')
      .first()
      .getByRole('button', { name: text('en-US', 'action.snapping') });
    await page.locator('body').focus();
    // Empty state: a single N leaves Snapping as it was (unavailable), after the key has been handled.
    expect(await snap.getAttribute('aria-pressed')).toBe('true');
    await page.keyboard.press('KeyN');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await snap.getAttribute('aria-pressed')).toBe('true');
    await add(page, [photo('P.png')]);
    // 60 s, so the fitted view can zoom in (RULE-14's range).
    await page.evaluate(() => (window as unknown as Harness).appHarness.setClip(0, { seconds: 60 }));
    await page.locator('.tk-preview-area').click({ position: { x: 5, y: 5 } });
    const track = page.locator('.tk-track');
    const width = async () => (await track.boundingBox())!.width;
    const fit = await width();
    await page.keyboard.press('Equal');
    await expect.poll(width).toBeGreaterThan(fit * 1.2);
    const zoomed = await width();
    await page.keyboard.press('Minus');
    await expect.poll(width).toBeLessThan(zoomed);
    await page.keyboard.press('Equal');
    await page.keyboard.press('Equal');
    await page.keyboard.press('Shift+KeyZ');
    await expect.poll(width).toBeCloseTo(fit, 0);
    await page.keyboard.press('KeyN');
    await expect(snap).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('KeyN');
    await expect(snap).toHaveAttribute('aria-pressed', 'true');
  });

  test('F-017.R1 RULE-20 Files keys: Mod+O opens the file picker with the media panel, Mod+E opens export only with a clip', async ({
    page,
    browserName,
  }) => {
    await open(page);
    const mod = modOf(browserName);
    await page.locator('body').focus();
    // Empty: Mod+E does nothing (Export is unavailable).
    await page.keyboard.press(`${mod}+KeyE`);
    await expect(page.locator('[data-panel="export"]')).toHaveCount(0);
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press(`${mod}+KeyO`);
    await (await chooser).setFiles([photo('P.png')]);
    await expect.poll(async () => (await clipsOf(page)).length, { timeout: 20_000 }).toBe(1);
    await expect(page.locator('.tk-media')).toBeVisible();
    await page
      .locator('.tk-media')
      .getByRole('button', { name: text('en-US', 'action.close') })
      .click();
    await expect(page.locator('.tk-media')).toHaveCount(0);
    await page.locator('.tk-preview-area').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press(`${mod}+KeyE`);
    await expect(page.getByRole('dialog', { name: text('en-US', 'export.title') })).toBeVisible();
  });

  test('F-017.R1 RULE-20 Scope: no shortcut acts while CMP-ShortcutHelp is open (only Esc), nor in a number field', async ({
    page,
  }) => {
    await open(page);
    await add(page, [photo('P.png')]);
    await page.locator('.tk-preview-area').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Shift+Slash');
    await expect(helpDialog(page)).toBeVisible();
    await page.keyboard.press('KeyT');
    await page.keyboard.press('KeyS');
    await page.keyboard.press('Space');
    expect((await projectOf(page)).texts).toEqual([]);
    expect((await clipsOf(page)).length).toBe(1);
    expect((await preview(page)).state).toBe('paused');
    await page.keyboard.press('Escape');
    await expect(helpDialog(page)).toHaveCount(0);
  });
});

test.describe('F-017 keyboard review checks (app harness)', () => {
  test('F-017.AC2 =, - and ? typed in the text editor and in a number field type the character; no zoom, no help', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    await add(page, [video('A.mp4')]);
    const track = page.locator('.tk-track');
    const width = (await track.boundingBox())!.width;
    // A number field: the Brightness field of the Adjust tab.
    await clip(page, 'A.mp4').click();
    const inspector = page.getByRole('complementary', { name: text('en-US', 'inspector.label') });
    await inspector.getByRole('tab', { name: text('en-US', 'inspector.adjust') }).click();
    const field = inspector
      .getByRole('group', { name: text('en-US', 'adjust.brightness'), exact: true })
      .getByRole('spinbutton');
    await field.click();
    await field.selectText();
    await page.keyboard.type('-=?');
    await expect(field).toHaveValue('-=?');
    await page.keyboard.press('Escape');
    // The text editor.
    await timeline(page)
      .getByRole('group', { name: text('en-US', 'timeline.main_track') })
      .focus();
    await page.keyboard.press('KeyT');
    const editor = page.locator('.tk-texteditor__field');
    await expect(editor).toBeFocused();
    await page.keyboard.type('a=b-c?');
    await expect(editor).toHaveValue(/a=b-c\?$/);
    await expect(helpDialog(page)).toHaveCount(0);
    expect((await track.boundingBox())!.width).toBeCloseTo(width, 0);
  });

  test('F-017.R1 RULE-20 Alt+Left on a focused toolbar button moves the selected clip earlier (not the toolbar, not browser Back)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    await add(page, [photo('A.png'), photo('B.png')]);
    await clip(page, 'B.png').click();
    const url = page.url();
    const split = timeline(page)
      .getByRole('toolbar')
      .first()
      .getByRole('button', { name: text('en-US', 'action.split'), exact: true });
    await split.focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect.poll(() => order(page)).toEqual(['B.png', 'A.png']);
    await expect(split).toBeFocused();
    expect(page.url()).toBe(url);
  });

  test('F-017.R3 ? pressed the moment the preview goes full screen opens the list with focus on Close (the list is never made inert)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    await add(page, [photo('P.png')]);
    // The race behind a Chromium flake: ? arriving after the full-screen bar renders but before the preview's
    // full-screen effect runs. Here ? is sent as soon as the bar appears (a mutation callback, ahead of any
    // effect), so the list is open when that effect makes the rest of the editor inert.
    await page.evaluate(() => {
      const shell = document.querySelector('[data-screen="SCR-Editor"]')!;
      const sendHelp = new MutationObserver(() => {
        if (!document.querySelector('.tk-fullscreen-bar')) return;
        sendHelp.disconnect();
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: '?', code: 'Slash', shiftKey: true, bubbles: true }),
        );
      });
      sendHelp.observe(shell, { childList: true, subtree: true });
      document.querySelector<HTMLButtonElement>('[aria-label="Full screen"]')!.click();
    });
    await expect(page.locator('.tk-fullscreen-bar')).toBeVisible();
    const dialog = helpDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveJSProperty('inert', false);
    await expect(dialog.getByRole('button', { name: text('en-US', 'action.close') })).toBeFocused();
  });

  test('F-017.R3 with the preview maximised, ? opens the list and Tab / Shift+Tab move between its controls', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    await add(page, [photo('P.png')]);
    await page.getByRole('button', { name: text('en-US', 'action.full_screen') }).click();
    await expect(page.locator('.tk-fullscreen-bar')).toBeVisible();
    await page.keyboard.press('Shift+Slash');
    const dialog = helpDialog(page);
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole('button', { name: text('en-US', 'action.close') });
    const list = dialog.getByRole('region', { name: text('en-US', 'help.title') });
    await expect(close).toBeFocused();
    await page.keyboard.press(tabKey(browserName));
    await expect(list).toBeFocused();
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab');
    await expect(close).toBeFocused();
    // In the browser's real full screen (WebKit here) the browser takes the first Esc to leave it; the next
    // Esc reaches the list. Maximised in the page (Chromium here), one Esc closes the list.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    if ((await dialog.count()) > 0) await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('CMP-ShortcutHelp narrow: a press beside the grab handle stays inside the sheet; a press on the scrim closes it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    // RULE-20 *Scope* (F-017.R6): ? acts with focus on the preview.
    await page.locator('.tk-preview-area').focus();
    await page.keyboard.press('Shift+Slash');
    const dialog = helpDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.evaluate((el) => Promise.all(el.getAnimations().map((x) => x.finished)));
    const box = (await dialog.boundingBox())!;
    await page.mouse.click(box.x + 20, box.y + 4);
    await page.mouse.click(box.x + box.width - 20, box.y + 4);
    await expect(dialog).toBeVisible();
    await page.mouse.click(box.x + 20, box.y - 40);
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('F-017 CMP-ShortcutHelp (app harness)', () => {
  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-017.AC4 F-017.R3 ? and COPY-action.shortcuts open CMP-ShortcutHelp listing RULE-20 in the active language; Esc and close return focus (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, lang);
      await add(page, [photo('P.png')], lang);
      // ? from anywhere in the tool (no field edited).
      await page.locator('.tk-preview-area').click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('Shift+Slash');
      const dialog = helpDialog(page, lang);
      await expect(dialog).toBeVisible();
      const close = dialog.getByRole('button', { name: text(lang, 'action.close') });
      await expect(close).toBeFocused();
      await expect(dialog.getByRole('heading', { level: 3 })).toHaveText(HELP_GROUPS.map((id) => text(lang, id)));
      await expect(dialog.locator('dt')).toHaveText(HELP_ROWS.map((id) => text(lang, id)));
      await expect(dialog.getByText(text(lang, 'help.scope'))).toBeVisible();
      // Mod follows the platform: the Command key on mac, Ctrl elsewhere; key names stay as on the keyboard.
      const mac = await page.evaluate(() => /mac/i.test(navigator.platform));
      const undo = dialog.locator(`[data-row="action.undo"] kbd`);
      await expect(undo).toHaveText(mac ? ['⌘Command', 'Z'] : ['Ctrl', 'Z']);
      await expect(dialog.locator(`[data-row="action.redo"] kbd`)).toHaveText(
        mac ? ['⌘Command', 'Shift', 'Z', 'Ctrl', 'Y'] : ['Ctrl', 'Shift', 'Z', 'Ctrl', 'Y'],
      );
      await axe(page);
      await shot(page, `help-wide-${lang}`, browserName);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      // The toolbar's Keyboard shortcuts opens it too; close returns focus to it.
      const button = mainToolbar(page, lang).getByRole('button', { name: text(lang, 'action.shortcuts') });
      await expect(button).not.toHaveAttribute('aria-disabled', 'true');
      await button.click();
      await expect(dialog).toBeVisible();
      await close.click();
      await expect(dialog).toHaveCount(0);
      await expect(button).toBeFocused();
    });

    test(`F-017.AC4 F-017.R3 on a phone, More → Keyboard shortcuts opens the list as a bottom sheet; close returns focus to More; axe passes at 320 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      const more = mainToolbar(page, lang).getByRole('button', { name: text(lang, 'action.more') });
      await more.click();
      const item = page.getByRole('menuitem', { name: text(lang, 'action.shortcuts') });
      await expect(item).not.toHaveAttribute('aria-disabled', 'true');
      await item.click();
      const dialog = helpDialog(page, lang);
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('menu')).toHaveCount(0);
      // A bottom sheet: full width, at the bottom, at most the D-038 sheet height (60 % under 640 px tall).
      // Measured once its rise has finished (reduced motion is not set here).
      await dialog.evaluate((el) => Promise.all(el.getAnimations().map((x) => x.finished)));
      const box = (await dialog.boundingBox())!;
      expect(box.width).toBeCloseTo(320, 0);
      expect(box.y + box.height).toBeCloseTo(640, 0);
      expect(box.height).toBeLessThanOrEqual(640 * 0.6 + 1);
      const close = dialog.getByRole('button', { name: text(lang, 'action.close') });
      await expect(close).toBeFocused();
      const c = (await close.boundingBox())!;
      expect(Math.min(c.width, c.height)).toBeGreaterThanOrEqual(44);
      // The list scrolls inside the sheet, under its header; the scope note comes last.
      expect(await dialog.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      await dialog.evaluate((el) => (el.scrollTop = el.scrollHeight));
      await expect(dialog.getByText(text(lang, 'help.scope'))).toBeInViewport();
      await expect(close).toBeInViewport();
      await dialog.evaluate((el) => (el.scrollTop = 0));
      await axe(page);
      await shot(page, `help-narrow-${lang}`, browserName);
      await close.click();
      await expect(dialog).toHaveCount(0);
      await expect(more).toBeFocused();
    });
  }
});

test.describe('F-017 roving focus (app harness)', () => {
  test('F-017.R5 CMP-Toolbar is one Tab stop and Left/Right move between its buttons (wrapping) without moving the playhead', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    await add(page, [photo('P.png')]);
    await at(page, 1);
    const bar = mainToolbar(page);
    const named = (id: CopyId) => bar.getByRole('button', { name: text('en-US', id), exact: true });
    await named('action.add_media').focus();
    await page.keyboard.press('ArrowRight');
    await expect(named('action.music')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(named('action.add_text')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(named('action.add_media')).toBeFocused();
    // Wraps to the last button (Export, available with a clip).
    await page.keyboard.press('ArrowLeft');
    await expect(named('action.export')).toBeFocused();
    expect((await preview(page)).playhead).toBeCloseTo(1, 3);
    // One Tab stop: Tab leaves the toolbar; Shift+Tab comes back to the button last used.
    await page.keyboard.press(tabKey(browserName));
    expect(await bar.evaluate((el) => el.contains(document.activeElement))).toBe(false);
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab');
    await expect(named('action.export')).toBeFocused();
    expect(await bar.locator('button[tabindex="0"]').count()).toBe(1);
    await shot(page, 'toolbar-roving', browserName);
  });

  test('F-017.R5 CMP-Timeline the action toolbar moves with Left/Right; the phone tab bar moves with Left/Right/Home/End and opens with Enter', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    await add(page, [photo('P.png'), photo('Q.png')]);
    const bar = timeline(page).getByRole('toolbar').first();
    const named = (id: CopyId) => bar.getByRole('button', { name: text('en-US', id), exact: true });
    await named('action.split').focus();
    await page.keyboard.press('ArrowRight');
    await expect(named('action.set_in')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(named('action.zoom_fit')).toBeFocused();
    expect(await bar.locator('button[tabindex="0"]').count()).toBe(1);
    // Phone: the tab bar.
    await page.setViewportSize({ width: 390, height: 844 });
    const tablist = page.locator('.tk-tabbar [role="tablist"]');
    const tab = (id: CopyId) => tablist.getByRole('tab', { name: text('en-US', id) });
    await tab('inspector.edit').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab('tab.audio')).toBeFocused();
    await page.keyboard.press('End');
    await expect(tab('inspector.adjust')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tab('inspector.edit')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(tab('inspector.edit')).toBeFocused();
    // Moving opens nothing; Enter opens the focused tab's sheet.
    await expect(page.getByRole('tabpanel')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(tab('tab.audio')).toHaveAttribute('aria-selected', 'true');
    expect(await tablist.locator('[tabindex="0"]').count()).toBe(1);
    // Space opens a tab's sheet too (a focused tab keeps Space; playback does not toggle).
    await tab('tab.audio').click();
    await expect(tab('tab.audio')).toHaveAttribute('aria-selected', 'false');
    await tab('inspector.text').focus();
    await page.keyboard.press('Space');
    await expect(tab('inspector.text')).toHaveAttribute('aria-selected', 'true');
    expect((await preview(page)).state).toBe('paused');
    // Alt+Right on a focused tab is not the tab list's: it reaches RULE-20 (no tab moves, no browser Back).
    const url = page.url();
    await tab('inspector.text').focus();
    await page.keyboard.press('Alt+ArrowRight');
    await expect(tab('inspector.text')).toBeFocused();
    expect(page.url()).toBe(url);
    await shot(page, 'tabbar-audio-sheet', browserName);
  });
});

test.describe('F-017 keyboard-only walkthrough (app harness)', () => {
  test('F-017.R1 NFR-06 keyboard only: add media through the file input, arrange, trim, adjust, add text and export', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    const mod = modOf(browserName);
    // Add media: Mod+O opens the file input (and the media panel); Esc closes the panel.
    await page.locator('body').focus();
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press(`${mod}+KeyO`);
    await (await chooser).setFiles([video('A.mp4'), photo('B.png')]);
    await expect.poll(() => order(page), { timeout: 20_000 }).toEqual(['A.mp4', 'B.png']);
    // The wide media drawer is not modal: Tab to its Close and press Enter.
    await tabTo(
      page,
      page.locator('.tk-media').getByRole('button', { name: text('en-US', 'action.close') }),
      browserName,
    );
    await page.keyboard.press('Enter');
    await expect(page.locator('.tk-media')).toHaveCount(0);
    // Arrange: Tab to A on the timeline, select it with Enter, Alt+Right moves it after B.
    await tabTo(page, clip(page, 'A.mp4'), browserName);
    await page.keyboard.press('Enter');
    await expect(clip(page, 'A.mp4')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Alt+ArrowRight');
    await expect.poll(() => order(page)).toEqual(['B.png', 'A.mp4']);
    // Trim: End, then Shift+Left (1 s back) puts the playhead inside A (3–5 s); I starts A here.
    await clip(page, 'A.mp4').focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+ArrowLeft');
    const a = (await clipsOf(page))[1]!;
    const here = (await preview(page)).playhead;
    expect(here).toBeGreaterThan(a.start);
    expect(here).toBeLessThan(a.end);
    await page.keyboard.press('KeyI');
    // A now starts at the playhead: shorter by what was before it (later clips none; it ends where it ended).
    await expect
      .poll(async () => (await clipsOf(page))[1]!.end - (await clipsOf(page))[1]!.start)
      .toBeCloseTo(a.end - here, 1);
    // Adjust: Tab to the inspector's clip tabs, Right selects Adjust, Tab to Brightness, Right raises it.
    const inspector = page.getByRole('complementary', { name: text('en-US', 'inspector.label') });
    const tabs = inspector.getByRole('tablist', { name: text('en-US', 'inspector.label') });
    await tabTo(page, tabs.getByRole('tab', { selected: true }), browserName);
    while (
      (await tabs.getByRole('tab', { selected: true }).textContent())?.trim() !== text('en-US', 'inspector.adjust')
    )
      await page.keyboard.press('ArrowRight');
    const brightness = inspector
      .getByRole('group', { name: text('en-US', 'adjust.brightness'), exact: true })
      .getByRole('slider');
    await tabTo(page, brightness, browserName);
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await clipsOf(page))[1]!.adjustments.brightness ?? 0).toBeGreaterThan(0);
    // RULE-20 *Scope* (F-017.R6): T does nothing on the inspector's slider; back on the timeline (the
    // clip) it adds a layer at the playhead and opens the editor; type, then Mod+Enter finishes.
    await page.keyboard.press('KeyT');
    await expect(page.locator('.tk-texteditor__field')).toHaveCount(0);
    await clip(page, 'A.mp4').focus();
    await page.keyboard.press('KeyT');
    await expect(page.locator('.tk-texteditor__field')).toBeFocused();
    // Focus stays in the editor after the next frame (F-017 audit).
    await page.waitForTimeout(300);
    await expect(page.locator('.tk-texteditor__field')).toBeFocused();
    await page.keyboard.type('Hello');
    await page.keyboard.press(`${mod}+Enter`);
    await expect.poll(async () => (await projectOf(page)).texts).toEqual(['Hello']);
    // Export: Mod+E opens the panel; Tab to its Export and Enter starts it; Tab to Cancel and Enter stops it.
    await page.keyboard.press(`${mod}+KeyE`);
    const panel = page.getByRole('dialog', { name: text('en-US', 'export.title') });
    await expect(panel).toBeVisible();
    await shot(page, 'walkthrough-export-panel', browserName);
    const start = panel.getByRole('button', { name: text('en-US', 'action.export'), exact: true });
    // The panel's Export is unavailable until its estimate is ready; then Tab reaches it from the panel.
    await expect(start).toBeEnabled({ timeout: 20_000 });
    // Mod+E put focus on the panel's selected kind (CMP-ExportPanel).
    await expect(panel.getByRole('tab', { selected: true })).toBeFocused();
    await tabTo(page, start, browserName, 40);
    await page.keyboard.press('Enter');
    const progress = page.locator('dialog.tk-run');
    const cancel = page.getByRole('button', { name: text('en-US', 'action.cancel'), exact: true });
    await expect(cancel).toBeVisible({ timeout: 20_000 });
    expect(await progress.count()).toBeGreaterThan(0);
    await tabTo(page, cancel, browserName, 10);
    await page.keyboard.press('Enter');
    await expect(cancel).toHaveCount(0, { timeout: 20_000 });
    expect(await order(page)).toEqual(['B.png', 'A.mp4']);
  });
});

test.describe('F-017 touch on a phone (app harness)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  type TouchPoint = { x: number; y: number; id: number };
  async function touch(page: Page) {
    const cdp = await page.context().newCDPSession(page);
    return (type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: TouchPoint[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }

  test('F-017.AC3 RULE-21 on a phone, a 0.4 s hold then drag moves a clip; a quick swipe scrolls the timeline and scrubs instead', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP touch input');
    await open(page);
    await add(page, [photo('A.png'), photo('B.png')]);
    await at(page, 1);
    const send = await touch(page);
    const a = (await clip(page, 'A.png').boundingBox())!;
    const y = a.y + a.height / 2;
    const x = a.x + Math.min(a.width / 2, 40);
    // A quick swipe left on A: the timeline scrolls under the centred playhead (it scrubs), and nothing moves.
    const before = (await preview(page)).playhead;
    await send('touchStart', [{ x, y, id: 1 }]);
    for (let i = 1; i <= 8; i++) await send('touchMove', [{ x: x - 8 * i, y, id: 1 }]);
    await page.waitForTimeout(250);
    await send('touchEnd', []);
    await expect.poll(async () => (await preview(page)).playhead).toBeGreaterThan(before + 0.1);
    expect(await order(page)).toEqual(['A.png', 'B.png']);
    // Hold 0.4 s on B, then drag it left past A: B moves first.
    const b = (await clip(page, 'B.png').boundingBox())!;
    const a2 = (await clip(page, 'A.png').boundingBox())!;
    const bx = b.x + Math.min(b.width / 2, 30);
    const by = b.y + b.height / 2;
    await send('touchStart', [{ x: bx, y: by, id: 1 }]);
    await page.waitForTimeout(500);
    for (let i = 1; i <= 10; i++) await send('touchMove', [{ x: bx + ((a2.x + 4 - bx) * i) / 10, y: by, id: 1 }]);
    await page.waitForTimeout(50);
    await send('touchEnd', []);
    await expect.poll(() => order(page)).toEqual(['B.png', 'A.png']);
    await shot(page, 'touch-moved', browserName);
  });

  test('F-017.AC5 F-017.R4 RULE-21 each gesture’s visible control gives the same result on a phone: zoom, move, time, start/end here, placement, text position, frame step and play', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000);
    await open(page);
    await add(page, [photo('A.png'), photo('B.png')]);
    // pinch zoom → zoom controls (the pill): Zoom in widens the timeline as a pinch out does (F-013.AC4).
    const track = page.locator('.tk-track');
    const width = (await track.boundingBox())!.width;
    await timeline(page)
      .getByRole('button', { name: text('en-US', 'action.zoom_in'), exact: true })
      .click();
    await expect.poll(async () => (await track.boundingBox())!.width).toBeGreaterThan(width * 1.2);
    await timeline(page)
      .getByRole('button', { name: text('en-US', 'action.zoom_fit'), exact: true })
      .click();
    // hold-and-drag (clip) → Move later in the Edit sheet: the same new order as dragging A after B.
    await clip(page, 'A.png').click();
    await page.getByRole('tab', { name: text('en-US', 'inspector.edit') }).click();
    const sheet = page.getByRole('tabpanel', { name: text('en-US', 'inspector.edit') });
    await sheet.getByRole('button', { name: text('en-US', 'action.move_right'), exact: true }).click();
    await expect.poll(() => order(page)).toEqual(['B.png', 'A.png']);
    // trim drag → Start here: A (3–6 s) starts at the playhead, as dragging its start handle there does.
    await at(page, 4);
    await sheet.getByRole('button', { name: text('en-US', 'action.set_in'), exact: true }).click();
    await expect.poll(async () => (await clipsOf(page))[1]!.start).toBeCloseTo(3, 2);
    await expect.poll(async () => (await clipsOf(page))[1]!.end).toBeCloseTo(5, 2);
    await at(page, 4);
    await sheet.getByRole('button', { name: text('en-US', 'action.set_out'), exact: true }).click();
    await expect.poll(async () => (await clipsOf(page))[1]!.end).toBeCloseTo(4, 2);
    // preview drag → placement controls: a nudge moves the clip's placement as a drag does.
    await at(page, 3.5);
    const placement = (await clipsOf(page))[1]!.placement;
    await sheet.getByRole('button', { name: text('en-US', 'placement.nudge_right'), exact: true }).click();
    await expect
      .poll(async () => JSON.stringify((await clipsOf(page))[1]!.placement))
      .not.toBe(JSON.stringify(placement));
    // scrub → frame step and play.
    await at(page, 1);
    await page.getByRole('button', { name: text('en-US', 'action.next_frame') }).click();
    await expect.poll(async () => (await preview(page)).playhead).toBeCloseTo(1 + 1 / 30, 2);
    await page.getByRole('button', { name: text('en-US', 'action.prev_frame') }).click();
    await expect.poll(async () => (await preview(page)).playhead).toBeCloseTo(1, 2);
    await page.getByRole('button', { name: text('en-US', 'action.play') }).click();
    await expect.poll(async () => (await preview(page)).state).toBe('playing');
    await page.getByRole('button', { name: text('en-US', 'action.pause') }).click();
    await expect.poll(async () => (await preview(page)).state).toBe('paused');
    // Text layer: hold-and-drag → Earlier/Later (one frame); preview drag → the text position nudges.
    await page.evaluate(() => (window as unknown as Harness).appHarness.typeText(1, 'Hi'));
    // Close the Edit sheet (its tab again) so the text lane shows; tap the text item; open the Text sheet.
    await page.getByRole('tab', { name: text('en-US', 'inspector.edit') }).click();
    await expect(sheet).toHaveCount(0);
    await timeline(page).locator('.tk-tclip').first().click();
    await page.getByRole('tab', { name: text('en-US', 'inspector.text') }).click();
    const textSheet = page.getByRole('tabpanel', { name: text('en-US', 'inspector.text') });
    await expect(textSheet).toBeVisible();
    const layer = async () => (await projectJson(page)).textLayers[0]!;
    const t0 = await layer();
    await textSheet.getByRole('button', { name: text('en-US', 'action.time_later') }).click();
    await expect.poll(async () => (await layer()).start).toBeGreaterThan(t0.start);
    await textSheet.getByRole('button', { name: text('en-US', 'placement.nudge_right'), exact: true }).click();
    await expect.poll(async () => (await layer()).x).not.toBe(t0.x);
    // Every one of these controls is a RULE-21 touch target.
    const small: string[] = [];
    for (const b of await textSheet.getByRole('button').all()) {
      if (!(await b.isVisible())) continue;
      const box = (await b.boundingBox())!;
      if (Math.min(box.width, box.height) < 44)
        small.push(
          `${await b.evaluate((el) => `${el.getAttribute('class') ?? ''} ${el.textContent ?? ''}`)} ${box.width}x${box.height}`,
        );
    }
    expect(small).toEqual([]);
    await shot(page, 'touch-text-sheet', browserName);
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-017 NFR-06 RULE-21 the phone editor with a selected clip passes axe at 320 px with the tab bar and zoom pill (${lang})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      await add(page, [photo('A.png'), photo('B.png')], lang);
      await clip(page, 'A.png', lang).click();
      await axe(page);
    });
  }
});
