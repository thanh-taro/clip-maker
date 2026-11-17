// F-004 trimming and splitting through the real UI (MOD-App + MOD-Timeline, real decoders) on the app
// harness (tests/harness/app.html): Split, Start here and End here in the timeline's toolbar and the phone
// Edit sheet, the RULE-20 keys (S, I, O), the trim handles with their readout and RULE-14 snap line, a
// trim drag as one undo step, on touch without a hold, and axe at 320 and 1280 px in en-US and vi-VN.
// F-004.AC7's preview and export halves run on the media harness (tests/harness/video.ts engineSeeks,
// tests/harness/export.ts run) with a frame-coded clip. Settings with no control yet (photo length,
// cross-fade F-009) are set through `appHarness.setClip()`, an audio clip and a text layer through
// `appHarness.load()`, the playhead through `appHarness.setPlayhead()` (F-002 binding). Text layers have
// no lane until F-010, so their trim and split (F-004.AC5's text half) are tested in app.trim.test.ts.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import { BUNDLED_MUSIC } from '../../src/core/music.gen';
import type { ClipSetup, ClipSummary, ProjectSummary } from '../harness/app';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const MEDIA = `http://localhost:${MEDIA_HARNESS_PORT}/`;
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
    setClip(index: number, setup: ClipSetup): void;
    setPlayhead(seconds: number): void;
    state(): string;
    load(json: string): void;
    codedClip(rate: number, frames: number): Promise<number[]>;
    preview(): { playhead: number };
  };
}
interface Doc {
  clips: { in?: number; out?: number; crossFadeNext: number }[];
  textLayers: { start: number; end: number }[];
  audioClips: { start: number; in: number; out: number }[];
}
const h = (page: Page) => page.evaluate.bind(page) as Page['evaluate'];
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const stepsOf = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as Harness).appHarness.project())).steps;
const docOf = async (page: Page): Promise<Doc> =>
  JSON.parse(await page.evaluate(() => (window as unknown as Harness).appHarness.state())) as Doc;
const setClip = (page: Page, index: number, setup: ClipSetup) =>
  page.evaluate(([i, s]) => (window as unknown as Harness).appHarness.setClip(i, s), [index, setup] as const);
const at = (page: Page, seconds: number) =>
  page.evaluate((s) => (window as unknown as Harness).appHarness.setPlayhead(s), seconds);
const ends = async (page: Page) => (await clipsOf(page)).map((c) => [c.start, c.end]);

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

/** Two photos, A (`a` s) and B (`b` s). */
async function photos(page: Page, a: number, b: number, lang: Language = 'en-US'): Promise<void> {
  await add(page, [photo('A.png'), photo('B.png')], lang);
  await setClip(page, 0, { seconds: a });
  await setClip(page, 1, { seconds: b });
}

/** Puts audio clips (of a bundled track) and text layers at [start, end] seconds in place, as one step. */
async function place(
  page: Page,
  audio: readonly (readonly [number, number])[],
  texts: readonly (readonly [number, number])[] = [],
): Promise<void> {
  const state = JSON.parse(await page.evaluate(() => (window as unknown as Harness).appHarness.state())) as object;
  const audioClips = audio.map(([a, b], i) => ({
    id: `music-${i}`,
    sourceId: BUNDLED_MUSIC[0]!.id,
    start: a * S,
    in: 0,
    out: (b - a) * S,
    volume: 100,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  }));
  const textLayers = texts.map(([a, b], i) => ({
    id: `text-${i}`,
    content: 'Hi',
    start: a * S,
    end: b * S,
    typeface: 'sans',
    size: 6,
    colour: 'white',
    style: 'outline',
    align: 'centre',
    x: 0.5,
    y: 0.8,
    fade: false,
  }));
  await h(page)(
    (json) => (window as unknown as Harness).appHarness.load(json),
    JSON.stringify({ ...state, audioClips, textLayers }),
  );
}

const timeline = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('region', { name: text(lang, 'timeline.label') });
const clip = (page: Page, name: string, nth = 0, lang: Language = 'en-US'): Locator =>
  timeline(page, lang)
    .getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')} \\d:\\d\\d$`) })
    .nth(nth);
const tool = (page: Page, id: CopyId, lang: Language = 'en-US') =>
  timeline(page, lang)
    .getByRole('toolbar')
    .getByRole('button', { name: text(lang, id) });
const notice = (page: Page, tag: string) => page.locator(`[data-notice="${tag}"]`);
const handle = (page: Page, edge: 'start' | 'end', lang: Language = 'en-US') =>
  timeline(page, lang).locator(`.tk-trim--${edge}`);

/** Waits until a locator's box stops moving (the track's layout has settled). */
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

/** Pixels per second of the timeline (the track fits the project). */
async function pxPerSecond(page: Page): Promise<number> {
  const track = (await timeline(page).locator('.tk-track').boundingBox())!;
  const last = (await clipsOf(page)).at(-1)!.end;
  return track.width / last;
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

test.describe('F-004 trim and split (app harness)', () => {
  test('F-004.AC1 a 20 s video’s start trimmed by 5 s (Start here) is 15 s from source 5 s; the next clip moves 5 s earlier', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await open(page);
    const bytes = await page.evaluate(() => (window as unknown as Harness).appHarness.codedClip(30, 600));
    await add(page, [{ name: 'A.mp4', mimeType: 'video/mp4', buffer: Buffer.from(bytes) }, photo('B.png')]);
    expect(await ends(page)).toEqual([
      [0, 20],
      [20, 23],
    ]);
    // Without a selection only Split is available (CMP-Timeline "wide / default").
    await expect(tool(page, 'action.set_in')).toHaveAttribute('aria-disabled', 'true');
    await expect(tool(page, 'action.split')).not.toHaveAttribute('aria-disabled', 'true');
    await clip(page, 'A.mp4').click();
    await at(page, 5);
    await expect(tool(page, 'action.set_in')).not.toHaveAttribute('aria-disabled', 'true');
    await tool(page, 'action.set_in').click();
    expect(await ends(page)).toEqual([
      [0, 15],
      [15, 18],
    ]);
    expect((await docOf(page)).clips[0]!.in).toBe(5 * S);
    expect(await stepsOf(page)).toBe(2);
  });

  test('F-004.AC2 dragging the end of a clip at its source end further does not grow it, and leaves no step', async ({
    page,
  }) => {
    await open(page);
    // A new video clip uses its whole source (2.069 s: 62 frames at 30 fps).
    await add(page, [video('A.mp4'), photo('B.png')]);
    const before = await ends(page);
    expect(before[0]).toEqual([0, 2.067]);
    await clip(page, 'A.mp4').click();
    const end = handle(page, 'end');
    await expect(end).toBeVisible();
    await settled(end);
    const b = (await end.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 120, b.y + b.height / 2, { steps: 6 });
    await page.mouse.up();
    expect(await ends(page)).toEqual(before);
    expect(await stepsOf(page)).toBe(1);
  });

  test('F-004.AC3 Split at 4 s of a 10 s clip gives 4 s and 6 s clips; the cross-fade into the next stays on the second', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 10, 3);
    await setClip(page, 0, { crossFadeTenths: 10 });
    await at(page, 4);
    // Nothing selected: Split acts on the main-track clip under the playhead.
    await tool(page, 'action.split').click();
    const clips = await clipsOf(page);
    expect(clips.map((c) => [c.source, c.start, c.end, c.crossFade])).toEqual([
      ['A.png', 0, 4, 0],
      ['A.png', 4, 10, 1],
      ['B.png', 9, 12, 0],
    ]);
    await expect(clip(page, 'A.png', 1)).toHaveAccessibleName('A.png 0:06');
  });

  test('F-004.AC4 with the playhead 2 frames from a clip’s start, Split changes nothing and shows COPY-notice.split_too_close', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 3, 3);
    await clip(page, 'B.png').click();
    const before = await stepsOf(page);
    await at(page, 3 + 2 / 30);
    await tool(page, 'action.split').click();
    await expect(notice(page, 'split_too_close')).toHaveText(text('en-US', 'notice.split_too_close'));
    expect(await clipsOf(page)).toHaveLength(2);
    expect(await stepsOf(page)).toBe(before);
  });

  test('F-004.AC5 an audio clip at 2–10 s whose start is set to 4 s is 4–10 s with a gap at 2–4 s (audio half; the text half: app.trim.test.ts)', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 12, 3);
    await place(page, [[2, 10]]);
    await page.locator('.tk-aclip').first().click();
    await at(page, 4);
    await tool(page, 'action.set_in').click();
    const a = (await docOf(page)).audioClips[0]!;
    expect([a.start / S, (a.start + a.out - a.in) / S]).toEqual([4, 10]);
    // Split works on the selected audio clip too.
    await at(page, 7);
    await page.keyboard.press('KeyS');
    expect((await docOf(page)).audioClips.map((x) => [x.start / S, (x.start + x.out - x.in) / S])).toEqual([
      [4, 7],
      [7, 10],
    ]);
  });

  test('F-004.AC6 with snapping on, an end dragged within 8 px of the playhead snaps to it with the snap line, and the length readout follows', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 10, 2);
    await at(page, 6);
    await clip(page, 'A.png').click();
    const end = handle(page, 'end');
    await settled(end);
    const px = await pxPerSecond(page);
    const b = (await end.boundingBox())!;
    const track = (await timeline(page).locator('.tk-track').boundingBox())!;
    // The end edge is at the handle's right side; aim 5 px past the playhead (6 s).
    const grab = b.x + b.width - 2;
    await page.mouse.move(grab, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(grab - 2 * px, b.y + b.height / 2, { steps: 4 });
    await expect(timeline(page).locator('.tk-snap')).toBeHidden();
    await expect(timeline(page).locator('.tk-trim-readout')).toContainText(
      text('en-US', 'timeline.length').replace('{length}', '0:08'),
    );
    await page.mouse.move(grab - 4 * px + 5, b.y + b.height / 2, { steps: 4 });
    await expect(timeline(page).locator('.tk-snap')).toBeVisible();
    const line = (await timeline(page).locator('.tk-snap').boundingBox())!;
    expect(Math.abs(line.x - (track.x + 6 * px))).toBeLessThan(2);
    const readout = timeline(page).locator('.tk-trim-readout');
    await expect(readout).toContainText(text('en-US', 'timeline.length').replace('{length}', '0:06'));
    await expect(readout).toContainText(text('en-US', 'timeline.ends_at').replace('{time}', '0:06'));
    await page.mouse.up();
    await expect(readout).toBeHidden();
    expect((await ends(page))[0]).toEqual([0, 6]);
  });

  test('F-004.AC7 a 30 fps clip’s in point set at source frame 91 (Start here at 3.033 s) stores source time 3.033 s', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await open(page);
    const bytes = await page.evaluate(() => (window as unknown as Harness).appHarness.codedClip(30, 150));
    await add(page, [{ name: 'coded.mp4', mimeType: 'video/mp4', buffer: Buffer.from(bytes) }]);
    await clip(page, 'coded.mp4').click();
    await at(page, 91 / 30);
    await page.keyboard.press('KeyI');
    // Frame 91 starts at floor(91 × 10⁶ / 30) µs (rules.md "Frame times").
    expect((await docOf(page)).clips[0]!.in).toBe(Math.floor((91 * S) / 30));
  });

  test('F-004.AC8 by keyboard only the selected clip’s in and out points are set at the playhead (I, O and the visible controls)', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await photos(page, 10, 3);
    const steps = await stepsOf(page);
    await clip(page, 'A.png').focus();
    await page.keyboard.press('Enter');
    await expect(clip(page, 'A.png')).toHaveAttribute('aria-pressed', 'true');
    // Shift+Right moves the playhead 1 s (RULE-20); I starts the clip here.
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('KeyI');
    expect((await ends(page))[0]).toEqual([0, 8]);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('KeyO');
    expect((await ends(page))[0]).toEqual([0, 5]);
    // The visible End here does the same, focused and activated by a key.
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await tool(page, 'action.set_out').focus();
    await page.keyboard.press(browserName === 'webkit' ? 'Space' : 'Enter');
    expect((await ends(page))[0]).toEqual([0, 2]);
    // Three edits, three steps (selecting and moving the playhead are none).
    expect(await stepsOf(page)).toBe(steps + 3);
  });

  test('F-004.AC9 a 4 s clip with a 1.5 s cross-fade trimmed to 2 s keeps a 1 s cross-fade; trimmed to 5 frames it has none', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 4, 4);
    await setClip(page, 0, { crossFadeTenths: 15 });
    await clip(page, 'A.png').click();
    await at(page, 2);
    await tool(page, 'action.set_out').click();
    expect((await clipsOf(page))[0]!.crossFade).toBe(1);
    await page.keyboard.press('ControlOrMeta+KeyZ');
    expect((await clipsOf(page))[0]!.crossFade).toBe(1.5);
    await at(page, 5 / 30);
    await tool(page, 'action.set_out').click();
    const clips = await clipsOf(page);
    expect(clips[0]!.crossFade).toBe(0);
    expect(clips[0]!.end).toBeCloseTo(5 / 30, 3);
    await expect(timeline(page).locator('.tk-xfade')).toHaveCount(0);
  });

  test('F-004.AC10 trimming A’s start by 2 s leaves a text layer at 6–8 s and an audio clip at 6–10 s where they were', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 5, 6);
    await place(page, [[6, 10]], [[6, 8]]);
    await clip(page, 'A.png').click();
    // A photo's start trim shortens it: Start here at 2 s.
    await at(page, 2);
    await tool(page, 'action.set_in').click();
    expect(await ends(page)).toEqual([
      [0, 3],
      [3, 9],
    ]);
    const doc = await docOf(page);
    expect(doc.textLayers.map((t) => [t.start / S, t.end / S])).toEqual([[6, 8]]);
    expect(doc.audioClips.map((a) => [a.start / S, (a.start + a.out - a.in) / S])).toEqual([[6, 10]]);
  });

  test('F-004.R1 RULE-13 a trim drag is one undo step; Esc gives it back; undo mid-drag ends it with nothing more changed', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await photos(page, 10, 2);
    await clip(page, 'A.png').click();
    const end = handle(page, 'end');
    await settled(end);
    const px = await pxPerSecond(page);
    const b = (await end.boundingBox())!;
    const y = b.y + b.height / 2;
    const grab = b.x + b.width / 2;
    const before = await stepsOf(page);
    // A drag through several moves: one step.
    await page.mouse.move(grab, y);
    await page.mouse.down();
    for (const s of [1, 2, 3]) await page.mouse.move(grab - s * px, y, { steps: 2 });
    await page.mouse.up();
    expect((await ends(page))[0]).toEqual([0, 7]);
    expect(await stepsOf(page)).toBe(before + 1);
    // Esc during a drag puts the edge back: no step.
    await settled(end);
    const b2 = (await end.boundingBox())!;
    await page.mouse.move(b2.x + b2.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.width / 2 - 2 * px, y, { steps: 4 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect((await ends(page))[0]).toEqual([0, 7]);
    expect(await stepsOf(page)).toBe(before + 1);
    // Undo during a drag ends it: the restored project stays, later moves trim nothing.
    await page.mouse.move(b2.x + b2.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.width / 2 - px, y, { steps: 3 });
    await page.keyboard.press(`${browserName === 'webkit' ? 'Meta' : 'ControlOrMeta'}+KeyZ`);
    await page.mouse.move(b2.x + b2.width / 2 - 3 * px, y, { steps: 3 });
    await page.mouse.up();
    expect((await ends(page))[0]).toEqual([0, 7]);
    expect(await stepsOf(page)).toBe(before + 1);
  });

  test('F-004.R3 an audio clip’s end handle trims it on the audio lane; a release outside the timeline ends the drag', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 12, 3);
    await place(page, [[2, 10]]);
    await page.locator('.tk-aclip').first().click();
    const end = handle(page, 'end');
    await expect(end).toBeVisible();
    await settled(end);
    const px = await pxPerSecond(page);
    const b = (await end.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 3 * px, b.y + b.height / 2, { steps: 6 });
    // Released far above, over the preview.
    await page.mouse.move(b.x - 3 * px, 80, { steps: 3 });
    await page.mouse.up();
    await expect(timeline(page).locator('.tk-trim-readout')).toBeHidden();
    const a = (await docOf(page)).audioClips[0]!;
    expect(a.start).toBe(2 * S);
    expect(Math.abs((a.start + a.out - a.in) / S - 7)).toBeLessThan(0.1);
    // Moving afterwards with no button down trims nothing.
    const after = await docOf(page);
    await page.mouse.move(b.x, b.y + b.height / 2, { steps: 4 });
    expect(await docOf(page)).toEqual(after);
  });

  test('F-004.R1 a trimmed start dragged back left past the clip’s start (and 0) brings the head back: the in point returns to 0', async ({
    page,
  }) => {
    await open(page);
    // A photo, then the 2.069 s video: the video's start is trimmed by 1 s (Start here), then its start
    // handle is dragged far left, past the photo and 0: the clip stays where it is and its head comes back
    // up to the source's start.
    await add(page, [photo('A.png'), video('V.mp4')]);
    await clip(page, 'V.mp4').click();
    const vStart = (await clipsOf(page))[1]!.start;
    await at(page, vStart + 1);
    await tool(page, 'action.set_in').click();
    expect((await docOf(page)).clips[1]!.in).toBe(S);
    const start = handle(page, 'start');
    await settled(start);
    const b = (await start.boundingBox())!;
    const y = b.y + b.height / 2;
    const steps = await stepsOf(page);
    await page.mouse.move(b.x + b.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(b.x - 600, y, { steps: 8 });
    await page.mouse.up();
    expect((await docOf(page)).clips[1]!.in).toBe(0);
    expect((await clipsOf(page))[1]!.start).toBe(vStart);
    expect(await stepsOf(page)).toBe(steps + 1);
  });

  test('F-004.R2 with a selected item and the playhead outside it, Split is unavailable and does nothing', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 4, 3);
    await clip(page, 'B.png').click();
    await at(page, 2);
    await expect(tool(page, 'action.split')).toHaveAttribute('aria-disabled', 'true');
    const steps = await stepsOf(page);
    await page.keyboard.press('KeyS');
    await tool(page, 'action.split').click({ force: true });
    await expect(notice(page, 'split_too_close')).toHaveCount(0);
    expect(await clipsOf(page)).toHaveLength(2);
    expect(await stepsOf(page)).toBe(steps);
    await at(page, 5);
    await expect(tool(page, 'action.split')).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('F-004.R1 a cancelled pointer (pointercancel) gives the edge back: no trim, no step', async ({ page }) => {
    await open(page);
    await photos(page, 10, 2);
    await clip(page, 'A.png').click();
    const end = handle(page, 'end');
    await settled(end);
    const px = await pxPerSecond(page);
    const b = (await end.boundingBox())!;
    const steps = await stepsOf(page);
    const before = await ends(page);
    const moved = await page.evaluate(
      async ({ x, y, dx }) => {
        const target = document.elementFromPoint(x, y) ?? document.body;
        const fire = (el: EventTarget, type: string, cx: number) =>
          el.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 11,
              pointerType: 'touch',
              clientX: cx,
              clientY: y,
              isPrimary: true,
              button: 0,
            }),
          );
        fire(target, 'pointerdown', x);
        for (let i = 1; i <= 6; i++) fire(target, 'pointermove', x - (dx * i) / 6);
        await new Promise((r) => setTimeout(r, 50));
        const during = (window as unknown as Harness).appHarness.clips()[0]!.end;
        fire(window, 'pointercancel', x - dx);
        return during;
      },
      { x: b.x + b.width / 2, y: b.y + b.height / 2, dx: 3 * px },
    );
    // The drag did trim while it lasted, then the cancel put it back.
    expect(moved).toBeLessThan(before[0]![1]!);
    expect(await ends(page)).toEqual(before);
    expect(await stepsOf(page)).toBe(steps);
  });

  test('RULE-21 on touch a trim handle’s drag trims at once, with no hold', async ({
    browser,
    browserName,
    page: plain,
  }) => {
    if (browserName === 'chromium') {
      const context = await browser.newContext({ hasTouch: true, viewport: { width: 1000, height: 700 } });
      const page = await context.newPage();
      await open(page);
      await photos(page, 10, 2);
      await clip(page, 'A.png').click();
      const end = handle(page, 'end');
      await settled(end);
      const px = await pxPerSecond(page);
      const b = (await end.boundingBox())!;
      const cdp = await context.newCDPSession(page);
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x - (3 * px * i) / 8, y, id: 1 }],
        });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(async () => (await ends(page))[0]![1]).toBeCloseTo(7, 0);
      await context.close();
      return;
    }
    // WebKit: synthetic touch pointer events (no touch input for desktop WebKit in Playwright).
    const page = plain;
    await open(page);
    await photos(page, 10, 2);
    await clip(page, 'A.png').click();
    const end = handle(page, 'end');
    await settled(end);
    const px = await pxPerSecond(page);
    const b = (await end.boundingBox())!;
    await page.evaluate(
      ({ x, y, dx }) => {
        const target = document.elementFromPoint(x, y) ?? document.body;
        const fire = (type: string, cx: number) =>
          target.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 9,
              pointerType: 'touch',
              clientX: cx,
              clientY: y,
              isPrimary: true,
              button: 0,
            }),
          );
        fire('pointerdown', x);
        for (let i = 1; i <= 6; i++) fire('pointermove', x - (dx * i) / 6);
        window.dispatchEvent(
          new PointerEvent('pointerup', { bubbles: true, pointerId: 9, pointerType: 'touch', clientX: x - dx }),
        );
      },
      { x: b.x + b.width / 2, y: b.y + b.height / 2, dx: 3 * px },
    );
    await expect.poll(async () => (await ends(page))[0]![1]).toBeCloseTo(7, 0);
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-004.R6 NFR-06 the toolbar’s Split, Start here and End here and the trim handles pass axe at 1280 px (${lang})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, lang);
      await photos(page, 6, 3, lang);
      // Toolbar order (CMP-Timeline "wide / default"): Split, Start here, End here, then the arrange actions.
      const names = await timeline(page, lang).getByRole('toolbar').getByRole('button').allTextContents();
      expect(names.slice(0, 4)).toEqual(
        (['action.split', 'action.set_in', 'action.set_out', 'action.delete'] as const).map((id) => text(lang, id)),
      );
      await clip(page, 'A.png', 0, lang).click();
      await at(page, 2);
      await expect(handle(page, 'start', lang)).toBeVisible();
      await axe(page);
      await tool(page, 'action.set_in', lang).click();
      expect((await ends(page))[0]).toEqual([0, 4]);
    });

    test(`F-004.R6 NFR-06 the phone Edit sheet’s Split, Start here and End here tiles work and pass axe at 320 px (${lang})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      await photos(page, 6, 3, lang);
      await clip(page, 'A.png', 0, lang).click();
      await page.getByRole('tab', { name: text(lang, 'inspector.edit') }).click();
      const sheet = page.getByRole('tabpanel', { name: text(lang, 'inspector.edit') });
      await expect(sheet).toBeVisible();
      // The first row: Split, Start here, End here, Cross-fade (F-009); the arrange tiles start the second row.
      const tiles = sheet.locator('.tk-tile');
      await expect(tiles).toHaveCount(8);
      const first = (await tiles.nth(0).boundingBox())!;
      const fourth = (await tiles.nth(3).boundingBox())!;
      const fifth = (await tiles.nth(4).boundingBox())!;
      expect(fourth.y).toBeCloseTo(first.y, 0);
      expect(fifth.y).toBeGreaterThan(first.y + first.height - 1);
      expect(fifth.x).toBeCloseTo(first.x, 0);
      await at(page, 4);
      await axe(page);
      await sheet.getByRole('button', { name: text(lang, 'action.set_out') }).click();
      expect((await ends(page))[0]).toEqual([0, 4]);
      await at(page, 1);
      await sheet.getByRole('button', { name: text(lang, 'action.split') }).click();
      expect(await clipsOf(page)).toHaveLength(3);
      for (const b of await tiles.all()) {
        const box = (await b.boundingBox())!;
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      }
    });
  }
});

test.describe('F-004 frame accuracy (media harness)', () => {
  test('F-004.AC7 INV-02 a clip whose in point is source frame 91 starts on source frame 91 in the preview and in the export', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(MEDIA);
    await expect(page.locator('#out')).toHaveText('ready');
    const inPoint = Math.floor((91 * S) / 30);
    const preview = await page.evaluate(
      (ip) => window.harness.video.engineSeeks({ rate: 30, frames: 150, gop: 30 }, [0, 33_333], 30, ip),
      inPoint,
    );
    expect(preview.codes).toEqual([91, 92]);
    const exported = await page.evaluate(
      (ip) =>
        window.harness.export.run({
          frames: 150,
          settings: { kind: 'video', resolution: 480, quality: 'balanced' },
          sound: false,
          inPoint: ip,
        }),
      inPoint,
    );
    expect(exported.result.ok, JSON.stringify(exported.result)).toBe(true);
    const first = exported.file!.frames.find((f) => f.k === 0)!;
    expect(first.code).toBe(91);
    expect(exported.file!.frames.find((f) => f.k === 1)!.code).toBe(92);
  });
});
