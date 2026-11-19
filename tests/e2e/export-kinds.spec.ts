// F-016 export an animated image or audio, through the real UI on the app harness (tests/harness/app.html: the
// real `main()`, workers, compositor and music): CMP-ExportPanel's GIF and Audio only tabs, the GIF range from
// the playhead and its 15 s limit, CMP-ExportProgress for both kinds (F-016.R3), the download (Playwright's
// download event), RULE-19 / D-019 with a real tab close, and axe at 320 and 1280 px in en-US and vi-VN. The
// downloaded files are decoded in the page: GIFs by the test GIF reader (every frame; tests/harness/gif-read.ts),
// sound by its own reader (WAV) or MOD-Audio's decoder (M4A, Ogg), and compared with the preview (INV-02,
// NFR-08): GIF frames with the preview's frame codes and colours, the sound with what the preview sent the
// worklet (?tap=1). Test media is made in the page; nothing is added to git.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Dialog, type Download, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { AudioRead, ClipSummary, GifRead } from '../harness/app';
import type { ToneSpec } from '../harness/sound';
import { deRgb, type Rgb } from '../support/colour';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;
const pattern = (lang: Language, id: CopyId): RegExp =>
  new RegExp(
    `^${text(lang, id)
      .replace(/[.*+?^$()|[\]\\]/g, '\\$&')
      .replace(/\{\w+\}/g, '.+')}$`,
  );
const SHOTS = fileURLToPath(new URL('../../.build-my-app/reports/screens/F-016/', import.meta.url));
const S = 1_000_000;

interface Harness {
  appHarness: {
    clips(): ClipSummary[];
    state(): string;
    load(json: string): void;
    setPlayhead(seconds: number): void;
    preview(): { shown: { exact: boolean } | null; duration: number };
    stripes(width: number, height: number, colours: readonly (readonly number[])[]): Promise<number[]>;
    codedClip(rate: number, frames: number): Promise<number[]>;
    toneClip(spec: ToneSpec): Promise<number[]>;
    pixels(
      png: string,
      points: readonly (readonly [number, number])[],
    ): Promise<{ width: number; height: number; at: number[][] }>;
    readGif(bytes: number[], points: readonly (readonly [number, number])[]): Promise<GifRead>;
    readAudio(bytes: number[], windows: readonly number[]): Promise<AudioRead>;
    scratchNames(): Promise<string[]>;
    unexported(): boolean;
  };
}
const h = (page: Page) => page.evaluate.bind(page) as Page['evaluate'];

async function open(page: Page, lang: Language = 'en-US', extra = '', size = { width: 1280, height: 800 }) {
  await page.setViewportSize(size);
  await page.goto(`${APP}?effects=fast&lang=${lang}${extra}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}

async function coded(page: Page, name: string, frames: number): Promise<Payload> {
  const bytes = await page.evaluate((n) => (window as unknown as Harness).appHarness.codedClip(30, n), frames);
  return { name, mimeType: 'video/mp4', buffer: Buffer.from(bytes) };
}
async function toned(page: Page, name: string, spec: ToneSpec): Promise<Payload> {
  const bytes = await page.evaluate((s) => (window as unknown as Harness).appHarness.toneClip(s), spec);
  return { name, mimeType: 'video/mp4', buffer: Buffer.from(bytes) };
}
async function photo(page: Page, name: string, colour: readonly number[]): Promise<Payload> {
  const bytes = await page.evaluate((c) => (window as unknown as Harness).appHarness.stripes(320, 240, [c]), colour);
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

type Json = Record<string, unknown> & { clips: Record<string, unknown>[]; audioClips: Record<string, unknown>[] };
async function change(page: Page, f: (p: Json) => void): Promise<void> {
  const p = JSON.parse(await page.evaluate(() => (window as unknown as Harness).appHarness.state())) as Json;
  f(p);
  await page.evaluate((j) => (window as unknown as Harness).appHarness.load(j), JSON.stringify(p));
}
const stateOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.state());
const unexported = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.unexported());
const scratchNames = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.scratchNames());
const setPlayhead = (page: Page, s: number) =>
  page.evaluate((x) => (window as unknown as Harness).appHarness.setPlayhead(x), s);

/** A project of one flat 4:3 photo lasting `seconds`. */
async function longPhoto(page: Page, seconds: number, lang: Language = 'en-US'): Promise<void> {
  await add(page, [await photo(page, 'p.png', [120, 140, 160])], lang);
  await change(page, (p) => {
    p.clips[0]!['duration'] = seconds * S;
  });
}

const toolbar = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('toolbar', { name: text(lang, 'toolbar.label') });
const exportButton = (page: Page, lang: Language = 'en-US') =>
  toolbar(page, lang).getByRole('button', { name: text(lang, 'action.export'), exact: true });
const panel = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('dialog', { name: text(lang, 'export.title') }).and(page.locator('.tk-export'));
const progress = (page: Page) => page.locator('dialog.tk-run');
const radio = (scope: Locator, name: string) => scope.getByRole('radio', { name, exact: true });
const pick = (scope: Locator, name: string) =>
  scope
    .locator('label')
    .filter({ has: scope.page().getByRole('radio', { name, exact: true }) })
    .click();
const tab = (p: Locator, lang: Language, id: CopyId) => p.getByRole('tab', { name: text(lang, id) });
const field = (p: Locator, lang: Language, id: 'export.gif_from' | 'export.gif_to') =>
  p.getByRole('textbox', { name: text(lang, id) });
const go = (p: Locator, lang: Language = 'en-US') =>
  p.getByRole('button', { name: text(lang, 'action.export'), exact: true });

async function openPanel(page: Page, lang: Language = 'en-US'): Promise<Locator> {
  await exportButton(page, lang).click();
  const p = panel(page, lang);
  await expect(p).toBeVisible();
  return p;
}

async function estimated(p: Locator, lang: Language = 'en-US'): Promise<string> {
  const e = p.locator('.tk-export__estimate[data-estimate="ready"]');
  await expect(e).toHaveText(pattern(lang, 'export.estimate'), { timeout: 60_000 });
  return (await e.textContent()) ?? '';
}

async function exportNow(page: Page, p: Locator, lang: Language = 'en-US', timeout = 120_000) {
  const download = page.waitForEvent('download', { timeout });
  await go(p, lang).click();
  const d: Download = await download;
  return { download: d, bytes: Array.from(readFileSync(await d.path())) };
}

/** Closes the tab as a user does (`beforeunload` runs); true when the browser showed its leave-page warning. */
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

/** Records every request; anything not a GET of the tool's own files (or a blob: of its origin) is off-device. */
function requestLog(page: Page): { offDevice: () => string[] } {
  const origin = new URL(APP).origin;
  const requests: string[] = [];
  page
    .context()
    .on('request', (r) => requests.push(`${r.method()} ${r.url()}${r.postData() === null ? '' : ' +body'}`));
  return {
    offDevice: () =>
      requests.filter(
        (q) => !(q.startsWith(`GET ${origin}/`) || q.startsWith(`GET blob:${origin}/`)) || q.endsWith(' +body'),
      ),
  };
}

const unit = (c: readonly number[]): Rgb => [c[0]! / 255, c[1]! / 255, c[2]! / 255];
const dE = (a: readonly number[], b: readonly number[]): number => deRgb(unit(a), unit(b));
const codeOf = (rgb: readonly (readonly number[])[]): number =>
  rgb.slice(0, 10).reduce((k, c, b) => (c[0]! + c[1]! + c[2]! > 3 * 128 ? k | (1 << b) : k), 0);
const CODE_POINTS: [number, number][] = Array.from({ length: 10 }, (_, b) => [(b + 0.5) / 10, 0.25]);
const canvas = (page: Page) => page.locator('.tk-frame canvas');
async function previewAt(page: Page, seconds: number, points: readonly (readonly [number, number])[]) {
  await setPlayhead(page, seconds);
  let last = '';
  let rgb: number[][] = [];
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const png = (await canvas(page).screenshot()).toString('base64');
    rgb = (
      await page.evaluate(([b, pts]) => (window as unknown as Harness).appHarness.pixels(b, pts), [
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

/**
 * Plays the whole project in the preview from 0 (?tap=1 records what it sends the worklet) and returns the
 * project's length in seconds (a whole number of frames).
 */
async function playThrough(page: Page, lang: Language = 'en-US'): Promise<number> {
  const preview = () => h(page)(() => (window as unknown as Harness).appHarness.preview());
  await expect.poll(async () => (await preview()).shown?.exact).toBe(true);
  await setPlayhead(page, 0);
  const play = page.getByRole('button', { name: text(lang, 'action.play') });
  await play.click();
  await expect(play).toBeVisible({ timeout: 20_000 });
  return (await preview()).duration;
}

// ── GIF ────────────────────────────────────────────────────────────────────────────────────────────

test.describe('F-016 GIF through the panel', () => {
  test('F-016.AC1 F-016.R1 RULE-16 NFR-01 picking GIF at 10 s of a 40 s project gives 10–25 s, the range holds to 15 s, and the file loops at the chosen size and rate', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180_000);
    const log = requestLog(page);
    await open(page);
    await longPhoto(page, 40);
    await setPlayhead(page, 10);
    const p = await openPanel(page);
    await tab(p, 'en-US', 'export.kind_gif').click();
    await expect(tab(p, 'en-US', 'export.kind_gif')).toHaveAttribute('aria-selected', 'true');
    const from = field(p, 'en-US', 'export.gif_from');
    const to = field(p, 'en-US', 'export.gif_to');
    await expect(from).toHaveValue('0:10');
    await expect(to).toHaveValue('0:25');
    // RULE-16 defaults: 480 and 15 fps.
    await expect(radio(p, '480')).toBeChecked();
    await expect(radio(p, '15')).toBeChecked();
    await expect(p.locator('.tk-export__format')).toHaveText('Saves as GIF');
    await estimated(p);
    await shot(page, 'gif-wide', browserName);
    // At most 15 s: a later end pulls the start along; an earlier start keeps the end.
    await to.fill('0:30');
    await to.press('Enter');
    await expect(from).toHaveValue('0:15');
    await from.fill('0:20');
    await from.press('Tab');
    await expect(from).toHaveValue('0:20');
    await expect(to).toHaveValue('0:30');
    // Text that isn't a time goes back to the range's value.
    await from.fill('soon');
    await from.press('Enter');
    await expect(from).toHaveValue('0:20');
    await pick(p, '320');
    await pick(p, '10');
    const { download, bytes } = await exportNow(page, p);
    expect(download.suggestedFilename()).toMatch(/^clip-\d{8}-\d{6}\.gif$/);
    const dialog = progress(page);
    await expect(dialog).toHaveAttribute('data-phase', 'done');
    await expect(dialog.getByRole('status')).toHaveText(
      text('en-US', 'export.done').replace('{name}', download.suggestedFilename()),
    );
    const g = await h(page)(([b]) => (window as unknown as Harness).appHarness.readGif(b, [[0.5, 0.5]]), [
      bytes,
    ] as const);
    // A looping GIF, 320 on its longer side (a 4:3 frame), 10 fps over the 10 s range.
    expect(g.header).toBe('GIF89a');
    expect(g.loop).toBe(0);
    expect([g.width, g.height]).toEqual([320, 240]);
    expect(g.frames).toHaveLength(100);
    expect(new Set(g.delays)).toEqual(new Set([10]));
    expect(Math.max(...g.palettes)).toBeLessThanOrEqual(256);
    // The photo's colour (quantised to the frame's palette).
    expect(dE(g.frames[0]![0]!, [120, 140, 160])).toBeLessThan(3);
    // F-016.R4: a GIF never clears unexported changes; NFR-01: nothing left the device.
    expect(await unexported(page)).toBe(true);
    expect(log.offDevice()).toEqual([]);
  });

  test('F-016.AC5 F-016.R1 NFR-08 INV-02 each GIF frame is within one GIF frame of its preview time, and the first frame is the preview’s', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180_000);
    await open(page);
    await add(page, [await coded(page, 'a.mp4', 90)]); // 3 s, frame-coded
    const CENTRE: [number, number][] = [
      [0.5, 0.6],
      [0.2, 0.8],
      [0.8, 0.8],
    ];
    const points = [...CODE_POINTS, ...CENTRE];
    const first = await previewAt(page, 0, points);
    const mid = await previewAt(page, 1.4, points);
    const p = await openPanel(page);
    await tab(p, 'en-US', 'export.kind_gif').click();
    // RULE-16: a project of 15 s or less is exported whole; the fields can't be changed.
    await expect(field(p, 'en-US', 'export.gif_from')).toHaveValue('0:00');
    await expect(field(p, 'en-US', 'export.gif_to')).toHaveValue('0:03');
    await expect(field(p, 'en-US', 'export.gif_from')).toHaveAttribute('readonly', '');
    await expect(field(p, 'en-US', 'export.gif_to')).toHaveAttribute('readonly', '');
    await shot(page, 'gif-fixed-range-wide', browserName, p);
    const { bytes } = await exportNow(page, p);
    const g = await h(page)(([b, pts]) => (window as unknown as Harness).appHarness.readGif(b, pts), [
      bytes,
      points,
    ] as const);
    expect([g.width, g.height]).toEqual([480, 360]);
    expect(g.frames).toHaveLength(45);
    expect(g.delays.slice(0, 6)).toEqual([7, 7, 6, 7, 7, 6]);
    // NFR-08: frame i is shown from the sum of the delays before it; its picture is the preview's frame from
    // within one GIF frame (1/15 s) of that time.
    let shownAt = 0;
    g.frames.forEach((f, i) => {
      const code = codeOf(f);
      expect(
        Math.abs(code / 30 - shownAt),
        `frame ${i} shows source frame ${code} at ${shownAt} s`,
      ).toBeLessThanOrEqual(1 / 15 + 1e-9);
      shownAt += g.delays[i]! / 100;
    });
    // INV-02: the first frame is the preview's picture at the range's start (same code, same colours).
    expect(codeOf(g.frames[0]!)).toBe(codeOf(first));
    for (let j = 0; j < points.length; j++) expect(dE(g.frames[0]![j]!, first[j]!)).toBeLessThan(6);
    // The frame shown at 1.4 s: the preview's code at 1.4 s within one GIF frame (2 source frames).
    const k = Math.round(1.4 * 15);
    expect(Math.abs(codeOf(g.frames[k]!) - codeOf(mid))).toBeLessThanOrEqual(2);
  });

  test('F-016.AC3 F-016.R3 NFR-11 Cancel (Esc) stops a running GIF export within 1 s, saves nothing and leaves no scratch', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180_000);
    await open(page);
    await longPhoto(page, 40);
    const before = await stateOf(page);
    let downloads = 0;
    page.on('download', () => downloads++);
    const p = await openPanel(page);
    await tab(p, 'en-US', 'export.kind_gif').click();
    await pick(p, '640');
    await go(p).click();
    const dialog = progress(page);
    await expect(dialog).toHaveAttribute('data-phase', 'running');
    await expect(page.locator('.tk-editor')).toHaveAttribute('data-state', 'exporting');
    await expect
      .poll(() => dialog.locator('progress').evaluate((e: HTMLProgressElement) => e.value), { timeout: 60_000 })
      .toBeGreaterThan(2);
    await shot(page, 'gif-running-wide', browserName);
    const t0 = Date.now();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0, { timeout: 1000 });
    expect(Date.now() - t0).toBeLessThan(1000);
    await expect(exportButton(page)).toBeFocused();
    expect(await stateOf(page)).toBe(before);
    expect(await unexported(page)).toBe(true);
    await expect.poll(() => scratchNames(page), { timeout: 10_000 }).toEqual([]);
    await page.waitForTimeout(1000);
    expect(downloads).toBe(0);
  });

  test('F-016.AC4 F-016.R4 RULE-19 D-019 after a GIF export with no other changes, closing the tab still shows the leave-page warning', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page);
    await longPhoto(page, 40);
    const p = await openPanel(page);
    await tab(p, 'en-US', 'export.kind_gif').click();
    await pick(p, '320');
    await pick(p, '10');
    await exportNow(page, p);
    await expect(progress(page)).toHaveAttribute('data-phase', 'done');
    await progress(page)
      .getByRole('button', { name: text('en-US', 'action.close') })
      .click();
    expect(await unexported(page)).toBe(true);
    expect(await closeTab(page)).toBe(true);
  });
});

// ── Audio only ────────────────────────────────────────────────────────────────────────────────────

/** A 3 s frame-coded clip with a 440 Hz tone from 0.5 s, and a bundled track from 1.5 s at 50 %. */
async function soundProject(page: Page): Promise<void> {
  const tone: ToneSpec = { seconds: 3, onset: 0.5, freq: 440, amp: 0.4, codec: 'aac', sampleRate: 48_000, coded: true };
  await add(page, [await toned(page, 'tone.mp4', tone)]);
  await change(page, (p) => {
    p.audioClips.push({
      id: 'music-1',
      sourceId: 'placeholder-chords',
      start: 1.5 * S,
      in: 0,
      out: 1.5 * S,
      volume: 50,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    });
  });
}

test.describe('F-016 Audio only through the panel', () => {
  test('F-016.AC2 F-016.AC6 F-016.R2 RULE-12 NFR-08 a WAV of clip sound and music is the preview’s mix as 16-bit 48 kHz stereo at ≤ −1 dBTP; after it the tab closes without a warning', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180_000);
    const log = requestLog(page);
    await open(page, 'en-US', '&tap=1');
    await soundProject(page);
    const length = await playThrough(page);
    expect(await unexported(page)).toBe(true);
    const p = await openPanel(page);
    await tab(p, 'en-US', 'export.kind_audio').click();
    const fmt = p.getByRole('group', { name: text('en-US', 'export.audio_format') });
    await expect(radio(fmt, text('en-US', 'export.audio_wav'))).toBeVisible();
    await pick(p, text('en-US', 'export.audio_wav'));
    await expect(radio(fmt, text('en-US', 'export.audio_wav'))).toBeChecked();
    await expect(p.locator('.tk-export__format')).toHaveText('Saves as WAV');
    await estimated(p);
    await shot(page, 'audio-wide', browserName);
    const { download, bytes } = await exportNow(page, p);
    expect(download.suggestedFilename()).toMatch(/^clip-\d{8}-\d{6}\.wav$/);
    await expect(progress(page)).toHaveAttribute('data-phase', 'done');
    const a = await h(page)(([b]) => (window as unknown as Harness).appHarness.readAudio(b, [0.25, 1.0, 2.25]), [
      bytes,
    ] as const);
    // RULE-16: 16-bit PCM, 48 kHz, stereo, exactly the project's length.
    expect([a.container, a.codec, a.bits, a.sampleRate, a.channels]).toEqual(['WAV', 'pcm-s16', 16, 48_000, 2]);
    expect(Math.abs(a.duration - length)).toBeLessThan(0.001);
    // RULE-12: the limiter's ceiling.
    expect(a.truePeakDb).toBeLessThanOrEqual(-1);
    // Silence before the tone, the tone alone, then tone and music.
    expect(a.windowsDb[0]!).toBeLessThan(-60);
    expect(a.windowsDb[1]!).toBeGreaterThan(-20);
    expect(a.windowsDb[2]!).toBeGreaterThan(a.windowsDb[1]! - 1);
    // F-016.AC2 / INV-02: the RULE-12 mix the preview played, sample for sample at the same positions.
    expect(a.vsPreview).not.toBeNull();
    expect(a.vsPreview!.seconds).toBeGreaterThan(2.5);
    expect(a.vsPreview!.correlation).toBeGreaterThan(0.99);
    expect(Math.abs(a.vsPreview!.levelDb)).toBeLessThan(0.5);
    expect(a.vsPreview!.errorDb).toBeLessThan(-30);
    expect(log.offDevice()).toEqual([]);
    // F-016.AC6 / RULE-19: an audio export counts as full-project: no warning on close.
    expect(await unexported(page)).toBe(false);
    await progress(page)
      .getByRole('button', { name: text('en-US', 'action.close') })
      .click();
    expect(await closeTab(page)).toBe(false);
  });

  test('F-016.R2 RULE-16 the compressed audio-only export is M4A (AAC, 48 kHz stereo) of the project’s length at ≤ −1 dBTP, at the preview’s level', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await open(page, 'en-US', '&tap=1');
    await soundProject(page);
    const length = await playThrough(page);
    const p = await openPanel(page);
    await tab(p, 'en-US', 'export.kind_audio').click();
    // The compressed format is the default and names what the device makes (AAC in M4A on both engines here).
    const compressed = text('en-US', 'export.audio_compressed').replace('{format}', 'M4A');
    await expect(radio(p, compressed)).toBeChecked();
    await expect(p.locator('.tk-export__format')).toHaveText('Saves as M4A');
    const { download, bytes } = await exportNow(page, p);
    expect(download.suggestedFilename()).toMatch(/^clip-\d{8}-\d{6}\.m4a$/);
    const a = await h(page)(([b]) => (window as unknown as Harness).appHarness.readAudio(b, [0.25]), [bytes] as const);
    expect(a.container).toMatch(/MP4|M4A/i);
    expect(a.codec).toMatch(/^mp4a|aac/);
    expect([a.sampleRate, a.channels]).toEqual([48_000, 2]);
    expect(Math.abs(a.duration - length)).toBeLessThan(0.05);
    expect(a.truePeakDb).toBeLessThanOrEqual(-1);
    expect(a.windowsDb[0]!).toBeLessThan(-50);
    expect(Math.abs(a.vsPreview!.levelDb)).toBeLessThan(1);
    expect(a.vsPreview!.correlation).toBeGreaterThan(0.9);
    expect(await unexported(page)).toBe(false);
  });

  test('F-016 edge case RULE-16 CMP-ExportPanel "no sound" a photo project: Audio only shows COPY-notice.no_sound_to_export beside a disabled Export, with the formats still shown', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await longPhoto(page, 5);
    const p = await openPanel(page);
    await tab(p, 'en-US', 'export.kind_audio').click();
    const note = p.locator('[data-notice="no_sound"]');
    await expect(note).toHaveText(text('en-US', 'notice.no_sound_to_export'));
    await expect(go(p)).toBeDisabled();
    await expect(go(p)).toHaveAccessibleDescription(text('en-US', 'notice.no_sound_to_export'));
    await expect(radio(p, text('en-US', 'export.audio_wav'))).toBeVisible();
    await shot(page, 'audio-no-sound-wide', browserName, p);
    // The other kinds stay available.
    await tab(p, 'en-US', 'export.kind_gif').click();
    await expect(go(p)).toBeEnabled({ timeout: 30_000 });
  });

  test('F-023.AC8 F-023.R5 a browser that encodes no sound format offers WAV only for audio, and it exports', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      const AE = (globalThis as unknown as { AudioEncoder: { isConfigSupported: unknown } }).AudioEncoder;
      AE.isConfigSupported = async (config: unknown) => ({ supported: false, config });
    });
    await open(page);
    await soundProject(page);
    const p = await openPanel(page);
    await tab(p, 'en-US', 'export.kind_audio').click();
    const fmt = p.getByRole('group', { name: text('en-US', 'export.audio_format') });
    await expect(fmt.getByRole('radio')).toHaveCount(1);
    await expect(radio(fmt, text('en-US', 'export.audio_wav'))).toBeChecked();
    await expect(p.locator('.tk-export__format')).toHaveText('Saves as WAV');
    await expect(go(p)).toBeEnabled({ timeout: 30_000 });
    const { download } = await exportNow(page, p);
    expect(download.suggestedFilename()).toMatch(/\.wav$/);
  });
});

// ── Tabs, layouts, languages and accessibility ──────────────────────────────────────────────────────

test.describe('F-016 layouts and accessibility', () => {
  test('CMP-ExportPanel the kinds are a tab list: arrow keys, Home and End move between them and choose', async ({
    page,
  }) => {
    await open(page);
    await longPhoto(page, 20);
    const p = await openPanel(page);
    const video = tab(p, 'en-US', 'export.kind_video');
    await expect(video).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tab(p, 'en-US', 'export.kind_gif')).toBeFocused();
    await expect(tab(p, 'en-US', 'export.kind_gif')).toHaveAttribute('aria-selected', 'true');
    await expect(p.getByRole('tabpanel')).toHaveAccessibleName(text('en-US', 'export.kind_gif'));
    await page.keyboard.press('End');
    await expect(tab(p, 'en-US', 'export.kind_audio')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(video).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(tab(p, 'en-US', 'export.kind_audio')).toBeFocused();
    // Only the selected tab is in the Tab order.
    await expect(p.getByRole('tab').and(p.locator('[tabindex="0"]'))).toHaveCount(1);
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`NFR-06 F-022.R6 the GIF and Audio only tabs pass axe at 1280 and 320 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      test.setTimeout(180_000);
      await open(page, lang);
      const tone: ToneSpec = {
        seconds: 2,
        onset: 0.2,
        freq: 440,
        amp: 0.3,
        codec: 'aac',
        sampleRate: 48_000,
        coded: true,
      };
      await add(page, [await toned(page, 'a.mp4', tone)], lang);
      let p = await openPanel(page, lang);
      for (const id of ['export.kind_gif', 'export.kind_audio'] as const) {
        await tab(p, lang, id).click();
        await estimated(p, lang);
        await axe(page);
        await shot(page, `${id === 'export.kind_gif' ? 'gif' : 'audio'}-wide-${lang}`, browserName);
      }
      // A GIF export's done dialog.
      await tab(p, lang, 'export.kind_gif').click();
      await exportNow(page, p, lang);
      await expect(progress(page)).toHaveAttribute('data-phase', 'done');
      await axe(page);
      await shot(page, `gif-done-wide-${lang}`, browserName);
      await progress(page)
        .getByRole('button', { name: text(lang, 'action.close') })
        .click();
      // Narrow: the sheet, no horizontal scrolling, touch-size controls.
      await page.setViewportSize({ width: 320, height: 568 });
      p = await openPanel(page, lang);
      for (const id of ['export.kind_gif', 'export.kind_audio'] as const) {
        await tab(p, lang, id).click();
        await estimated(p, lang);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const box = await p.boundingBox();
        expect(box!.height).toBeLessThanOrEqual(568 * 0.6 + 1);
        await axe(page);
        await shot(page, `${id === 'export.kind_gif' ? 'gif' : 'audio'}-narrow-320-${lang}`, browserName);
      }
      const t = await field(p, lang, 'export.gif_from').count();
      expect(t).toBe(0); // the Audio only tab is showing
      await tab(p, lang, 'export.kind_gif').click();
      const fromBox = await field(p, lang, 'export.gif_from').boundingBox();
      expect(fromBox!.height).toBeGreaterThanOrEqual(43);
    });
  }
});
