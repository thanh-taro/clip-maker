// F-015 export video through the real UI on the app harness (tests/harness/app.html: the real `main()`, workers,
// compositor, looks and music): CMP-ExportPanel docked in the inspector column (wide) or as a sheet (narrow), the
// estimate and the size target's advice, CMP-ExportProgress (running, cancelling, done, failed, interrupted, no
// space), the download (Playwright's download event: the `<a download>` hand-over), the editor lock, RULE-19, the
// scratch clean-up, the language switch during an export (F-022.AC8), and axe at 320 and 1280 px in en-US and
// vi-VN. Test media is made in the page (frame-coded clips with a tone, flat photos); nothing is added to git. The
// downloaded file is read back in the page (`appHarness.readExport`) and compared with the preview's picture at
// the same times (INV-02, NFR-08).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSummary, ExportRead, ProjectSummary } from '../harness/app';
import type { ToneSpec } from '../harness/sound';
import { deRgb, type Rgb } from '../support/colour';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;
/** A COPY text with its `{placeholders}` as a regular expression (any value). */
const pattern = (lang: Language, id: CopyId): RegExp =>
  new RegExp(
    `^${text(lang, id)
      .replace(/[.*+?^$()|[\]\\]/g, '\\$&')
      .replace(/\{\w+\}/g, '.+')}$`,
  );
const SHOTS = fileURLToPath(new URL('../../.build-my-app/reports/screens/F-015/', import.meta.url));

interface Harness {
  appHarness: {
    project(): ProjectSummary;
    clips(): ClipSummary[];
    state(): string;
    load(json: string): void;
    setPlayhead(seconds: number): void;
    stripes(width: number, height: number, colours: readonly (readonly number[])[]): Promise<number[]>;
    codedClip(rate: number, frames: number): Promise<number[]>;
    toneClip(spec: ToneSpec): Promise<number[]>;
    typeText(seconds: number, content: string): void;
    pixels(png: string, points: readonly (readonly [number, number])[]): Promise<{ width: number; height: number; at: number[][] }>;
    readExport(
      bytes: number[],
      times: readonly number[],
      points: readonly (readonly [number, number])[],
      windows: readonly number[],
      onsetAmp: number,
      names: readonly string[],
    ): Promise<ExportRead>;
    scratchNames(): Promise<string[]>;
    unexported(): boolean;
  };
}

async function open(page: Page, lang: Language = 'en-US', size = { width: 1280, height: 800 }): Promise<void> {
  await page.setViewportSize(size);
  await page.goto(`${APP}?effects=fast&lang=${lang}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}

/** A frame-coded 320 × 240 clip (30 fps) of `frames` frames. */
async function coded(page: Page, name: string, frames: number): Promise<Payload> {
  const bytes = await page.evaluate((n) => (window as unknown as Harness).appHarness.codedClip(30, n), frames);
  return { name, mimeType: 'video/mp4', buffer: Buffer.from(bytes) };
}

/** A frame-coded 30 fps clip with a tone in its sound (silence before `onset`). */
async function toned(page: Page, name: string, spec: ToneSpec): Promise<Payload> {
  const bytes = await page.evaluate((s) => (window as unknown as Harness).appHarness.toneClip(s), spec);
  return { name, mimeType: spec.codec === 'aac' ? 'video/mp4' : 'video/webm', buffer: Buffer.from(bytes) };
}

/** A W × H photo of one flat colour. */
async function photo(page: Page, name: string, colour: readonly number[], w = 320, h = 240): Promise<Payload> {
  const bytes = await page.evaluate(
    ([c, ww, hh]) => (window as unknown as Harness).appHarness.stripes(ww, hh, [c]),
    [colour, w, h] as const,
  );
  return { name, mimeType: 'image/png', buffer: Buffer.from(bytes) };
}

const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());

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

const toolbar = (page: Page, lang: Language = 'en-US') => page.getByRole('toolbar', { name: text(lang, 'toolbar.label') });
const exportButton = (page: Page, lang: Language = 'en-US') =>
  toolbar(page, lang).getByRole('button', { name: text(lang, 'action.export'), exact: true });
const panel = (page: Page, lang: Language = 'en-US') => page.getByRole('dialog', { name: text(lang, 'export.title') }).and(page.locator('.tk-export'));
const progress = (page: Page) => page.locator('dialog.tk-run');
const radio = (scope: Locator, name: string | RegExp) => scope.getByRole('radio', { name, exact: typeof name === 'string' });
/** Chooses an option as a user does: a click on its label (the native radio is visually hidden). */
const pick = (scope: Locator, name: string) =>
  scope
    .locator('label')
    .filter({ has: scope.page().getByRole('radio', { name, exact: true }) })
    .click();

async function openPanel(page: Page, lang: Language = 'en-US'): Promise<Locator> {
  await exportButton(page, lang).click();
  const p = panel(page, lang);
  await expect(p).toBeVisible();
  return p;
}

/** Waits for the estimate (COPY-export.estimate) to show. */
async function estimated(p: Locator, lang: Language = 'en-US'): Promise<string> {
  const e = p.locator('.tk-export__estimate[data-estimate="ready"]');
  await expect(e).toHaveText(pattern(lang, 'export.estimate'), { timeout: 30_000 });
  return (await e.textContent()) ?? '';
}

/** Starts the export from the panel and returns the download and the file's bytes. */
async function exportNow(page: Page, p: Locator, lang: Language = 'en-US'): Promise<{ download: Download; bytes: number[] }> {
  const download = page.waitForEvent('download', { timeout: 90_000 });
  await p.getByRole('button', { name: text(lang, 'action.export'), exact: true }).click();
  const d = await download;
  const path = await d.path();
  return { download: d, bytes: Array.from(readFileSync(path)) };
}

const unexported = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.unexported());

test.describe('F-015 export video through the panel', () => {
  test('F-015.AC1 RULE-15 export opens with only encodable sizes offered, 1080 and Balanced chosen, each unavailable size with its reason', async ({
    page,
  }) => {
    await open(page);
    await add(page, [await coded(page, 'a.mp4', 60)]);
    const p = await openPanel(page);
    await expect(exportButton(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.tk-editor')).toHaveAttribute('data-state', 'exporting-setup');
    // Focus moves to the selected kind tab.
    await expect(p.getByRole('tab', { name: text('en-US', 'export.kind_video') })).toBeFocused();
    await expect(radio(p, '1080')).toBeChecked();
    await expect(radio(p, text('en-US', 'export.q_balanced'))).toBeChecked();
    for (const r of ['480', '720', '1080']) await expect(radio(p, r)).toBeEnabled();
    // A 320 × 240 source: 1440 and 2160 are not offered, each with its reason always visible.
    for (const r of ['1440', '2160']) {
      await expect(radio(p, r)).toBeDisabled();
      const reason = p.locator(`#tk-export-why-${r}`);
      await expect(reason).toBeVisible();
      await expect(reason).toHaveText(
        new RegExp(
          `^(${text('en-US', 'export.res_needs_source').replace('{res}', r)}|${text('en-US', 'export.res_no_encoder').replace('{res}', r).replace("'", "'")})$`,
        ),
      );
    }
    await estimated(p);
    await expect(p.locator('.tk-export__format')).toHaveText(/^Saves as (MP4|WebM)/);
    // Esc closes it without exporting; focus returns to the toolbar's Export.
    await page.keyboard.press('Escape');
    await expect(p).toHaveCount(0);
    await expect(exportButton(page)).toBeFocused();
  });

  test('F-015.R5 F-015.AC5 RULE-15 RULE-19 an export is downloaded as clip-<date>-<time>.mp4, Done names it, and the project counts as exported', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page);
    await add(page, [await coded(page, 'a.mp4', 45)]);
    expect(await unexported(page)).toBe(true);
    const p = await openPanel(page);
    await pick(p, '480');
    await estimated(p);
    const { download, bytes } = await exportNow(page, p);
    const name = download.suggestedFilename();
    expect(name).toMatch(/^clip-\d{8}-\d{6}\.(mp4|webm)$/);
    const dialog = progress(page);
    await expect(dialog).toHaveAttribute('data-phase', 'done');
    await expect(dialog.getByRole('status')).toHaveText(text('en-US', 'export.done').replace('{name}', name));
    await expect(dialog.getByRole('button', { name: text('en-US', 'action.close') })).toBeFocused();
    expect(await unexported(page)).toBe(false);
    const read = await page.evaluate(
      ([b]) => (window as unknown as Harness).appHarness.readExport(b, [0.5], [[0.5, 0.75]], [], 1, ['a.mp4']),
      [bytes] as const,
    );
    expect(read.duration).toBeCloseTo(1.5, 1);
    expect([read.width, read.height]).toEqual([640, 480]);
    expect(read.found).toEqual([]);
    await dialog.getByRole('button', { name: text('en-US', 'action.close') }).click();
    await expect(dialog).toHaveCount(0);
    await expect(exportButton(page)).toBeFocused();
  });
});
