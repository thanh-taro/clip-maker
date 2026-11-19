// F-018 warn before losing work through the real UI: the browser's leave-page warning while there are
// unexported changes (RULE-19), New project from the toolbar (wide) and the More menu (narrow) with
// CMP-ConfirmDialog, and RULE-23's new project. Standalone on the app harness (tests/harness/app.html: real
// main(), decoders, export), embedded on the multi-origin host harness (the built tool in the stub portal's
// frame with its grants). The browser's own warning is seen through Playwright's `beforeunload` dialog on a
// real close; "registered or not" is read by dispatching a cancelable `beforeunload` event (the tool's
// listener cancels it). Axe at 320 and 1280 px in en-US and vi-VN.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Dialog, type Frame, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSummary, ProjectSummary } from '../harness/app';
import { HOST_ALLOWED, hostPageUrl, TOOL_ALLOWED } from './support/host-urls';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;
const SHOTS = fileURLToPath(new URL('../../.build-my-app/reports/screens/F-018/', import.meta.url));
const VIDEO_BYTES = readFileSync(fileURLToPath(new URL('../fixtures/media/mp4-faststart.mp4', import.meta.url)));

interface Harness {
  appHarness: {
    clips(): ClipSummary[];
    codedClip(rate: number, frames: number): Promise<number[]>;
    frame(): { aspect: string; frameRate: number; background: string; frameRateChosen?: boolean };
    unexported(): boolean;
    project(): ProjectSummary;
  };
}
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const frameOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.frame());
const summary = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.project());
const unexported = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.unexported());

/** True when the tool's `beforeunload` listener is registered (it cancels the event to ask for the warning). */
const warns = (root: Page | Frame) =>
  root.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}

async function open(page: Page, lang: Language = 'en-US', size = { width: 1280, height: 800 }): Promise<void> {
  await page.setViewportSize(size);
  await page.goto(`${APP}?effects=fast&lang=${lang}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

/** A frame-coded 320 × 240 clip of `frames` frames at `rate`. */
async function coded(page: Page, name: string, frames = 45, rate = 30): Promise<Payload> {
  const bytes = await page.evaluate(([r, n]) => (window as unknown as Harness).appHarness.codedClip(r, n), [
    rate,
    frames,
  ] as const);
  return { name, mimeType: 'video/mp4', buffer: Buffer.from(bytes) };
}

/** Adds files through the empty state's Add media, then closes the media panel and the notices. */
async function add(page: Page, files: Payload[], lang: Language = 'en-US'): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('.tk-empty')
    .getByRole('button', { name: text(lang, 'action.add_media') })
    .click();
  await (await chooser).setFiles(files);
  await expect.poll(async () => (await clipsOf(page)).length, { timeout: 30_000 }).toBe(files.length);
  const media = page.locator('.tk-media');
  await media.getByRole('button', { name: text(lang, 'action.close') }).click();
  await expect(media).toHaveCount(0);
  for (const close of await page.locator('.tk-notice__close').all()) await close.click().catch(() => undefined);
}

const toolbar = (root: Page | Frame, lang: Language = 'en-US') =>
  root.getByRole('toolbar', { name: text(lang, 'toolbar.label') });
const toolButton = (root: Page | Frame, id: CopyId, lang: Language = 'en-US') =>
  toolbar(root, lang).getByRole('button', { name: text(lang, id), exact: true });
const confirmDialog = (root: Page | Frame, lang: Language = 'en-US') =>
  root.getByRole('alertdialog', { name: text(lang, 'action.new_project') });
const dialogButton = (d: Locator, id: CopyId, lang: Language = 'en-US') =>
  d.getByRole('button', { name: text(lang, id), exact: true });
const frameRadio = (page: Page, groupId: CopyId, name: string, lang: Language = 'en-US') =>
  page
    .getByRole('complementary', { name: text(lang, 'inspector.frame') })
    .getByRole('radiogroup', { name: text(lang, groupId) })
    .getByRole('radio', { name, exact: true });
const timeline = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('region', { name: text(lang, 'timeline.label') });
const inspector = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('complementary', { name: text(lang, 'inspector.label') });
const adjustPanel = (page: Page, lang: Language = 'en-US') =>
  inspector(page, lang).getByRole('tabpanel', { name: text(lang, 'inspector.adjust') });

/** Selects the first clip and opens the inspector's Adjust tab. */
async function openAdjust(page: Page, name: string): Promise<Locator> {
  await timeline(page)
    .getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')} `) })
    .click();
  await inspector(page)
    .getByRole('tablist', { name: text('en-US', 'inspector.label') })
    .getByRole('tab', { name: text('en-US', 'inspector.adjust') })
    .click();
  const panel = adjustPanel(page);
  await expect(panel).toBeVisible();
  return panel;
}

/** Exports the project at 480 through the panel and closes the done dialog (a full-project export, RULE-19). */
async function exportVideo(page: Page): Promise<void> {
  await toolButton(page, 'action.export').click();
  const p = page.getByRole('dialog', { name: text('en-US', 'export.title') }).and(page.locator('.tk-export'));
  await expect(p).toBeVisible();
  await p
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: '480', exact: true }) })
    .click();
  await expect(p.locator('.tk-export__estimate[data-estimate="ready"]')).toBeVisible({ timeout: 30_000 });
  const download = page.waitForEvent('download', { timeout: 90_000 });
  await p.getByRole('button', { name: text('en-US', 'action.export'), exact: true }).click();
  await download;
  const run = page.locator('dialog.tk-run');
  await expect(run).toHaveAttribute('data-phase', 'done');
  await run.getByRole('button', { name: text('en-US', 'action.close') }).click();
  await expect(run).toHaveCount(0);
}

/**
 * Closes the page as a user closing the tab does (`beforeunload` runs) and reports whether the browser
 * showed its leave-page warning. The warning is accepted, so the page closes either way.
 */
async function closeTab(page: Page): Promise<boolean> {
  let shown: Dialog | null = null;
  page.on('dialog', (d) => {
    if (d.type() === 'beforeunload') shown = d;
    void d.accept();
  });
  const closed = page.waitForEvent('close');
  await page.close({ runBeforeUnload: true });
  await closed;
  return shown !== null;
}

/** Waits until the element's entrance animation (if any, motion allowed) has finished. */
const settled = (l: Locator) =>
  l.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)).then(() => undefined));

async function shot(page: Page, name: string, browserName: string): Promise<void> {
  if (browserName !== 'chromium') return;
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

test.describe('F-018 the leave-page warning (standalone)', () => {
  test('F-018.AC1 F-018.R1 RULE-19 an edited, unexported project: closing the tab shows the browser’s leave-page warning; none is registered before the first edit', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await open(page);
    expect(await warns(page)).toBe(false);
    await add(page, [await coded(page, 'a.mp4')]);
    expect(await unexported(page)).toBe(true);
    expect(await warns(page)).toBe(true);
    expect(await closeTab(page)).toBe(true);
  });

  test('F-018.AC2 RULE-19 a project just exported with no edits since: closing the tab shows no warning', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await open(page);
    await add(page, [await coded(page, 'a.mp4')]);
    await exportVideo(page);
    expect(await unexported(page)).toBe(false);
    expect(await warns(page)).toBe(false);
    expect(await closeTab(page)).toBe(false);
  });

  test('F-018.R1 RULE-19 an edit after an export brings the warning back; undoing back to the exported project keeps it (an undone step is a change)', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await open(page);
    await add(page, [await coded(page, 'a.mp4')]);
    await exportVideo(page);
    expect(await warns(page)).toBe(false);
    await frameRadio(page, 'frame.aspect', '1:1').click();
    expect(await warns(page)).toBe(true);
    await toolButton(page, 'action.undo').click();
    expect((await frameOf(page)).aspect).toBe('original');
    expect(await unexported(page)).toBe(true);
    expect(await warns(page)).toBe(true);
    expect(await closeTab(page)).toBe(true);
  });
});

test.describe('F-018 New project (standalone)', () => {
  test('F-018.AC3 with unexported changes New project asks in CMP-ConfirmDialog (focus on Cancel); Cancel, Esc and the scrim change nothing and give focus back', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000);
    await open(page);
    await add(page, [await coded(page, 'a.mp4')]);
    const before = await clipsOf(page);
    const newProject = toolButton(page, 'action.new_project');
    await newProject.click();
    const d = confirmDialog(page);
    await expect(d).toBeVisible();
    await expect(d).toHaveAccessibleDescription(text('en-US', 'confirm.new_project'));
    await expect(dialogButton(d, 'action.cancel')).toBeFocused();
    await settled(d);
    await shot(page, 'confirm-wide-en', browserName);
    // Tab moves to New project (WebKit, like Safari, tabs to buttons with Alt+Tab).
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(dialogButton(d, 'action.new_project')).toBeFocused();
    await shot(page, 'confirm-wide-focus-on-confirm', browserName);
    // Cancel.
    await dialogButton(d, 'action.cancel').click();
    await expect(d).toHaveCount(0);
    await expect(newProject).toBeFocused();
    expect(await clipsOf(page)).toEqual(before);
    await expect(toolButton(page, 'action.undo')).not.toHaveAttribute('aria-disabled', 'true');
    expect(await unexported(page)).toBe(true);
    // Esc.
    await newProject.click();
    await expect(d).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
    await expect(newProject).toBeFocused();
    expect(await clipsOf(page)).toEqual(before);
    // A click on the scrim (the dialog's backdrop, outside its box).
    await newProject.click();
    await expect(d).toBeVisible();
    await page.mouse.click(8, 400);
    await expect(d).toHaveCount(0);
    expect(await clipsOf(page)).toEqual(before);
    expect(await warns(page)).toBe(true);
  });

  test('F-018.AC4 F-018.R3 RULE-23 confirmed from a 9:16, 60 fps project with a chosen export size and copied colour: empty, no undo, Original 30 fps with detection on, nothing to paste, the export size kept', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    await open(page);
    await add(page, [await coded(page, 'a.mp4')]);
    await frameRadio(page, 'frame.aspect', '9:16').click();
    await frameRadio(page, 'frame.rate', '60').click();
    expect(await frameOf(page)).toMatchObject({ aspect: '9:16', frameRate: 60, frameRateChosen: true });
    // Copied adjustments (RULE-08 Copy colour).
    const adjust = await openAdjust(page, 'a.mp4');
    await adjust.getByRole('button', { name: text('en-US', 'action.copy_look'), exact: true }).click();
    await expect(adjust.getByRole('button', { name: text('en-US', 'action.paste_look'), exact: true })).toBeEnabled();
    // A chosen export resolution (an export setting, kept by RULE-23).
    await toolButton(page, 'action.export').click();
    const panel = page.getByRole('dialog', { name: text('en-US', 'export.title') }).and(page.locator('.tk-export'));
    await panel
      .locator('label')
      .filter({ has: page.getByRole('radio', { name: '720', exact: true }) })
      .click();
    await expect(panel.getByRole('radio', { name: '720', exact: true })).toBeChecked();
    await toolButton(page, 'action.export').click(); // Export again closes the panel
    await expect(panel).toHaveCount(0);

    await toolButton(page, 'action.new_project').click();
    const d = confirmDialog(page);
    await dialogButton(d, 'action.new_project').click();
    await expect(d).toHaveCount(0);

    // Empty: the empty state in place of the preview, an empty timeline and media panel, no undo.
    await expect(page.locator('.tk-editor')).toHaveAttribute('data-state', 'empty');
    expect(await clipsOf(page)).toEqual([]);
    await expect(toolButton(page, 'action.undo')).toHaveAttribute('aria-disabled', 'true');
    await expect(toolButton(page, 'action.redo')).toHaveAttribute('aria-disabled', 'true');
    await expect(toolButton(page, 'action.export')).toBeDisabled();
    expect(await frameOf(page)).toEqual({ aspect: 'original', frameRate: 30, background: 'black' });
    expect(await unexported(page)).toBe(false);
    expect(await warns(page)).toBe(false);
    expect((await summary(page)).sources).toEqual([]);
    // The media panel is empty (Add media opens it with the file picker, which is left unanswered).
    const chooser = page.waitForEvent('filechooser');
    await toolButton(page, 'action.add_media').click();
    await chooser;
    const media = page.locator('.tk-media');
    await expect(media).toBeVisible();
    await expect(media.locator('.tk-media__row')).toHaveCount(0);
    await shot(page, 'new-project-empty', browserName);
    await media.getByRole('button', { name: text('en-US', 'action.close') }).click();
    await expect(media).toHaveCount(0);

    // Detection is on again: a 60 fps first video sets 60 fps (RULE-04).
    await add(page, [await coded(page, 'sixty.mp4', 60, 60)]);
    expect((await frameOf(page)).frameRate).toBe(60);
    expect((await frameOf(page)).frameRateChosen).toBeUndefined();
    // Nothing to paste.
    const again = await openAdjust(page, 'sixty.mp4');
    await expect(again.getByRole('button', { name: text('en-US', 'action.paste_look'), exact: true })).toBeDisabled();
    // The export size is kept.
    await toolButton(page, 'action.export').click();
    await expect(panel.getByRole('radio', { name: '720', exact: true })).toBeChecked();
  });

  test('F-018.AC5 a project with no unexported changes (just exported) starts a new project without asking', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(150_000);
    await open(page);
    await add(page, [await coded(page, 'a.mp4')]);
    await exportVideo(page);
    await toolButton(page, 'action.new_project').click();
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(page.locator('.tk-editor')).toHaveAttribute('data-state', 'empty');
    expect(await clipsOf(page)).toEqual([]);
    // Focus stays where the user left it (WebKit, like Safari, never focuses a clicked button).
    if (browserName === 'chromium') await expect(toolButton(page, 'action.new_project')).toBeFocused();
  });

  test('F-018.R2 CMP-Toolbar narrow: New project from the More menu asks in a bottom sheet, New project above Cancel; Esc gives focus back to More', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000);
    await open(page, 'en-US', { width: 390, height: 844 });
    await add(page, [await coded(page, 'a.mp4')]);
    const more = toolButton(page, 'action.more');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    const menu = page.getByRole('menu', { name: text('en-US', 'action.more') });
    const items = menu.getByRole('menuitem');
    await expect(items).toHaveText([
      text('en-US', 'action.new_project'),
      text('en-US', 'action.shortcuts'),
      text('en-US', 'privacy.notices'),
      text('en-US', 'privacy.source_label'),
    ]);
    await expect(items.first()).toBeFocused();
    await shot(page, 'more-menu-narrow', browserName);
    // Arrow keys move; Esc closes and focus returns to More.
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(items.nth(3)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();
    // New project from the menu.
    await more.click();
    await menu.getByRole('menuitem', { name: text('en-US', 'action.new_project') }).click();
    await expect(menu).toHaveCount(0);
    const d = confirmDialog(page);
    await expect(d).toBeVisible();
    await expect(dialogButton(d, 'action.cancel')).toBeFocused();
    const confirmBox = (await dialogButton(d, 'action.new_project').boundingBox())!;
    const cancelBox = (await dialogButton(d, 'action.cancel').boundingBox())!;
    expect(confirmBox.y).toBeLessThan(cancelBox.y);
    expect(cancelBox.height).toBeGreaterThanOrEqual(44);
    // A bottom sheet, the full width (measured once its entrance has settled).
    await expect.poll(async () => {
      const b = (await d.boundingBox())!;
      return [Math.round(b.y + b.height), Math.round(b.width)];
    }).toEqual([844, 390]);
    await settled(d);
    await shot(page, 'confirm-narrow-sheet', browserName);
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
    await expect(more).toBeFocused();
    expect(await clipsOf(page)).toHaveLength(1);
    // Confirm from the sheet.
    await more.click();
    await menu.getByRole('menuitem', { name: text('en-US', 'action.new_project') }).click();
    await dialogButton(d, 'action.new_project').click();
    await expect(page.locator('.tk-editor')).toHaveAttribute('data-state', 'empty');
  });

  test('CMP-Toolbar a tap outside the More menu closes it', async ({ page }) => {
    await open(page, 'en-US', { width: 390, height: 844 });
    const more = toolButton(page, 'action.more');
    await more.click();
    const menu = page.getByRole('menu', { name: text('en-US', 'action.more') });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeFocused(); // the menu is set up (focus moved in)
    await page.mouse.click(200, 500);
    await expect(menu).toHaveCount(0);
    await expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`NFR-06 F-022.R6 CMP-ConfirmDialog and the More menu pass axe at 1280 and 320 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      test.setTimeout(90_000);
      await open(page, lang);
      await add(page, [await coded(page, 'a.mp4')], lang);
      await toolButton(page, 'action.new_project', lang).click();
      const d = confirmDialog(page, lang);
      await expect(d).toBeVisible();
      await expect(d).toHaveAccessibleDescription(text(lang, 'confirm.new_project'));
      await settled(d);
      const wide = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(wide.violations).toEqual([]);
      if (lang === 'vi-VN') await shot(page, 'confirm-wide-vi', browserName);
      await page.keyboard.press('Escape');
      await expect(d).toHaveCount(0);

      await page.setViewportSize({ width: 320, height: 640 });
      const more = toolButton(page, 'action.more', lang);
      await more.click();
      const menu = page.getByRole('menu', { name: text(lang, 'action.more') });
      await expect(menu).toBeVisible();
      const menuScan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(menuScan.violations).toEqual([]);
      await menu.getByRole('menuitem', { name: text(lang, 'action.new_project') }).click();
      await expect(d).toBeVisible();
      await settled(d);
      const narrow = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(narrow.violations).toEqual([]);
      if (lang === 'vi-VN') await shot(page, 'confirm-narrow-320-vi', browserName);
    });
  }
});

test.describe('F-018 embedded in the host portal', () => {
  type HostWindow = Window & { __received: { origin: string; data: unknown }[] };

  async function embeddedWithClip(page: Page): Promise<Frame> {
    await page.goto(hostPageUrl(HOST_ALLOWED, TOOL_ALLOWED, {}));
    const shell = page.frameLocator('#tool').locator('[data-screen="SCR-Editor"]');
    await expect(shell).toHaveAttribute('data-device', 'supported', { timeout: 30_000 });
    const frame = page.frames().find((f) => f.url().startsWith(TOOL_ALLOWED));
    if (!frame) throw new Error('tool frame not found');
    expect(await warns(frame)).toBe(false);
    const chooser = page.waitForEvent('filechooser');
    await frame
      .locator('.tk-empty')
      .getByRole('button', { name: text('en-US', 'action.add_media') })
      .click();
    await (await chooser).setFiles([{ name: 'a.mp4', mimeType: 'video/mp4', buffer: VIDEO_BYTES }]);
    await expect(shell).not.toHaveAttribute('data-state', /^(empty|adding)$/, { timeout: 30_000 });
    return frame;
  }

  test('F-018.AC1 F-019.R6 RULE-17 INV-08 embedded with the leave-page grant: closing the portal tab warns (the WebKit engine never shows it from a frame, F-018 edge case: the listener is checked there); the host gets only the ready signal', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(90_000);
    const frame = await embeddedWithClip(page);
    expect(await warns(frame)).toBe(true);
    // New project asks inside the frame, too.
    await toolButton(frame, 'action.new_project').click();
    const d = confirmDialog(frame);
    await expect(d).toBeVisible();
    await dialogButton(d, 'action.cancel').click();
    await expect(d).toHaveCount(0);
    // Nothing but the ready signal ever reaches the host (F-019.R5).
    const got = await page.evaluate(() => (window as unknown as HostWindow).__received);
    expect(got).toEqual([{ origin: TOOL_ALLOWED, data: { type: 'taro:ready' } }]);
    // The WebKit engine never shows the warning from a cross-origin frame and the tool can't detect it
    // (F-018 edge case, ADR-0014); there the registered listener above is what the tool controls.
    if (browserName !== 'webkit') expect(await closeTab(page)).toBe(true);
  });
});
