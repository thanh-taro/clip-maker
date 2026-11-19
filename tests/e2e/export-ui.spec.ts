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
    pixels(
      png: string,
      points: readonly (readonly [number, number])[],
    ): Promise<{ width: number; height: number; at: number[][] }>;
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
  const bytes = await page.evaluate(([c, ww, hh]) => (window as unknown as Harness).appHarness.stripes(ww, hh, [c]), [
    colour,
    w,
    h,
  ] as const);
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

const toolbar = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('toolbar', { name: text(lang, 'toolbar.label') });
const exportButton = (page: Page, lang: Language = 'en-US') =>
  toolbar(page, lang).getByRole('button', { name: text(lang, 'action.export'), exact: true });
const panel = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('dialog', { name: text(lang, 'export.title') }).and(page.locator('.tk-export'));
const progress = (page: Page) => page.locator('dialog.tk-run');
const radio = (scope: Locator, name: string | RegExp) =>
  scope.getByRole('radio', { name, exact: typeof name === 'string' });
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
async function exportNow(
  page: Page,
  p: Locator,
  lang: Language = 'en-US',
  timeout = 90_000,
): Promise<{ download: Download; bytes: number[] }> {
  const download = page.waitForEvent('download', { timeout });
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

test.describe('F-015 privacy', () => {
  test('F-015.AC8 NFR-01 F-020.R2 an export through the panel requests nothing beyond the tool’s own files and sends no content (its speed: the @realtime NFR-04 run)', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const origin = new URL(APP).origin;
    const requests: string[] = [];
    context.on('request', (r) => requests.push(`${r.method()} ${r.url()}${r.postData() === null ? '' : ' +body'}`));
    await context.route(
      (url) => url.origin !== origin && url.protocol !== 'data:' && url.protocol !== 'blob:',
      (route) => route.abort(),
    );
    await open(page);
    await add(page, [await coded(page, 'a.mp4', 45)]);
    const p = await openPanel(page);
    await pick(p, '480');
    await estimated(p);
    const from = requests.length;
    await exportNow(page, p);
    await expect(progress(page)).toHaveAttribute('data-phase', 'done');
    const offDevice = (q: string) =>
      !(q.startsWith(`GET ${origin}/`) || q.startsWith(`GET blob:${origin}/`)) || q.endsWith(' +body');
    expect(requests.slice(from).filter(offDevice)).toEqual([]);
    expect(requests.filter(offDevice)).toEqual([]);
  });
});

// ── Shared steps ───────────────────────────────────────────────────────────────────────────────────

const S = 1_000_000;
type Json = Record<string, unknown> & {
  frame: Record<string, unknown>;
  clips: Record<string, unknown>[];
  textLayers: Record<string, unknown>[];
  audioClips: Record<string, unknown>[];
};
/** Changes the session's project as one undo step (settings made elsewhere through their own controls). */
async function change(page: Page, f: (p: Json) => void): Promise<void> {
  const p = JSON.parse(await page.evaluate(() => (window as unknown as Harness).appHarness.state())) as Json;
  f(p);
  await page.evaluate((j) => (window as unknown as Harness).appHarness.load(j), JSON.stringify(p));
}
const stateOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.state());
const scratchNames = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.scratchNames());

/** A project of one flat photo lasting `seconds` (a long export without a long file). */
async function longPhoto(page: Page, seconds: number, lang: Language = 'en-US'): Promise<void> {
  await add(page, [await photo(page, 'p.png', [120, 140, 160])], lang);
  await change(page, (p) => {
    p.clips[0]!['duration'] = seconds * S;
  });
}

async function shot(page: Page, name: string, browserName: string, target?: Locator): Promise<void> {
  if (browserName !== 'chromium') return;
  if (target) await target.screenshot({ path: `${SHOTS}${name}.png` });
  else await page.screenshot({ path: `${SHOTS}${name}.png` });
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

const unit = (c: readonly number[]): Rgb => [c[0]! / 255, c[1]! / 255, c[2]! / 255];
const dE = (a: readonly number[], b: readonly number[]): number => deRgb(unit(a), unit(b));
/** The frame code (tests/harness/video.ts) from 10 RGB samples across the top quarter. */
const codeOf = (rgb: readonly (readonly number[])[]): number =>
  rgb.slice(0, 10).reduce((k, c, b) => (c[0]! + c[1]! + c[2]! > 3 * 128 ? k | (1 << b) : k), 0);
const CODE_POINTS: [number, number][] = Array.from({ length: 10 }, (_, b) => [(b + 0.5) / 10, 0.25]);

const canvas = (page: Page) => page.locator('.tk-frame canvas');
/** RGB of the preview at `points` once the playhead is at `seconds` and the picture has settled. */
async function previewAt(
  page: Page,
  seconds: number,
  points: readonly (readonly [number, number])[],
): Promise<number[][]> {
  await page.evaluate((s) => (window as unknown as Harness).appHarness.setPlayhead(s), seconds);
  let last = '';
  let rgb: number[][] = [];
  // Two equal readings in a row: the exact frame has replaced the coarse one (NFR-03).
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const png = (await canvas(page).screenshot()).toString('base64');
    rgb = (
      await page.evaluate(([p, pts]) => (window as unknown as Harness).appHarness.pixels(p, pts), [
        png,
        points,
      ] as const)
    ).at;
    const now = JSON.stringify(rgb);
    if (now === last) break;
    last = now;
  }
  return rgb;
}

// ── INV-02 / NFR-08: the downloaded file against the preview ─────────────────────────────────────────

test.describe('F-015 the exported file matches the preview', () => {
  test('F-015.AC4 F-015.R4 INV-02 NFR-08 F-002.AC6 video, photo, text, music, a look, adjustments, a cross-fade, speed and placement export as the preview shows them, the sound in place, no metadata', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(240_000);
    await open(page);
    // A frame-coded 4:3 clip with a 440 Hz tone from 1.0 s of source time, and a flat 4:3 photo.
    const tone: ToneSpec = { seconds: 4, onset: 1, freq: 440, amp: 0.5, codec: 'aac', sampleRate: 48_000, coded: true };
    await add(page, [
      await toned(page, 'holiday-tone.mp4', tone),
      await photo(page, 'family-photo.png', [150, 110, 90]),
    ]);
    // The edits, made through MOD-Project as their controls make them (F-005 speed, F-006 placement, F-007
    // adjustments, F-008 look, F-009 cross-fade, F-011 music): 2× speed on the clip, a 0.5 s cross-fade, the
    // photo 2 s long at 60 % with a look and brightness, and a bundled track from 2.6 s.
    await change(page, (p) => {
      const [clip, pic] = p.clips as [Record<string, unknown>, Record<string, unknown>];
      clip['speedPct'] = 200;
      clip['crossFadeNext'] = 0.5 * S;
      pic['duration'] = 2 * S;
      pic['placement'] = { ...(pic['placement'] as object), scale: 60 };
      pic['adjustments'] = { brightness: 20 };
      pic['look'] = { id: 'natural-warm', intensity: 100 };
      p.audioClips.push({
        id: 'music-1',
        sourceId: 'placeholder-chords',
        start: 2.6 * S,
        in: 0,
        out: 0.9 * S,
        volume: 100,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
      });
    });
    // F-010: a text layer typed in one editing session from 0 s (3 s long), at 80 % height (below the frame code).
    await page.evaluate(() => (window as unknown as Harness).appHarness.typeText(0, 'Đà Lạt'));
    const length = 3.5; // 2 s of clip + 2 s of photo − 0.5 s cross-fade
    const TEXT_BAND: [number, number][] = Array.from({ length: 21 }, (_, i) => [0.3 + (0.4 * i) / 20, 0.8]);
    const PHOTO_CENTRE: [number, number][] = [
      [0.5, 0.5],
      [0.45, 0.45],
      [0.55, 0.55],
    ];
    const OUTSIDE: [number, number][] = [
      [0.05, 0.5],
      [0.95, 0.5],
    ];
    const points = [...CODE_POINTS, ...TEXT_BAND, ...PHOTO_CENTRE, ...OUTSIDE];
    const times = [0.5, 1.0, 1.75, 3.2];
    const preview: number[][][] = [];
    for (const t of times) preview.push(await previewAt(page, t, points));

    const p = await openPanel(page);
    await pick(p, '480');
    await estimated(p);
    const { download, bytes } = await exportNow(page, p);
    expect(download.suggestedFilename()).toMatch(/^clip-\d{8}-\d{6}\.mp4$/);
    const read = await page.evaluate(
      ([b, ts, pts]) =>
        (window as unknown as Harness).appHarness.readExport(b, ts, pts, [0.4, 0.75, 3.05], 0.2, [
          'holiday-tone',
          'family-photo',
        ]),
      [bytes, times, points] as const,
    );
    // RULE-15 / F-015.AC4: 480 of a 4:3 frame, no source names, no library name.
    expect([read.width, read.height]).toEqual([640, 480]);
    expect(read.found).toEqual([]);
    expect(read.duration).toBeCloseTo(length, 1);
    const at = (i: number, from: number, n: number) => read.frames[i]!.rgb.slice(from, from + n);
    const was = (i: number, from: number, n: number) => preview[i]!.slice(from, from + n);
    // NFR-08 timing: each sampled frame is the preview's frame at the same time within one frame (2× speed:
    // project frame k shows source frame 2k).
    for (const i of [0, 1]) {
      const exported = codeOf(at(i, 0, 10));
      expect(exported).toBe(Math.round(times[i]! * 30) * 2);
      expect(Math.abs(codeOf(was(i, 0, 10)) - exported)).toBeLessThanOrEqual(2);
    }
    // The text: bright ink across the band at 0.5 s in both, about as much; none at 3.2 s (the layer ends at 3 s).
    const inked = (rgb: number[][]) => rgb.filter((c) => c[0]! + c[1]! + c[2]! > 3 * 200).length;
    expect(inked(at(0, 10, 21))).toBeGreaterThan(2);
    expect(Math.abs(inked(at(0, 10, 21)) - inked(was(0, 10, 21)))).toBeLessThanOrEqual(4);
    expect(inked(at(3, 10, 21))).toBe(0);
    // The cross-fade's middle: the same blend in both (loose: two frames blended, one frame apart at most).
    expect(dE(at(2, 31, 1)[0]!, was(2, 31, 1)[0]!)).toBeLessThan(10);
    // The photo with its look, brightness and 60 % placement: the same colour (ΔE00 < 4, NFR-08's per-patch
    // maximum), graded (not the raw photo), and the frame's background outside it.
    const photoDe = at(3, 31, 3).map((c, j) => dE(c, was(3, 31, 3)[j]!));
    expect(Math.max(...photoDe), JSON.stringify({ exported: at(3, 31, 3), preview: was(3, 31, 3) })).toBeLessThan(4);
    expect(dE(at(3, 31, 1)[0]!, [150, 110, 90])).toBeGreaterThan(3);
    for (const c of at(3, 34, 2)) expect(c[0]! + c[1]! + c[2]!).toBeLessThan(30);
    // The sound: the clip's tone starts at 0.5 s of project time (1.0 s of source at 2×) within 40 ms (NFR-08),
    // it sounds in the clip, the music sounds from 2.6 s, and the sound lasts as long as the picture.
    expect(read.sound).not.toBeNull();
    expect(Math.abs(read.sound!.onset - 0.5)).toBeLessThan(0.04);
    expect(read.sound!.rmsDb[0]!).toBeLessThan(-40);
    expect(read.sound!.rmsDb[1]!).toBeGreaterThan(-20);
    expect(read.sound!.rmsDb[2]!).toBeGreaterThan(-50);
    expect(Math.abs(read.sound!.duration - length)).toBeLessThan(0.05);
    await shot(page, 'done-wide', browserName);
  });
});

// ── Cancel, the editor lock and the scratch clean-up ──────────────────────────────────────────────

test.describe('F-015 cancel and the editor lock', () => {
  test('F-015.AC3 F-015.AC7 NFR-11 SCR-Editor exporting Q96 the editor is locked while exporting; Cancel (Esc) stops within 1 s, saves nothing, deletes the scratch and unlocks the editor', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180_000);
    await open(page);
    await longPhoto(page, 60);
    await change(page, (p) => {
      p.clips[0]!['adjustments'] = { contrast: 10 };
    });
    const before = await stateOf(page);
    let downloads = 0;
    page.on('download', () => downloads++);
    const p = await openPanel(page);
    await pick(p, text('en-US', 'export.q_best'));
    await p.getByRole('button', { name: text('en-US', 'action.export'), exact: true }).click();
    const dialog = progress(page);
    await expect(dialog).toHaveAttribute('data-phase', 'running');
    await expect(page.locator('.tk-editor')).toHaveAttribute('data-state', 'exporting');
    await expect(exportButton(page)).toHaveAttribute('aria-busy', 'true');
    await expect(dialog.getByRole('button', { name: text('en-US', 'action.cancel') })).toBeFocused();
    await expect(dialog.getByRole('progressbar', { name: text('en-US', 'export.progress_label') })).toBeVisible();
    await expect(dialog.locator('.tk-run__text')).toHaveText(/^Exporting… \d+ %/);
    await expect
      .poll(() => dialog.locator('progress').evaluate((e: HTMLProgressElement) => e.value), { timeout: 60_000 })
      .toBeGreaterThan(2);
    await shot(page, 'running-wide', browserName);

    // Locked: the history keys and a click on the toolbar's Undo change nothing.
    const mod = (await page.evaluate(() => /Mac/.test(navigator.platform))) ? 'Meta' : 'Control';
    await page.keyboard.press(`${mod}+z`);
    const undoBox = await toolbar(page)
      .getByRole('button', { name: text('en-US', 'action.undo'), exact: true })
      .boundingBox();
    await page.mouse.click(undoBox!.x + undoBox!.width / 2, undoBox!.y + undoBox!.height / 2);
    expect(await stateOf(page)).toBe(before);
    await expect(dialog).toHaveAttribute('data-phase', 'running');

    // Esc acts as Cancel while running; the dialog is gone within 1 s.
    const t0 = Date.now();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0, { timeout: 1000 });
    expect(Date.now() - t0).toBeLessThan(1000);
    await expect(exportButton(page)).toBeFocused();
    expect(downloads).toBe(0);
    expect(await stateOf(page)).toBe(before);
    expect(await unexported(page)).toBe(true);
    await expect(page.locator('.tk-editor')).not.toHaveAttribute('data-state', 'exporting');
    await expect(
      toolbar(page).getByRole('button', { name: text('en-US', 'action.undo'), exact: true }),
    ).not.toHaveAttribute('aria-disabled', 'true');
    // F-015.AC7: no scratch data from it remains (Playwright WebKit's context has no origin-private file system).
    await expect.poll(() => scratchNames(page), { timeout: 10_000 }).toEqual([]);
    await page.waitForTimeout(1000);
    expect(downloads).toBe(0);
  });

  test('F-015.AC7 a successful export’s scratch is gone 10 s after the hand-over, with the dialog closed', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page);
    await add(page, [await coded(page, 'a.mp4', 30)]);
    const p = await openPanel(page);
    await pick(p, '480');
    await exportNow(page, p);
    await progress(page)
      .getByRole('button', { name: text('en-US', 'action.close') })
      .click();
    await page.waitForTimeout(10_500);
    await expect.poll(() => scratchNames(page), { timeout: 5000 }).toEqual([]);
  });
});

// ── The size target (RULE-15, D-020) ─────────────────────────────────────────────────────────────────

test.describe('F-015 size target', () => {
  test('F-015.AC10 a 10 MB target at 1080 gives a file of at most 10,000,000 bytes (a 60 s project of a photo standing in for the NFR-04 fixture, which lives outside git)', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await open(page);
    await longPhoto(page, 60);
    const p = await openPanel(page);
    const ten = text('en-US', 'export.size_target').replace('{size}', '10');
    await pick(p, ten);
    await expect(radio(p, '1080')).toBeChecked();
    const go = p.getByRole('button', { name: text('en-US', 'action.export'), exact: true });
    await expect(go).toBeEnabled({ timeout: 30_000 });
    // A 60 s 1080 export: slower than the others when the machine is shared (not a speed check, NFR-04).
    const { bytes } = await exportNow(page, p, 'en-US', 240_000);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.length).toBeLessThanOrEqual(10_000_000);
  });

  test('F-015.AC2 RULE-15 D-020 a 4 MB target on a 60 s project names 480; a 1 MB target is unreachable and offers the smallest whole-MB size, and that offered target exports within it', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180_000);
    await open(page);
    await longPhoto(page, 60);
    const p = await openPanel(page);
    const field = p.getByRole('textbox', { name: text('en-US', 'export.size_custom_label') });
    const go = p.getByRole('button', { name: text('en-US', 'action.export'), exact: true });
    await field.fill('4');
    const warn = p.locator('.tk-export__warn');
    await expect(warn).toHaveText('4 MB is too small for 1080. 480 can make it.', { timeout: 30_000 });
    await expect(go).toBeDisabled();
    await expect(radio(p, text('en-US', 'export.q_balanced'))).not.toBeChecked();
    await shot(page, 'lower-res-wide', browserName, p);
    await p.getByRole('button', { name: 'Use 480' }).click();
    await expect(radio(p, '480')).toBeChecked();
    await expect(warn).toHaveCount(0, { timeout: 30_000 });
    await expect(go).toBeEnabled({ timeout: 30_000 });

    await field.fill('1');
    await expect(warn).toHaveText(/^1 MB is too small for this video\. The smallest possible is (\d+) MB\.$/, {
      timeout: 30_000,
    });
    const min = Number(/possible is (\d+) MB/.exec((await warn.textContent()) ?? '')?.[1]);
    expect(min).toBeGreaterThan(1);
    await expect(go).toBeDisabled();
    await shot(page, 'unreachable-wide', browserName, p);
    await p.getByRole('button', { name: `Use ${min} MB` }).click();
    await expect(field).toHaveValue(String(min));
    await expect(go).toBeEnabled({ timeout: 30_000 });
    const { bytes } = await exportNow(page, p);
    // RULE-15 / F-015.AC10: never above the target.
    expect(bytes.length).toBeLessThanOrEqual(min * 1_000_000);
  });

  test('RULE-15 CMP-ExportPanel a quick size choice clears the quality level, and a quality level clears it', async ({
    page,
  }) => {
    await open(page);
    await add(page, [await coded(page, 'a.mp4', 30)]);
    const p = await openPanel(page);
    const eight = text('en-US', 'export.size_target').replace('{size}', '8');
    await pick(p, eight);
    await expect(radio(p, eight)).toBeChecked();
    await expect(radio(p, text('en-US', 'export.q_balanced'))).not.toBeChecked();
    await pick(p, text('en-US', 'export.q_smaller'));
    await expect(radio(p, eight)).not.toBeChecked();
    await expect(radio(p, text('en-US', 'export.q_smaller'))).toBeChecked();
  });
});

// ── Endings: failed, interrupted, no space (F-015.R6) ──────────────────────────────────────────────

test.describe('F-015 export errors', () => {
  async function openFaulty(page: Page, fault: 'failed' | 'interrupted'): Promise<void> {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${APP}?effects=fast&lang=en-US&exportFault=${fault}`);
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
  }

  test('F-015.AC6 F-015.R6 a failed export shows COPY-export.failed_title and COPY-error.export_failed, every edit is kept, Change settings reopens the panel', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    await openFaulty(page, 'failed');
    await longPhoto(page, 20);
    await change(page, (p) => {
      p.clips[0]!['adjustments'] = { saturation: 30 };
    });
    const before = await stateOf(page);
    const p = await openPanel(page);
    await p.getByRole('button', { name: text('en-US', 'action.export'), exact: true }).click();
    const alert = page.getByRole('alertdialog', { name: text('en-US', 'export.failed_title') });
    await expect(alert).toBeVisible({ timeout: 60_000 });
    await expect(alert).toContainText(text('en-US', 'error.export_failed'));
    await expect(page.locator('.tk-editor')).toHaveAttribute('data-state', 'export-error');
    await expect(alert.getByRole('button', { name: text('en-US', 'action.close') })).toBeFocused();
    expect(await stateOf(page)).toBe(before);
    expect(await unexported(page)).toBe(true);
    await shot(page, 'failed-wide', browserName);
    await alert.getByRole('button', { name: text('en-US', 'action.change_settings') }).click();
    await expect(alert).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole('tab', { name: text('en-US', 'export.kind_video') })).toBeFocused();
    await expect.poll(() => scratchNames(page), { timeout: 10_000 }).toEqual([]);
  });

  test('CMP-ExportProgress interrupted (an injected ending; MOD-Export’s visibility rules are unit-tested) shows COPY-export.interrupted_title, and Try again runs the same settings', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    await openFaulty(page, 'interrupted');
    await longPhoto(page, 20);
    const p = await openPanel(page);
    await pick(p, '720');
    await p.getByRole('button', { name: text('en-US', 'action.export'), exact: true }).click();
    const alert = page.getByRole('alertdialog', { name: text('en-US', 'export.interrupted_title') });
    await expect(alert).toBeVisible({ timeout: 60_000 });
    await expect(alert).toContainText(text('en-US', 'error.export_interrupted'));
    await shot(page, 'interrupted-wide', browserName);
    await alert.getByRole('button', { name: text('en-US', 'action.try_again') }).click();
    // The same export runs again (and the harness interrupts it again).
    await expect(alert).toBeVisible({ timeout: 60_000 });
    await alert.getByRole('button', { name: text('en-US', 'action.close') }).click();
    await expect(progress(page)).toHaveCount(0);
  });

  test('F-015 edge case F-019.R7 not enough free storage: refused before starting with COPY-error.no_space', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    // A phone (memory cap 300 MB, ADR-0010 §2) whose storage has no room: a 10-minute 1080 Best export
    // (≈ 750 MB) has neither a scratch file nor memory to go to.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 2, configurable: true });
      if ('StorageManager' in window) StorageManager.prototype.estimate = async () => ({ quota: 1_000_000, usage: 0 });
    });
    await open(page);
    await longPhoto(page, 600);
    let downloads = 0;
    page.on('download', () => downloads++);
    const p = await openPanel(page);
    await pick(p, text('en-US', 'export.q_best'));
    await p.getByRole('button', { name: text('en-US', 'action.export'), exact: true }).click();
    const alert = page.getByRole('alertdialog', { name: text('en-US', 'export.no_space_title') });
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText(text('en-US', 'error.no_space'));
    await shot(page, 'no-space-wide', browserName);
    await alert.getByRole('button', { name: text('en-US', 'action.change_settings') }).click();
    await expect(panel(page)).toBeVisible();
    expect(downloads).toBe(0);
  });

  test('F-015.AC9 RULE-15 a device that can’t encode H.264 names the fallback: Saves as WebM, and the file is WebM', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'the fallback (VP9) is encoded by Chromium; WebKit is a manual check');
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      const original = VideoEncoder.isConfigSupported.bind(VideoEncoder);
      VideoEncoder.isConfigSupported = async (c: VideoEncoderConfig) =>
        c.codec.startsWith('avc') ? { supported: false, config: c } : original(c);
    });
    await open(page);
    await add(page, [await coded(page, 'a.mp4', 30)]);
    const p = await openPanel(page);
    await expect(p.locator('.tk-export__format')).toHaveText("Saves as WebM. This browser can't make MP4.", {
      timeout: 30_000,
    });
    await shot(page, 'fallback-wide', browserName, p);
    await pick(p, '480');
    const { download } = await exportNow(page, p);
    expect(download.suggestedFilename()).toMatch(/^clip-\d{8}-\d{6}\.webm$/);
  });
});

// ── Layouts, languages and accessibility ───────────────────────────────────────────────────────────

test.describe('F-015 layouts and accessibility', () => {
  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`NFR-06 F-022.R6 CMP-ExportPanel and CMP-ExportProgress pass axe at 1280 and 320 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      test.setTimeout(180_000);
      await open(page, lang);
      await add(page, [await coded(page, 'a.mp4', 60)], lang);
      // Wide: the panel docked in the inspector column.
      let p = await openPanel(page, lang);
      await estimated(p, lang);
      await expect(page.locator('.tk-inspector')).toBeHidden();
      await axe(page);
      await shot(page, `panel-wide-${lang}`, browserName);
      // The done dialog.
      await pick(p, '480');
      await exportNow(page, p, lang);
      const dialog = progress(page);
      await expect(dialog).toHaveAttribute('data-phase', 'done');
      await axe(page);
      await dialog.getByRole('button', { name: text(lang, 'action.close') }).click();
      // Narrow: a bottom sheet capped in height, Close instead of Cancel, no horizontal scrolling.
      await page.setViewportSize({ width: 320, height: 568 });
      p = await openPanel(page, lang);
      await estimated(p, lang);
      await expect(p.getByRole('button', { name: text(lang, 'action.cancel') })).toBeHidden();
      await expect(p.getByRole('button', { name: text(lang, 'action.close') })).toBeVisible();
      const box = await p.boundingBox();
      expect(box!.height).toBeLessThanOrEqual(568 * 0.6 + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await axe(page);
      await shot(page, `panel-narrow-320-${lang}`, browserName);
      await page.setViewportSize({ width: 390, height: 844 });
      await shot(page, `panel-narrow-390-${lang}`, browserName);
      // The progress sheet on narrow.
      await exportNow(page, p, lang);
      await expect(progress(page)).toHaveAttribute('data-phase', 'done');
      await page.setViewportSize({ width: 320, height: 568 });
      await axe(page);
      await shot(page, `done-narrow-${lang}`, browserName);
    });
  }
});
