// F-009 fade and cross-fade through the real UI on the app harness (tests/harness/app.html: the real `main()`,
// workers, compositor and audio worklet): CMP-Inspector's Fades (a clip's Edit tab; an audio clip's sound
// section), CMP-Timeline's join controls (the add chip, the bow-tie marker and its length popover), the phone
// Edit sheet's Cross-fade tile and Fades row (320 px). Test media is made in the page: flat photos
// (`appHarness.stripes()`), clips with a tone in their sound (`appHarness.toneClip()`), and a WAV tone made
// here. Preview pixels come from a screenshot of the preview canvas (`appHarness.pixels()`); the preview's
// sound is the audio worker's output to the worklet (?tap=1, `appHarness.heardTones()`). The export halves
// run on the media harness (tests/harness/export.ts `fadeExport`): the real export workers, the file decoded,
// next to the compositor's paint of the same frame (INV-02). Axe at 320 and 1280 px in en-US and vi-VN.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSetup, ClipSummary, ProjectSummary } from '../harness/app';
import type { FadeReport, FadeSpec } from '../harness/export';
import type { ToneSpec } from '../harness/sound';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;
const SHOTS = fileURLToPath(new URL('../../.build-my-app/reports/screens/F-009/', import.meta.url));
const S = 1_000_000;

type Point = readonly [number, number];
type Rgb = readonly [number, number, number];
interface Harness {
  appHarness: {
    project(): ProjectSummary;
    clips(): ClipSummary[];
    frames(): number[];
    setClip(index: number, setup: ClipSetup): void;
    setPlayhead(seconds: number): void;
    state(): string;
    load(json: string): void;
    stripes(width: number, height: number, colours: readonly (readonly number[])[]): Promise<number[]>;
    pixels(png: string, points: readonly Point[]): Promise<{ width: number; height: number; at: number[][] }>;
    toneClip(spec: ToneSpec): Promise<number[]>;
    heardTones(windows: readonly { at: number; freq: number }[]): { amplitudes: number[]; from: number; to: number };
  };
}
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const stepsOf = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as Harness).appHarness.project())).steps;
const stateOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.state());
const setPlayhead = (page: Page, s: number) =>
  page.evaluate((x) => (window as unknown as Harness).appHarness.setPlayhead(x), s);
const setClip = (page: Page, i: number, setup: ClipSetup) =>
  page.evaluate(([n, s]) => (window as unknown as Harness).appHarness.setClip(n, s), [i, setup] as const);
const projectEnd = async (page: Page) => (await clipsOf(page)).at(-1)?.end ?? 0;

async function open(page: Page, lang: Language = 'en-US', extra = ''): Promise<void> {
  await page.goto(`${APP}?effects=fast&lang=${lang}${extra}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}

const RED: Rgb = [200, 40, 40];
const BLUE: Rgb = [40, 40, 200];
const AMBER: Rgb = [220, 180, 140];

/** A 16:9 flat photo (320 × 180). */
async function photo(page: Page, name: string, colour: Rgb): Promise<Payload> {
  const bytes = await page.evaluate(([c]) => (window as unknown as Harness).appHarness.stripes(320, 180, [c]), [
    colour,
  ] as const);
  return { name, mimeType: 'image/png', buffer: Buffer.from(bytes) };
}

/** A clip whose sound is a steady tone from its first sample (AAC in MP4, made in the page). */
async function toneVideo(page: Page, name: string, freq: number, seconds: number): Promise<Payload> {
  const spec: ToneSpec = { seconds, onset: 0, freq, amp: 0.25, codec: 'aac', sampleRate: 48_000 };
  const bytes = await page.evaluate((s) => (window as unknown as Harness).appHarness.toneClip(s), spec);
  return { name, mimeType: 'video/mp4', buffer: Buffer.from(bytes) };
}

/** A 16-bit 48 kHz stereo WAV of a steady tone at amplitude 0.25. */
function wavTone(name: string, freq: number, seconds: number): Payload {
  const n = Math.round(seconds * 48_000);
  const b = new Uint8Array(44 + n * 4);
  const v = new DataView(b.buffer);
  const ascii = (s: string, at: number) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii('RIFF', 0);
  v.setUint32(4, 36 + n * 4, true);
  ascii('WAVEfmt ', 8);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, 48_000, true);
  v.setUint32(28, 48_000 * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  ascii('data', 36);
  v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    const x = Math.round(0.25 * 32767 * Math.sin((2 * Math.PI * freq * i) / 48_000));
    v.setInt16(44 + i * 4, x, true);
    v.setInt16(46 + i * 4, x, true);
  }
  return { name, mimeType: 'audio/wav', buffer: Buffer.from(Array.from(b)) };
}

/** Adds files through the empty state's Add media, then closes the media panel (drawer or sheet). */
async function add(page: Page, files: Payload[], clips = files.length, lang: Language = 'en-US'): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('.tk-empty')
    .getByRole('button', { name: text(lang, 'action.add_media') })
    .click();
  await (await chooser).setFiles(files);
  await expect.poll(async () => (await clipsOf(page)).length, { timeout: 30_000 }).toBe(clips);
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
const join = (page: Page, nth = 0) => page.locator('.tk-timeline .tk-join').nth(nth);
const popover = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('dialog', { name: text(lang, 'crossfade.length') });
const pop = (page: Page, id: CopyId, lang: Language = 'en-US') =>
  popover(page, lang).getByRole('button', { name: text(lang, id), exact: true });
const fadeField = (scope: Locator, edge: 'in' | 'out', lang: Language = 'en-US') =>
  scope.getByRole('spinbutton', { name: text(lang, edge === 'in' ? 'fades.in' : 'fades.out'), exact: true });
const fadeSlider = (scope: Locator, edge: 'in' | 'out', lang: Language = 'en-US') =>
  scope.getByRole('slider', { name: text(lang, edge === 'in' ? 'fades.in' : 'fades.out'), exact: true });
const undoButton = (page: Page) =>
  page
    .getByRole('toolbar', { name: text('en-US', 'toolbar.label') })
    .getByRole('button', { name: text('en-US', 'action.undo') });

async function typeFade(scope: Locator, edge: 'in' | 'out', value: string, lang: Language = 'en-US'): Promise<void> {
  const f = fadeField(scope, edge, lang);
  await f.fill(value);
  await f.press('Enter');
}

const canvas = (page: Page) => page.locator('.tk-frame canvas');
async function previewAt(page: Page, points: readonly Point[]): Promise<number[][]> {
  const png = (await canvas(page).screenshot()).toString('base64');
  return (
    await page.evaluate(([p, pts]) => (window as unknown as Harness).appHarness.pixels(p, pts), [png, points] as const)
  ).at;
}
/** Waits until the preview's centre passes `check` (the paint follows the playhead asynchronously). */
async function expectCentre(page: Page, check: (c: number[]) => boolean): Promise<number[]> {
  let last: number[] = [];
  await expect
    .poll(
      async () => {
        [last] = (await previewAt(page, [[0.5, 0.5]])) as [number[]];
        return check(last);
      },
      { timeout: 15_000, message: 'preview colour' },
    )
    .toBe(true)
    .catch((e: unknown) => {
      throw new Error(`${String(e)}\nlast colour: ${JSON.stringify(last)}`);
    });
  return last;
}
/** Each channel is `share` of the way from black to `colour`, within ± `tol` of the way (F-009.AC1). */
const shareOf = (got: readonly number[], colour: Rgb, share: number, tol: number): boolean =>
  colour.every((v, i) => Math.abs(got[i]! / v - share) <= tol);
/** A blend `w` of A into B, each channel within `tol` (0–255). */
const blendOf = (got: readonly number[], a: Rgb, b: Rgb, w: number, tol: number): boolean =>
  a.every((v, i) => Math.abs(got[i]! - ((1 - w) * v + w * b[i]!)) <= tol);

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

/** Waits until a locator's box stops moving (the layout has settled). */
async function settled(target: Locator): Promise<void> {
  let last = '';
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await target.boundingBox());
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [100, 100, 100, 200] },
    )
    .toBe(true);
}

/** Opens the app at 1280 px with two 5 s photos A (red) and B (blue). */
async function twoPhotos(page: Page, a: Rgb = RED, b: Rgb = BLUE, seconds = [5, 5], lang: Language = 'en-US') {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, lang);
  await add(page, [await photo(page, 'A.png', a), await photo(page, 'B.png', b)], 2, lang);
  await setClip(page, 0, { seconds: seconds[0]! });
  await setClip(page, 1, { seconds: seconds[1]! });
}

/** Adds the cross-fade at the first join with its chip (hover shows it), then opens its popover. */
async function addCrossFade(page: Page): Promise<void> {
  await settled(join(page));
  await timeline(page).locator('.tk-track').hover();
  await join(page).click();
  await expect(join(page)).toHaveAttribute('data-state', 'marker');
  await settled(join(page));
  await join(page).click();
  await expect(popover(page)).toBeVisible();
  await expect(join(page)).toHaveAttribute('aria-expanded', 'true');
}

/** Plays from 0 to the end (play stops there) with the worklet tap on. */
async function playThrough(page: Page): Promise<void> {
  await setPlayhead(page, 0);
  const play = page.getByRole('button', { name: text('en-US', 'action.play') });
  await play.click();
  await expect(page.getByRole('button', { name: text('en-US', 'action.pause') })).toBeVisible();
  await expect(play).toBeVisible({ timeout: 30_000 });
}

test.describe('F-009 fades and cross-fades (app harness)', () => {
  test('F-009.AC1 F-009.R1 (preview picture) a 1 s fade in typed in the Edit tab: black at the clip’s start, 50 % ± 2 % of the way at 0.5 s', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    await add(page, [await photo(page, 'P.png', AMBER)]);
    await clipButton(page, 'P.png').click();
    const panel = inspector(page);
    await expect(panel.getByRole('heading', { name: text('en-US', 'inspector.fades') })).toBeVisible();
    await typeFade(panel, 'in', '1');
    await expect(fadeField(panel, 'in')).toHaveValue('1.0');
    await expect(fadeSlider(panel, 'in')).toHaveValue('10');
    await expect(fadeSlider(panel, 'in')).toHaveAttribute('aria-valuetext', '1.0 s');
    expect(JSON.parse(await stateOf(page)).clips[0].fadeIn).toBe(S);
    expect(await stepsOf(page)).toBe(2);
    await setPlayhead(page, 0);
    await expectCentre(page, (c) => c.every((v) => v <= 2));
    await setPlayhead(page, 0.5);
    await expectCentre(page, (c) => shareOf(c, AMBER, 0.5, 0.02));
    await setPlayhead(page, 1.5);
    await expectCentre(page, (c) => shareOf(c, AMBER, 1, 0.02));
    await shot(page, 'inspector-fades-wide-en-US', browserName);
  });

  test('F-009.AC1 F-009.R1 (preview sound) a tone clip with a 1 s fade in is silent at its start and plays at 50 % ± 2 % at 0.5 s', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, 'en-US', '&tap=1');
    await add(page, [await toneVideo(page, 'T.mp4', 440, 2)]);
    await clipButton(page, 'T.mp4').click();
    await typeFade(inspector(page), 'in', '1');
    await playThrough(page);
    const r = await page.evaluate(
      (w) => (window as unknown as Harness).appHarness.heardTones(w),
      [
        { at: 0.025, freq: 440 },
        { at: 0.5, freq: 440 },
        { at: 1.5, freq: 440 },
      ],
    );
    const [start, half, full] = r.amplitudes as [number, number, number];
    expect(full, JSON.stringify(r)).toBeGreaterThan(0.2);
    // Over the first 50 ms the straight line averages 2.5 %: silent at the start.
    expect(start / full).toBeLessThan(0.05);
    expect(Math.abs(half / full - 0.5)).toBeLessThanOrEqual(0.02);
  });

  test('F-009.AC2 F-009.AC3 F-009.R2 F-009.R3 (preview picture) adding a cross-fade and setting it to 1 s makes 5 s + 5 s a 9 s project blending A into B over the middle second; Remove makes it 10 s again', async ({
    page,
    browserName,
  }) => {
    await twoPhotos(page);
    expect(await projectEnd(page)).toBe(10);
    const steps = await stepsOf(page);
    // The chip is named by its action; the marker by the popover it opens and the length.
    await expect(join(page)).toHaveAccessibleName(text('en-US', 'action.add_crossfade'));
    await addCrossFade(page);
    // CMP-Timeline "Behavior": add uses 0.5 s.
    await expect(popover(page).locator('output')).toHaveText('0.5 s');
    for (let i = 0; i < 5; i++) await pop(page, 'crossfade.longer').click();
    await expect(popover(page).locator('output')).toHaveText('1.0 s');
    await expect(join(page)).toHaveAccessibleName(`${text('en-US', 'crossfade.length')} 1.0 s`);
    expect(await stepsOf(page)).toBe(steps + 6);
    expect(await projectEnd(page)).toBe(9);
    expect((await clipsOf(page)).map((c) => [c.start, c.end])).toEqual([
      [0, 5],
      [4, 9],
    ]);
    await expect(timeline(page).locator('.tk-xfade')).toHaveCount(1);
    await shot(page, 'timeline-crossfade-popover-en-US', browserName);
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    await expect(join(page)).toBeFocused();
    // The middle second blends A into B along a straight line.
    await setPlayhead(page, 3.9);
    await expectCentre(page, (c) => blendOf(c, RED, BLUE, 0, 4));
    await setPlayhead(page, 4.5);
    await expectCentre(page, (c) => blendOf(c, RED, BLUE, 0.5, 5));
    await setPlayhead(page, 4.75);
    await expectCentre(page, (c) => blendOf(c, RED, BLUE, 0.75, 5));
    await setPlayhead(page, 5.1);
    await expectCentre(page, (c) => blendOf(c, RED, BLUE, 1, 4));
    // AC3: Remove (one step) — the project is 10 s again and the join shows the add chip.
    await join(page).click();
    await pop(page, 'action.remove_crossfade').click();
    await expect(popover(page)).toHaveCount(0);
    await expect(join(page)).toHaveAttribute('data-state', 'add');
    await expect(join(page)).toBeFocused();
    expect(await projectEnd(page)).toBe(10);
    await expect(timeline(page).locator('.tk-xfade')).toHaveCount(0);
    await undoButton(page).click();
    expect(await projectEnd(page)).toBe(9);
  });

  test('F-009.AC2 F-009.R3 (preview sound) the middle second of a 1 s cross-fade blends A’s tone into B’s on equal-power curves', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, 'en-US', '&tap=1');
    await add(page, [await toneVideo(page, 'A.mp4', 440, 5), await toneVideo(page, 'B.mp4', 660, 5)]);
    await addCrossFade(page);
    for (let i = 0; i < 5; i++) await pop(page, 'crossfade.longer').click();
    await expect(popover(page).locator('output')).toHaveText('1.0 s');
    await page.keyboard.press('Escape');
    // The tone clips last 5 s and a frame or so (their encoder's last packet): the overlap is 1 s exactly.
    const [a, b] = await clipsOf(page);
    expect(a!.end - b!.start).toBeCloseTo(1, 3);
    expect(await projectEnd(page)).toBeCloseTo(9, 0);
    await playThrough(page);
    const mid = (a!.end + b!.start) / 2;
    const at = [mid - 1, mid, mid + 1];
    const r = await page.evaluate(
      (w) => (window as unknown as Harness).appHarness.heardTones(w),
      at.flatMap((t) => [
        { at: t, freq: 440 },
        { at: t, freq: 660 },
      ]),
    );
    const [a35, b35, a45, b45, a55, b55] = r.amplitudes as number[];
    expect(a35!, JSON.stringify(r)).toBeGreaterThan(0.2);
    expect(b35! / a35!).toBeLessThan(0.02);
    // The middle: each at sin(π/4) of its level; their powers sum to one.
    expect(Math.abs(a45! / a35! - Math.SQRT1_2)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(b45! / a35! - Math.SQRT1_2)).toBeLessThanOrEqual(0.03);
    expect(a55! / a35!).toBeLessThan(0.02);
    expect(Math.abs(b55! / a35! - 1)).toBeLessThanOrEqual(0.03);
  });

  test('F-009.AC7 F-009.R2 (preview) with A’s 1 s fade out under a 1 s cross-fade, the fade out is not applied: the clips blend, never towards black', async ({
    page,
  }) => {
    await twoPhotos(page);
    await clipButton(page, 'A.png').click();
    await typeFade(inspector(page), 'out', '1');
    expect(JSON.parse(await stateOf(page)).clips[0].fadeOut).toBe(S);
    await addCrossFade(page);
    for (let i = 0; i < 5; i++) await pop(page, 'crossfade.longer').click();
    await page.keyboard.press('Escape');
    await setPlayhead(page, 4.5);
    await expectCentre(page, (c) => blendOf(c, RED, BLUE, 0.5, 5));
    // A's fade out is still set: without the cross-fade it would apply again.
    expect(JSON.parse(await stateOf(page)).clips[0].fadeOut).toBe(S);
  });

  test('F-009.AC4 F-009.R4 (preview) an audio clip with a 2 s fade out falls to silence along a straight line over its last 2 s', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, 'en-US', '&tap=1');
    await add(page, [await photo(page, 'P.png', AMBER), wavTone('tone.wav', 440, 4)], 1);
    await setClip(page, 0, { seconds: 4 });
    const item = timeline(page).locator('.tk-aclip');
    await expect(item).toHaveCount(1);
    await item.click();
    const panel = page.getByRole('complementary', { name: text('en-US', 'inspector.sound') });
    await expect(fadeSlider(panel, 'out')).toHaveAttribute('max', '50');
    await typeFade(panel, 'out', '2');
    expect(JSON.parse(await stateOf(page)).audioClips[0].fadeOut).toBe(2 * S);
    // RULE-10: 0–5 s; a value beyond is reduced.
    await typeFade(panel, 'in', '9');
    await expect(fadeField(panel, 'in')).toHaveValue('2.0');
    await typeFade(panel, 'in', '0');
    await shot(page, 'inspector-audio-fades-en-US', browserName);
    await playThrough(page);
    const r = await page.evaluate(
      (w) => (window as unknown as Harness).appHarness.heardTones(w),
      [1, 2.5, 3, 3.5, 3.97].map((at) => ({ at, freq: 440 })),
    );
    const [full, a, b, c, end] = r.amplitudes as number[];
    expect(full!, JSON.stringify(r)).toBeGreaterThan(0.2);
    expect(Math.abs(a! / full! - 0.75)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(b! / full! - 0.5)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(c! / full! - 0.25)).toBeLessThanOrEqual(0.02);
    expect(end! / full!).toBeLessThan(0.03);
  });

  test('F-009.AC5 F-009.R5 between 1 s and 5 s clips the cross-fade stops at 0.5 s: Longer is unavailable there', async ({
    page,
  }) => {
    await twoPhotos(page, RED, BLUE, [1, 5]);
    await addCrossFade(page);
    await expect(popover(page).locator('output')).toHaveText('0.5 s');
    await expect(pop(page, 'crossfade.longer')).toHaveAttribute('aria-disabled', 'true');
    const steps = await stepsOf(page);
    await pop(page, 'crossfade.longer').click({ force: true });
    expect(await stepsOf(page)).toBe(steps);
    expect((await clipsOf(page))[0]!.crossFade).toBe(0.5);
  });

  test('F-009.AC6 F-009.R6 removing the 1 s cross-fade of a 9 min 59.5 s project is refused with COPY-notice.length_full', async ({
    page,
  }) => {
    await twoPhotos(page);
    // Eleven clips of the one photo: 9 × 60 s, 60 s and 0.5 s, the first two joined by 1 s (599.5 s).
    const state = JSON.parse(await stateOf(page));
    const one = state.clips[0];
    const lengths = [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 0.5];
    state.clips = lengths.map((s, i) => ({
      ...one,
      id: `c${i}`,
      duration: s * S,
      crossFadeNext: i === 0 ? S : 0,
    }));
    await page.evaluate((j) => (window as unknown as Harness).appHarness.load(j), JSON.stringify(state));
    expect(await projectEnd(page)).toBe(599.5);
    const before = await stateOf(page);
    await settled(join(page));
    await join(page).click();
    await pop(page, 'action.remove_crossfade').click();
    await expect(page.locator('.tk-notice').filter({ hasText: text('en-US', 'notice.length_full') })).toBeVisible();
    expect(await stateOf(page)).toBe(before);
    await expect(popover(page)).toBeVisible();
  });

  test('F-009.AC8 F-009.R5 at 25 fps a 1 s cross-fade lasts exactly 25 frames; set to 0.3 s it lasts 8', async ({
    page,
  }) => {
    await twoPhotos(page);
    // A 25 fps project (F-012's control; set here as a whole project, one step).
    await page.evaluate(() => {
      const w = window as unknown as Harness;
      const s = JSON.parse(w.appHarness.state());
      s.frame.frameRate = 25;
      w.appHarness.load(JSON.stringify(s));
    });
    await addCrossFade(page);
    for (let i = 0; i < 5; i++) await pop(page, 'crossfade.longer').click();
    await expect(popover(page).locator('output')).toHaveText('1.0 s');
    const frames = async () => {
      const s = JSON.parse(await stateOf(page));
      return Math.round((s.clips[0].crossFadeNext * 25) / S);
    };
    expect(await frames()).toBe(25);
    for (let i = 0; i < 7; i++) await pop(page, 'crossfade.shorter').click();
    await expect(popover(page).locator('output')).toHaveText('0.3 s');
    expect(await frames()).toBe(8);
    // The project shortens by the overlap exactly: 10 s less 8 frames.
    expect(await projectEnd(page)).toBe(10 - 8 / 25);
  });

  test('F-009.AC9 F-009.R7 between a 0.1 s clip and a 5 s clip at 30 fps the chip is unavailable and says why; activating it adds nothing and shows COPY-notice.crossfade_too_short', async ({
    page,
    browserName,
  }) => {
    await twoPhotos(page, RED, BLUE, [0.1, 5]);
    const before = await stateOf(page);
    const steps = await stepsOf(page);
    await settled(join(page));
    await timeline(page).locator('.tk-track').hover();
    await expect(join(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(join(page)).toHaveAccessibleDescription(text('en-US', 'notice.crossfade_too_short'));
    await join(page).click({ force: true });
    await expect(
      page.locator('.tk-notice').filter({ hasText: text('en-US', 'notice.crossfade_too_short') }),
    ).toBeVisible();
    expect(await stateOf(page)).toBe(before);
    expect(await stepsOf(page)).toBe(steps);
    await expect(popover(page)).toHaveCount(0);
    if (browserName === 'chromium') await page.screenshot({ path: `${SHOTS}timeline-crossfade-too-short-en-US.png` });
  });

  test('F-009.R1 RULE-13 a Fade out slider movement is one step; the quick toggles set 0.5 s and turn the fade off', async ({
    page,
  }) => {
    await twoPhotos(page);
    await clipButton(page, 'A.png').click();
    const panel = inspector(page);
    const s = fadeSlider(panel, 'out');
    await settled(s);
    const steps = await stepsOf(page);
    const box = (await s.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 6, y);
    await page.mouse.down();
    for (const f of [0.2, 0.4, 0.6]) await page.mouse.move(box.x + 6 + f * (box.width - 12), y, { steps: 3 });
    await page.mouse.up();
    const v = Number(await s.inputValue());
    expect(v).toBeGreaterThan(10);
    expect(await stepsOf(page)).toBe(steps + 1);
    expect(JSON.parse(await stateOf(page)).clips[0].fadeOut).toBe(v * 100_000);
    // Quick fade out: on (any length) → off; off → 0.5 s.
    const quickOut = panel.getByRole('button', { name: text('en-US', 'fades.quick_out') });
    await expect(quickOut).toHaveAttribute('aria-pressed', 'true');
    await quickOut.click();
    await expect(quickOut).toHaveAttribute('aria-pressed', 'false');
    await expect(fadeField(panel, 'out')).toHaveValue('0.0');
    const quickIn = panel.getByRole('button', { name: text('en-US', 'fades.quick_in') });
    await quickIn.click();
    await expect(quickIn).toHaveAttribute('aria-pressed', 'true');
    await expect(fadeField(panel, 'in')).toHaveValue('0.5');
    expect(await stepsOf(page)).toBe(steps + 3);
    // RULE-10: 3 s at most; a typed 5 is reduced.
    await typeFade(panel, 'in', '5');
    await expect(fadeField(panel, 'in')).toHaveValue('3.0');
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-009 CMP-Timeline narrow NFR-06 the phone Edit sheet’s Cross-fade tile and Fades row at 320 px; axe passes (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      await add(page, [await photo(page, 'A.png', RED), await photo(page, 'B.png', BLUE)], 2, lang);
      await clipButton(page, 'A.png', lang).click();
      await page.getByRole('tab', { name: text(lang, 'inspector.edit') }).click();
      const sheet = page.locator('.tk-sheet');
      await expect(sheet).toBeVisible();
      // The Fades row: two toggles, each with its length.
      const fadeIn = sheet.getByRole('button', { name: new RegExp(`^${text(lang, 'fades.in')} `) });
      await expect(fadeIn).toHaveAttribute('aria-pressed', 'false');
      await fadeIn.click();
      await expect(fadeIn).toHaveAttribute('aria-pressed', 'true');
      await expect(fadeIn).toContainText(lang === 'vi-VN' ? '0,5 s' : '0.5 s');
      expect((await fadeIn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      // The Cross-fade tile adds 0.5 s after the selected clip and opens the popover.
      const tile = sheet.locator('[data-action="cross-fade"]');
      await expect(tile).toHaveAccessibleName(text(lang, 'action.add_crossfade'));
      await tile.click();
      await expect(popover(page, lang)).toBeVisible();
      await expect(popover(page, lang).locator('output')).toHaveText(lang === 'vi-VN' ? '0,5 s' : '0.5 s');
      expect((await clipsOf(page))[0]!.crossFade).toBe(0.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      await shot(page, `sheet-crossfade-narrow-${lang}`, browserName);
      await axe(page);
      await page.keyboard.press('Escape');
      await expect(popover(page, lang)).toHaveCount(0);
      await sheet.locator('[data-section="fades"]').scrollIntoViewIfNeeded();
      await shot(page, `sheet-fades-narrow-${lang}`, browserName);
      await axe(page);
    });

    test(`F-009 NFR-06 the Fades section, the join controls and the popover pass axe at 1280 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      await twoPhotos(page, RED, BLUE, [5, 5], lang);
      await clipButton(page, 'A.png', lang).click();
      const panel = inspector(page, lang);
      await typeFade(panel, 'in', lang === 'vi-VN' ? '0,5' : '0.5', lang);
      await expect(fadeField(panel, 'in', lang)).toHaveValue(lang === 'vi-VN' ? '0,5' : '0.5');
      await settled(join(page));
      // A clip next to the join is selected: the chip shows.
      await expect(join(page)).toHaveAttribute('data-near', '');
      await axe(page);
      await join(page).click();
      await join(page).click();
      await expect(popover(page, lang)).toBeVisible();
      await shot(page, `inspector-fades-popover-wide-${lang}`, browserName);
      await axe(page);
    });
  }
});

test.describe('F-009 export (media harness, real export workers)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
    await expect(page.locator('#out')).toHaveText('ready');
  });
  const run = (page: Page, spec: FadeSpec): Promise<FadeReport> =>
    page.evaluate((s) => window.harness.export.fadeExport(s), spec);

  test('F-009.AC1 INV-02 (export) a 1 s fade in: the exported frame is black at the start and 50 % ± 2 % at 0.5 s as the preview paints it; the sound 50 % ± 2 %', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const r = await run(page, {
      clips: [{ colour: AMBER, freq: 440, seconds: 2, fadeIn: 1 }],
      frames: [0, 15, 45],
      windows: [0.025, 0.5, 1.5].map((at) => ({ at, freq: 440 })),
    });
    expect(r.ok).toBe(true);
    const [start, half, full] = r.exported;
    expect(
      start!.every((v) => v <= 3),
      `start ${start}`,
    ).toBe(true);
    expect(shareOf(half!, AMBER, 0.5, 0.02), `half ${half}`).toBe(true);
    expect(shareOf(full!, AMBER, 1, 0.02), `full ${full}`).toBe(true);
    // INV-02: the file shows what the preview paints, within the encoder's rounding.
    r.exported.forEach((c, i) => c.forEach((v, j) => expect(Math.abs(v - r.painted[i]![j]!)).toBeLessThanOrEqual(3)));
    const [a0, a5, a15] = r.heard as [number, number, number];
    expect(a15).toBeGreaterThan(0.2);
    expect(a0 / a15).toBeLessThan(0.05);
    expect(Math.abs(a5 / a15 - 0.5)).toBeLessThanOrEqual(0.02);
  });

  test('F-009.AC2 F-009.AC7 INV-02 (export) a 1 s cross-fade: 9 s, the middle second blends A into B in picture and sound, A’s fade out not applied', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const r = await run(page, {
      clips: [
        { colour: RED, freq: 440, seconds: 5, fadeOut: 1, crossFade: 1 },
        { colour: BLUE, freq: 660, seconds: 5 },
      ],
      frames: [105, 135, 150],
      windows: [3.5, 4.5, 5.5].flatMap((at) => [
        { at, freq: 440 },
        { at, freq: 660 },
      ]),
    });
    expect(r.ok).toBe(true);
    expect(r.pictureSeconds).toBeCloseTo(9, 1);
    expect(r.soundSeconds).toBeCloseTo(9, 1);
    const [a, mid, b] = r.exported;
    expect(blendOf(a!, RED, BLUE, 0, 5), `A ${a}`).toBe(true);
    expect(blendOf(mid!, RED, BLUE, 0.5, 6), `middle ${mid}`).toBe(true);
    expect(blendOf(b!, RED, BLUE, 1, 5), `B ${b}`).toBe(true);
    r.exported.forEach((c, i) => c.forEach((v, j) => expect(Math.abs(v - r.painted[i]![j]!)).toBeLessThanOrEqual(3)));
    const [a35, b35, a45, b45, a55, b55] = r.heard as number[];
    expect(a35!).toBeGreaterThan(0.2);
    expect(b35! / a35!).toBeLessThan(0.02);
    expect(Math.abs(a45! / a35! - Math.SQRT1_2)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(b45! / a35! - Math.SQRT1_2)).toBeLessThanOrEqual(0.03);
    expect(a55! / a35!).toBeLessThan(0.02);
    expect(Math.abs(b55! / a35! - 1)).toBeLessThanOrEqual(0.03);
  });

  test('F-009.AC4 (export) an audio clip with a 2 s fade out falls to silence over its last 2 s in the decoded export', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const r = await run(page, {
      clips: [{ colour: AMBER, freq: 1000, seconds: 4 }],
      audio: { freq: 440, start: 0, seconds: 4, fadeOut: 2 },
      frames: [0],
      windows: [1, 2.5, 3, 3.5, 3.97].map((at) => ({ at, freq: 440 })),
    });
    expect(r.ok).toBe(true);
    const [full, a, b, c, end] = r.heard as number[];
    expect(full!).toBeGreaterThan(0.2);
    expect(Math.abs(a! / full! - 0.75)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(b! / full! - 0.5)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(c! / full! - 0.25)).toBeLessThanOrEqual(0.02);
    expect(end! / full!).toBeLessThan(0.03);
  });
});
