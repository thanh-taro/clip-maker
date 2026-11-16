// F-005 clip speed through the real UI (MOD-App, real decoders) on the app harness (tests/harness/app.html):
// the inspector's clip tabs and Speed section (quick choices, the Exact slider and field), the phone Edit
// sheet's Speed row, the RULE-03 and RULE-05 stops with their notices, and axe at 320 and 1280 px in en-US
// and vi-VN. F-005.AC2 measures the 440 Hz tone at 2× on real output: the preview's sound as the audio
// worker sends it to the worklet (`?tap=1`, as F-002's sound test), and the export decoded back from the
// file made by the real export workers (media harness `runTone` with a speed). Projects no control can
// make yet (a 9 min 30 s project, a 0.2 s clip) are put in place with `appHarness.load()`.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSummary, HeardSummary, PreviewSummary, ProjectSummary, SyncSummary } from '../harness/app';
import type { ToneSpec } from '../harness/sound';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const MEDIA = `http://localhost:${MEDIA_HARNESS_PORT}/`;
const SHOTS = '.build-my-app/reports/screens/F-005';
const S = 1_000_000;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}
const VIDEO_BYTES = readFileSync(fileURLToPath(new URL('../fixtures/media/mp4-faststart.mp4', import.meta.url)));
/** A 2 s phone-style video (the F-001 fixture), used whole. */
const video = (name: string): Payload => ({ name, mimeType: 'video/mp4', buffer: VIDEO_BYTES });

interface Harness {
  appHarness: {
    project(): ProjectSummary;
    clips(): ClipSummary[];
    frames(): number[];
    state(): string;
    load(json: string): void;
    setPlayhead(seconds: number): void;
    codedClip(rate: number, frames: number): Promise<number[]>;
    toneClip(spec: ToneSpec): Promise<number[]>;
    heard(spec: ToneSpec, hashed: number): HeardSummary;
    sync(): Promise<SyncSummary>;
    preview(): PreviewSummary;
  };
}
const harness = (page: Page) => page.evaluate.bind(page) as Page['evaluate'];
const summary = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.project());
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const framesOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.frames());
const stateOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.state());
const previewOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.preview());
const spans = async (page: Page) => (await clipsOf(page)).map((c) => [c.start, c.end]);

async function open(page: Page, lang: Language = 'en-US', extra = ''): Promise<void> {
  await page.goto(`${APP}?effects=fast&lang=${lang}${extra}`);
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

const base = {
  placement: { mode: 'fit', scale: 100, offsetX: 0, offsetY: 0, rotation: 0, flipH: false, flipV: false },
  adjustments: {},
  look: null,
  fadeIn: 0,
  fadeOut: 0,
  crossFadeNext: 0,
  speedPct: 100,
  volume: 100,
  muted: false,
};

/** A 30 fps project of video clips `[name, seconds of source used]` (sources with no file: no control makes these). */
async function loadVideos(page: Page, clips: readonly (readonly [string, number])[]): Promise<void> {
  const project = {
    frame: { aspect: 'original', frameRate: 30, background: 'black' },
    sources: clips.map(([name, seconds]) => ({
      id: `s-${name}`,
      kind: 'video',
      name,
      bytes: 1,
      duration: Math.round(seconds * S),
      width: 1920,
      height: 1080,
      frameRate: 30,
      hasSound: false,
    })),
    clips: clips.map(([name, seconds]) => ({
      id: name,
      sourceId: `s-${name}`,
      kind: 'video',
      in: 0,
      out: Math.round(seconds * S),
      ...base,
    })),
    textLayers: [],
    audioClips: [],
  };
  await page.evaluate((json) => (window as unknown as Harness).appHarness.load(json), JSON.stringify(project));
}

const timeline = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('region', { name: text(lang, 'timeline.label') });
const clip = (page: Page, name: string, lang: Language = 'en-US'): Locator =>
  timeline(page, lang).getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')} `) });
const inspector = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('complementary', { name: text(lang, 'inspector.label') });
const quick = (scope: Locator, label: string, lang: Language = 'en-US') =>
  scope
    .getByRole('radiogroup', { name: text(lang, 'inspector.speed') })
    .getByRole('radio', { name: label, exact: true });
const exactField = (scope: Locator, lang: Language = 'en-US') =>
  scope.getByRole('spinbutton', { name: text(lang, 'speed.exact') });
const exactSlider = (scope: Locator, lang: Language = 'en-US') =>
  scope.getByRole('slider', { name: text(lang, 'speed.exact') });
const lengthOf = (page: Page) => page.locator('[data-control="speed-length"]');
const notice = (page: Page, tag: string) => page.locator(`[data-notice="${tag}"]`);

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

async function shot(page: Page, name: string, browserName: string): Promise<void> {
  if (browserName !== 'chromium') return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test.describe('F-005 speed (app harness)', () => {
  test('F-005.AC1 F-005.R1 F-005.R2 picking 2× in the Edit tab: a 10 s clip lasts 5 s and the next clip moves 5 s earlier, as one step', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    const bytes = await harness(page)(() => (window as unknown as Harness).appHarness.codedClip(30, 300));
    await add(page, [{ name: 'ten.mp4', mimeType: 'video/mp4', buffer: Buffer.from(bytes) }, video('B.mp4')]);
    // B is the 2.067 s fixture.
    const b = (await clipsOf(page))[1]!.end - 10;
    expect(await spans(page)).toEqual([
      [0, 10],
      [10, 10 + b],
    ]);
    await clip(page, 'ten.mp4').click();
    // A video clip's inspector: the clip tabs, Edit selected, with the Speed section.
    const tabs = inspector(page).getByRole('tablist', { name: text('en-US', 'inspector.label') });
    await expect(tabs.getByRole('tab', { name: text('en-US', 'inspector.edit') })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(inspector(page).getByRole('heading', { name: text('en-US', 'inspector.speed') })).toBeVisible();
    await expect(lengthOf(page)).toHaveText(text('en-US', 'speed.length').replace('{length}', '0:10'));
    await expect(quick(inspector(page), '1×')).toHaveAttribute('aria-checked', 'true');
    await expect(exactField(inspector(page))).toHaveValue('1.00');
    const steps = (await summary(page)).steps;
    await quick(inspector(page), '2×').click();
    expect(await spans(page)).toEqual([
      [0, 5],
      [5, 5 + b],
    ]);
    expect((await summary(page)).steps).toBe(steps + 1);
    await expect(quick(inspector(page), '2×')).toHaveAttribute('aria-checked', 'true');
    await expect(exactField(inspector(page))).toHaveValue('2.00');
    await expect(exactSlider(inspector(page))).toHaveValue('200');
    await expect(exactSlider(inspector(page))).toHaveAttribute('aria-valuetext', '2×');
    await expect(lengthOf(page)).toHaveText(text('en-US', 'speed.length').replace('{length}', '0:05'));
    await expect(clip(page, 'ten.mp4')).toHaveAccessibleName('ten.mp4 0:05');
    for (const close of await page.locator('.tk-notice__close').all()) await close.click();
    await shot(page, 'inspector-speed-2x-wide', browserName);
    await page.getByRole('button', { name: text('en-US', 'action.undo'), exact: true }).click();
    expect(await spans(page)).toEqual([
      [0, 10],
      [10, 10 + b],
    ]);
  });

  test('F-005.AC3 F-005.R4 0.25× typed on a 60 s clip in a 9 min 30 s project stops at 0.70×: 85.7 s, project 9 min 55.7 s, COPY-notice.length_limited', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    await loadVideos(page, [
      ['long.mp4', 510],
      ['sixty.mp4', 60],
    ]);
    await clip(page, 'sixty.mp4').click();
    const field = exactField(inspector(page));
    await field.fill('0.25');
    await field.press('Enter');
    await expect(field).toHaveValue('0.70');
    await expect(notice(page, 'length_limited')).toContainText(text('en-US', 'notice.length_limited'));
    expect(await framesOf(page)).toEqual([15_300, 2571]);
    const [, b] = await clipsOf(page);
    expect(b!.end - b!.start).toBeCloseTo(85.7, 1);
    expect(b!.end).toBeCloseTo(595.7, 1);
    await expect(lengthOf(page)).toHaveText(text('en-US', 'speed.length').replace('{length}', '1:25'));
    await shot(page, 'inspector-speed-length-limited', browserName);
  });

  test('F-005.AC4 F-005.R5 4× on a 0.2 s clip at 30 fps stops at 2.40×: 3 frames and COPY-notice.speed_limited', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    await loadVideos(page, [['short.mp4', 0.2]]);
    expect(await framesOf(page)).toEqual([6]);
    await clip(page, 'short.mp4').click();
    await quick(inspector(page), '4×').click();
    await expect(exactField(inspector(page))).toHaveValue('2.40');
    expect(await framesOf(page)).toEqual([3]);
    await expect(notice(page, 'speed_limited')).toContainText(text('en-US', 'notice.speed_limited'));
    // No quick choice is 2.40×: none is checked, and the first stays in the Tab order.
    await expect(
      inspector(page)
        .getByRole('radiogroup', { name: text('en-US', 'inspector.speed') })
        .getByRole('radio', {
          checked: true,
        }),
    ).toHaveCount(0);
    await shot(page, 'inspector-speed-limited', browserName);
  });

  test('F-005.R1 RULE-06 CMP-Inspector the Exact field and slider: typed values snap to 0.05× and clamp to 0.25×–4×, one step each; slider keys step 0.05×', async ({
    page,
  }) => {
    await open(page);
    await add(page, [video('A.mp4')]);
    await clip(page, 'A.mp4').click();
    const field = exactField(inspector(page));
    const slider = exactSlider(inspector(page));
    let steps = (await summary(page)).steps;
    await field.fill('1.33');
    await field.press('Enter');
    await expect(field).toHaveValue('1.35');
    await expect(slider).toHaveValue('135');
    expect((await summary(page)).steps).toBe(steps + 1);
    await field.fill('9');
    await field.press('Enter');
    await expect(field).toHaveValue('4.00');
    expect((await summary(page)).steps).toBe(steps + 2);
    await field.fill('0');
    await field.press('Enter');
    await expect(field).toHaveValue('0.25');
    expect((await summary(page)).steps).toBe(steps + 3);
    // Unreadable: nothing changes and the value comes back (style.md "Number fields").
    steps = (await summary(page)).steps;
    await field.fill('fast');
    await field.press('Enter');
    await expect(field).toHaveValue('0.25');
    expect((await summary(page)).steps).toBe(steps);
    // The slider's keys: one 0.05× step and one undo step per key; the preview's arrows don't act.
    await slider.focus();
    const playhead = (await previewOf(page)).playhead;
    await page.keyboard.press('ArrowRight');
    await expect(field).toHaveValue('0.30');
    expect((await summary(page)).steps).toBe(steps + 1);
    await page.keyboard.press('End');
    await expect(field).toHaveValue('4.00');
    expect((await summary(page)).steps).toBe(steps + 2);
    expect((await previewOf(page)).playhead).toBe(playhead);
  });

  test('CMP-Inspector the clip tabs: a tablist with one tab stop; Left/Right (wrapping), Home and End switch Edit and Sound without stepping the preview', async ({
    page,
  }) => {
    await open(page);
    await add(page, [video('A.mp4'), video('B.mp4')]);
    await clip(page, 'A.mp4').click();
    const tabs = inspector(page).getByRole('tablist', { name: text('en-US', 'inspector.label') });
    const edit = tabs.getByRole('tab', { name: text('en-US', 'inspector.edit') });
    const sound = tabs.getByRole('tab', { name: text('en-US', 'inspector.sound') });
    await expect(edit).toHaveAttribute('tabindex', '0');
    await expect(sound).toHaveAttribute('tabindex', '-1');
    await expect(inspector(page).getByRole('tabpanel', { name: text('en-US', 'inspector.edit') })).toBeVisible();
    await edit.focus();
    const playhead = (await previewOf(page)).playhead;
    await page.keyboard.press('ArrowRight');
    await expect(sound).toBeFocused();
    await expect(sound).toHaveAttribute('aria-selected', 'true');
    await expect(inspector(page).getByRole('slider', { name: text('en-US', 'sound.volume') })).toBeVisible();
    await page.keyboard.press('Home');
    await expect(edit).toBeFocused();
    await expect(exactField(inspector(page))).toBeVisible();
    // Left from the first tab wraps to the last; Home and End go to the first and last.
    await page.keyboard.press('ArrowLeft');
    await expect(sound).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(edit).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(sound).toBeFocused();
    await expect(sound).toHaveAttribute('aria-selected', 'true');
    expect((await previewOf(page)).playhead).toBe(playhead);
    // The chosen tab stays when another clip is selected.
    await clip(page, 'B.mp4').click();
    await expect(sound).toHaveAttribute('aria-selected', 'true');
  });

  test('F-005.R2 RULE-10 a faster clip’s cross-fade shrinks to half of it, the track stays gap-free', async ({
    page,
  }) => {
    await open(page);
    await loadVideos(page, [
      ['a.mp4', 4],
      ['b.mp4', 10],
    ]);
    const doc = JSON.parse(await stateOf(page)) as { clips: { crossFadeNext: number }[] };
    doc.clips[0]!.crossFadeNext = 2 * S;
    await page.evaluate((json) => (window as unknown as Harness).appHarness.load(json), JSON.stringify(doc));
    // The cross-fade overlaps a's end with b's start: select a by its start.
    await clip(page, 'a.mp4').click({ position: { x: 4, y: 4 } });
    await quick(inspector(page), '4×').click();
    const after = JSON.parse(await stateOf(page)) as { clips: { crossFadeNext: number }[] };
    expect(after.clips[0]!.crossFadeNext).toBe(0.5 * S);
    // a lasts 1 s; b starts where the 0.5 s cross-fade begins.
    expect(await spans(page)).toEqual([
      [0, 1],
      [0.5, 10.5],
    ]);
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-005.R1 NFR-06 the phone Edit sheet’s Speed row and Exact row at 320 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      await add(page, [video('A.mp4'), video('B.mp4')], lang);
      await clip(page, 'A.mp4', lang).click();
      await page.getByRole('tab', { name: text(lang, 'inspector.edit') }).click();
      const sheet = page.locator('.tk-sheet');
      await expect(sheet).toBeVisible();
      const [a, b] = await clipsOf(page);
      const half = lang === 'vi-VN' ? '0,5×' : '0.5×';
      await quick(sheet, half, lang).click();
      // A lasts twice as long (whole frames); B follows it with no gap.
      const [a2, b2] = await clipsOf(page);
      expect(a2!.end).toBeCloseTo(2 * a!.end, 1);
      expect(b2!.start).toBe(a2!.end);
      expect(b2!.end - b2!.start).toBeCloseTo(b!.end - b!.start, 2);
      await expect(exactField(sheet, lang)).toHaveValue(lang === 'vi-VN' ? '0,50' : '0.50');
      // A vi-VN decimal comma is read (style.md "Number fields").
      if (lang === 'vi-VN') {
        await exactField(sheet, lang).fill('1,5');
        await exactField(sheet, lang).press('Enter');
        await expect(quick(sheet, '1,5×', lang)).toHaveAttribute('aria-checked', 'true');
      }
      // Touch-size quick segments (RULE-21: at least `size.touchTarget` high).
      const box = (await quick(sheet, '1×', lang).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      // Nothing scrolls sideways at 320 px.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      for (const close of await page.locator('.tk-notice__close').all()) await close.click();
      await exactSlider(sheet, lang).scrollIntoViewIfNeeded();
      await shot(page, `sheet-speed-narrow-${lang}`, browserName);
      await axe(page);
    });

    test(`F-005 NFR-06 axe passes with the Speed section at 1280 px (${lang})`, async ({ page, browserName }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, lang);
      await add(page, [video('A.mp4')], lang);
      await clip(page, 'A.mp4', lang).click();
      await quick(inspector(page, lang), lang === 'vi-VN' ? '1,5×' : '1.5×', lang).click();
      await expect(exactField(inspector(page, lang), lang)).toHaveValue(lang === 'vi-VN' ? '1,50' : '1.50');
      for (const close of await page.locator('.tk-notice__close').all()) await close.click();
      await shot(page, `inspector-speed-wide-${lang}`, browserName);
      await axe(page);
    });
  }

  test('F-005.AC2 F-005.R3 the preview plays a 440 Hz tone at 2× still at 440 Hz ± 1 %, over half the time', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, 'en-US', '&tap=1');
    const spec: ToneSpec = { seconds: 4, onset: 1, freq: 440, amp: 0.25, codec: 'aac', sampleRate: 48_000 };
    const bytes = await harness(page)((s) => (window as unknown as Harness).appHarness.toneClip(s), spec);
    await add(page, [{ name: 'tone.mp4', mimeType: 'video/mp4', buffer: Buffer.from(bytes) }]);
    await clip(page, 'tone.mp4').click();
    await quick(inspector(page), '2×').click();
    await expect.poll(async () => (await previewOf(page)).duration).toBeCloseTo(2, 2);
    await page.evaluate(() => (window as unknown as Harness).appHarness.setPlayhead(0));
    await page.getByRole('button', { name: text('en-US', 'action.play'), exact: true }).click();
    let played: SyncSummary | null = null;
    await expect
      .poll(async () => {
        played = await page.evaluate(() => (window as unknown as Harness).appHarness.sync());
        return played.hashed;
      })
      .toBeGreaterThan(48_000);
    await expect(page.getByRole('button', { name: text('en-US', 'action.play'), exact: true })).toBeVisible({
      timeout: 10_000,
    });
    // At 2× the tone starts at 0.5 s of the project and the sound ends with the project at 2 s.
    const heard = await page.evaluate(([s, n]) => (window as unknown as Harness).appHarness.heard(s, n), [
      { ...spec, onset: spec.onset / 2 },
      played!.hashed,
    ] as const);
    expect(heard.to).toBeCloseTo(2, 3);
    expect(Math.abs(heard.onset - 0.5)).toBeLessThan(0.02);
    expect(Math.abs(heard.freq - 440) / 440).toBeLessThan(0.01);
    test.info().annotations.push({ type: 'preview tone at 2×', description: `${heard.freq.toFixed(2)} Hz` });
  });
});

test.describe('F-005 speed in the export (media harness)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(MEDIA);
    await expect(page.locator('#out')).toHaveText('ready');
  });

  const tone = { seconds: 4, onset: 1, freq: 440, amp: 0.25, codec: 'aac', sampleRate: 48_000 } as const;
  for (const settings of [
    { kind: 'video', resolution: 480, quality: 'balanced' },
    { kind: 'audio', format: 'wav' },
  ] as const) {
    test(`F-005.AC2 F-005.R3 INV-02 a 440 Hz tone exported at 2× is 440 Hz ± 1 % and the sound lasts half as long (${settings.kind})`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const r = await page.evaluate(([s, t]) => window.harness.export.runTone(s, t, 200), [settings, tone] as const);
      expect(r.result.ok).toBe(true);
      expect(r.tone).not.toBeNull();
      expect(Math.abs(r.tone!.freq - 440) / 440).toBeLessThan(0.01);
      expect(Math.abs(r.tone!.onset - 0.5)).toBeLessThan(0.02);
      // 4 s of source at 2× is 2 s, and the tone lasts to the end (not cut, not silent).
      expect(Math.abs(r.fileSeconds - 2)).toBeLessThan(0.05);
      expect(r.tailDb).toBeGreaterThan(-20);
      test.info().annotations.push({
        type: `exported tone at 2× (${settings.kind})`,
        description: `${r.tone!.freq.toFixed(2)} Hz, ${r.fileSeconds.toFixed(3)} s, tail ${r.tailDb.toFixed(1)} dBFS`,
      });
    });
  }
});
