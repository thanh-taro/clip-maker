// F-002 play and scrub the preview through the real UI (CMP-Preview's transport, RULE-20 keys, full
// screen) on the app harness (tests/harness/app.html: the real `main()` and workers under the dev
// server). The harness reads the playback state, moves MOD-Project's playhead as F-003's timeline will
// (the playhead binding), and with ?tap=1 records the blocks the audio worker sends the worklet, so the
// sound the preview plays is checked sample-exact: a clip made in the page with a tone in its sound track
// is decoded by MOD-Audio (ADR-0008 §6, build questions 33 and 76, resolved by E6).
// Not covered here: AC1 (looks, cross-fades and text: F-008, F-009, F-010), AC4/AC8's ruler drag and touch
// scroll (the timeline view, F-003/F-013; the binding they use is tested below), AC6 (export, F-015).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { HeardSummary, PreviewSummary, SyncSummary } from '../harness/app';
import type { ToneSpec } from '../harness/sound';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const text = (lang: Language, id: keyof (typeof CATALOG)['en-US']): string => CATALOG[lang][id] as string;
const FRAME = 1 / 30;

interface Harness {
  appHarness: {
    preview(): PreviewSummary;
    setPlayhead(s: number): void;
    scrub(frames: number[]): Promise<number[]>;
    feedTone(sourceName: string, seconds: number): void;
    sync(): Promise<SyncSummary>;
    toneClip(spec: ToneSpec): Promise<number[]>;
    heard(spec: ToneSpec, hashed: number): HeardSummary;
  };
}

/** A 3 s clip whose sound is silence, then a 440 Hz tone from 1.000 s (AAC in MP4, priming in an edit list). */
const TONE: ToneSpec = { seconds: 3, onset: 1, freq: 440, amp: 0.25, codec: 'aac', sampleRate: 48_000 };
/** Half the tone's amplitude is reached 1/12 of a period after the onset. */
const HALF = 1 / 12 / 440;

/** Makes the tone clip in the page and adds it through Add media; returns the project length (s). */
async function addToneClip(page: Page): Promise<number> {
  const bytes = await page.evaluate((s) => (window as unknown as Harness).appHarness.toneClip(s), TONE);
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('main')
    .getByRole('button', { name: text('en-US', 'action.add_media') })
    .click();
  await (await chooser).setFiles({ name: 'tone.mp4', mimeType: 'video/mp4', buffer: Buffer.from(bytes) });
  await expect.poll(async () => (await previewOf(page)).duration).toBeGreaterThan(2.9);
  await page
    .getByRole('complementary')
    .getByRole('button', { name: text('en-US', 'action.close') })
    .click();
  await expect.poll(async () => (await previewOf(page)).shown?.exact).toBe(true);
  return (await previewOf(page)).duration;
}

/**
 * While playing: the worklet's stats once it has played over 1 s (its hash restarts at the flush that
 * ends playback, so it is read before the end).
 */
async function playedStats(page: Page): Promise<SyncSummary> {
  let s: SyncSummary | null = null;
  await expect
    .poll(async () => {
      s = await page.evaluate(() => (window as unknown as Harness).appHarness.sync());
      return s.hashed;
    })
    .toBeGreaterThan(48_000);
  return s!;
}
const previewOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.preview());
const setPlayhead = (page: Page, s: number) =>
  page.evaluate((v) => (window as unknown as Harness).appHarness.setPlayhead(v), s);

/** The 2.07 s, 30 fps, 320 × 240 H.264/AAC fixture (62 frames on a 30 fps project). */
const video = (name: string) => ({
  name,
  mimeType: 'video/mp4',
  buffer: readFileSync(fileURLToPath(new URL('../fixtures/media/mp4-faststart.mp4', import.meta.url))),
});
const END = 62 * FRAME;

async function open(page: Page, query = 'effects=fast&lang=en-US'): Promise<void> {
  await page.goto(`${APP}?${query}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
  await expect.poll(async () => (await previewOf(page)).mounted).toBe(true);
}

/** Adds clips through Add media and the file picker, then closes the media panel. */
async function addClips(page: Page, names: string[] = ['phone.mp4']): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('main')
    .getByRole('button', { name: text('en-US', 'action.add_media') })
    .click();
  await (await chooser).setFiles(names.map(video));
  await expect.poll(async () => (await previewOf(page)).duration).toBeCloseTo(END * names.length, 3);
  await page
    .getByRole('complementary')
    .getByRole('button', { name: text('en-US', 'action.close') })
    .click();
  await expect.poll(async () => (await previewOf(page)).shown?.exact).toBe(true);
}

const transport = (page: Page) => page.locator('.tk-transport');
const button = (page: Page, id: Parameters<typeof text>[1], lang: Language = 'en-US') =>
  transport(page).getByRole('button', { name: text(lang, id), exact: true });
const now = (page: Page) => transport(page).locator('.tk-time__now');
const frameNo = (page: Page) => transport(page).locator('.tk-time__frame');

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

test.describe('F-002 preview playback (app harness)', () => {
  test('F-002.R5 the transport shows m:ss, the frame number and the length; with an empty project it is unavailable at 0:00', async ({
    page,
  }) => {
    await open(page);
    for (const id of [
      'action.go_start',
      'action.prev_frame',
      'action.play',
      'action.next_frame',
      'action.go_end',
    ] as const)
      await expect(button(page, id)).toBeDisabled();
    await expect(button(page, 'action.full_screen')).toBeDisabled();
    await expect(transport(page)).toContainText('0:00·00 / 0:00');

    await addClips(page);
    await expect(button(page, 'action.play')).toBeEnabled();
    await expect(transport(page)).toContainText('0:00·00 / 0:02');
    // The frame is an image named COPY-preview.label with the current time.
    await expect(page.getByRole('img', { name: 'Preview at 0:00' })).toBeVisible();
    await axe(page);
  });

  test('F-002.AC5 at 2.000 s at 30 fps, Next frame moves to 2 s + 1 frame and the time shows 0:02 ·01', async ({
    page,
  }) => {
    await open(page);
    await addClips(page);
    await setPlayhead(page, 2);
    await expect(now(page)).toHaveText('0:02');
    await expect(frameNo(page)).toHaveText('·00');

    await button(page, 'action.next_frame').click();
    await expect(frameNo(page)).toHaveText('·01');
    await expect(now(page)).toHaveText('0:02');
    const p = await previewOf(page);
    expect(p.time).toBeCloseTo(2 + FRAME, 5);
    expect(p.playhead).toBeCloseTo(2 + FRAME, 5); // MOD-Project's playhead follows (F-003 binding)
    await expect.poll(async () => (await previewOf(page)).shown?.frameIndex).toBe(61);

    await button(page, 'action.prev_frame').click();
    await expect(frameNo(page)).toHaveText('·00');
  });

  test('F-002.R4 RULE-20 Left/Right step a frame, Shift a second, Home/End and the buttons go to the start and end', async ({
    page,
  }) => {
    await open(page);
    await addClips(page, ['a.mp4', 'b.mp4']);
    await page.getByRole('main').click({ position: { x: 5, y: 5 } }); // focus in the tool, not on a control
    await page.keyboard.press('ArrowRight');
    await expect(frameNo(page)).toHaveText('·01');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(now(page)).toHaveText('0:01');
    await expect(frameNo(page)).toHaveText('·01');
    await page.keyboard.press('ArrowLeft');
    await expect(frameNo(page)).toHaveText('·00');
    await page.keyboard.press('End');
    await expect(transport(page)).toContainText('0:04·04 / 0:04');
    await page.keyboard.press('Home');
    await expect(transport(page)).toContainText('0:00·00 / 0:04');

    await button(page, 'action.go_end').click();
    expect((await previewOf(page)).time).toBeCloseTo(2 * END, 5);
    await button(page, 'action.go_start').click();
    expect((await previewOf(page)).time).toBe(0);
  });

  test('F-002.R2 play runs from the playhead and stops at the project end; Play at the end starts from 0', async ({
    page,
  }) => {
    await open(page);
    await addClips(page, ['a.mp4', 'b.mp4', 'c.mp4']);
    // From the playhead, with 6 s ahead, so the playing checks never race the end.
    await button(page, 'action.play').click();
    const started = await previewOf(page);
    expect(started.state).toBe('playing');
    expect(started.time).toBeLessThan(0.5);
    await expect(button(page, 'action.pause')).toBeVisible();
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-state', 'playing');
    await button(page, 'action.pause').click();

    // Near the end: play stops at the project end, on the end.
    await setPlayhead(page, 3 * END - 0.3);
    await button(page, 'action.play').click();
    expect((await previewOf(page)).time).toBeGreaterThanOrEqual(3 * END - 0.3 - 1e-6);
    await expect(button(page, 'action.play')).toBeVisible({ timeout: 5000 });
    const ended = await previewOf(page);
    expect(ended.state).toBe('paused');
    expect(ended.time).toBeCloseTo(3 * END, 5);
    await expect(transport(page)).toContainText('0:06·06 / 0:06');
    // The time is announced politely when playback stops (CMP-Preview accessibility).
    await expect(page.locator('.tk-preview-status')).toHaveText('0:06 / 0:06');

    // Edge case: Play at the project end starts from 0.
    await button(page, 'action.play').click();
    expect((await previewOf(page)).time).toBeLessThan(0.5);
    await button(page, 'action.pause').click();
  });

  test('F-002.AC3 pausing keeps the playhead on the paused frame', async ({ page }) => {
    await open(page);
    await addClips(page, ['a.mp4', 'b.mp4']);
    await button(page, 'action.play').click();
    await expect.poll(async () => (await previewOf(page)).time, { timeout: 5000 }).toBeGreaterThan(0.4);
    await button(page, 'action.pause').click();
    const paused = await previewOf(page);
    expect(paused.state).toBe('paused');
    // On a frame start, and the frame shown is that frame.
    const k = Math.round(paused.time * 30);
    expect(paused.time).toBeCloseTo(Math.floor((k * 1_000_000) / 30) / 1_000_000, 6);
    await expect.poll(async () => (await previewOf(page)).shown).toMatchObject({ frameIndex: k, exact: true });
    await page.waitForTimeout(300);
    expect((await previewOf(page)).time).toBe(paused.time);
    expect((await previewOf(page)).playhead).toBe(paused.time);
  });

  test('F-002.R3 a playhead moved through the binding (the timeline, F-003) shows that frame', async ({ page }) => {
    await open(page);
    await addClips(page);
    await setPlayhead(page, 1);
    await expect.poll(async () => (await previewOf(page)).shown).toMatchObject({ frameIndex: 30, exact: true });
    await expect(now(page)).toHaveText('0:01');
    await expect(page.getByRole('img', { name: 'Preview at 0:01' })).toBeVisible();
  });

  test('RULE-20 Space plays and pauses with focus in the tool; a focused button keeps Space', async ({ page }) => {
    await open(page);
    await addClips(page, ['a.mp4', 'b.mp4']);
    await page.getByRole('main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Space');
    expect((await previewOf(page)).state).toBe('playing');
    await page.keyboard.press('Space');
    expect((await previewOf(page)).state).toBe('paused');

    // A focused button gets Space (RULE-20 Scope): Next frame activates, playback does not start.
    await button(page, 'action.go_start').click();
    await button(page, 'action.next_frame').focus();
    await page.keyboard.press('Space');
    expect((await previewOf(page)).state).toBe('paused');
    await expect(frameNo(page)).toHaveText('·01');
  });

  test('F-002.AC7 entering and leaving full screen keeps playback running and the playhead', async ({ page }) => {
    await open(page);
    // Twice the clips: under load, playback must not reach the end before full screen is left.
    await addClips(page, ['a.mp4', 'b.mp4', 'c.mp4', 'a.mp4', 'b.mp4', 'c.mp4']);
    await button(page, 'action.play').click();
    await expect.poll(async () => (await previewOf(page)).time).toBeGreaterThan(0.2);
    const before = await previewOf(page);

    await button(page, 'action.full_screen').click();
    const bar = page.locator('.tk-fullscreen-bar');
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button', { name: text('en-US', 'action.pause') })).toBeVisible();
    const inside = await previewOf(page);
    expect(['fullscreen', 'maximised']).toContain(inside.fullscreen);
    expect(inside.state).toBe('playing');
    expect(inside.time).toBeGreaterThanOrEqual(before.time);
    await expect.poll(async () => (await previewOf(page)).time).toBeGreaterThan(inside.time);

    await bar.getByRole('button', { name: text('en-US', 'action.exit_full_screen') }).click();
    await expect(bar).toBeHidden();
    const after = await previewOf(page);
    expect(after.fullscreen).toBe('off');
    expect(after.state).toBe('playing');
    expect(after.time).toBeGreaterThanOrEqual(inside.time);
    await button(page, 'action.pause').click();
  });

  test('F-002.AC7 where the page has no full screen (iPhone) the preview is maximised in the page; Esc leaves it, playback continues', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });
    });
    await open(page);
    // Twice the clips: the axe pass and Tab walk below must finish before playback reaches the end.
    await addClips(page, ['a.mp4', 'b.mp4', 'c.mp4', 'a.mp4', 'b.mp4', 'c.mp4']);
    await button(page, 'action.play').click();
    await button(page, 'action.full_screen').click();
    const bar = page.locator('.tk-fullscreen-bar');
    await expect(bar).toBeVisible();
    expect((await previewOf(page)).fullscreen).toBe('maximised');
    // The frame fills the page.
    const box = await page.locator('.tk-stage').boundingBox();
    const viewport = page.viewportSize()!;
    expect(box).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
    await axe(page);
    // Everything outside the stage is inert: Tab stays on the chrome bar (and the stage's notices).
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('.tk-stage') !== null)).toBe(true);
    }
    expect(await page.locator('.tk-transport').evaluate((el) => (el as HTMLElement).inert)).toBe(true);
    const inside = await previewOf(page);
    await page.keyboard.press('Escape');
    await expect(bar).toBeHidden();
    const after = await previewOf(page);
    expect(after.fullscreen).toBe('off');
    expect(after.state).toBe('playing');
    expect(after.time).toBeGreaterThanOrEqual(inside.time);
    // Focus returns to Full screen and the rest of the editor is reachable again.
    await expect(button(page, 'action.full_screen')).toBeFocused();
    expect(await page.locator('.tk-transport').evaluate((el) => (el as HTMLElement).inert)).toBe(false);
    await button(page, 'action.pause').click();
  });

  test('F-002.R2 in vi-VN the transport reads in Vietnamese', async ({ page }) => {
    await open(page, 'effects=fast&lang=vi-VN');
    await expect(button(page, 'action.play', 'vi-VN')).toBeDisabled();
    await expect(button(page, 'action.full_screen', 'vi-VN')).toBeDisabled();
    await expect(transport(page)).toContainText('0:00·00 / 0:00');
  });
});

test.describe('F-002 sound (app harness, decoded source sound)', () => {
  test('ADR-0008 §6 the preview plays a clip’s decoded sound from the playhead: the worklet gets the tone at its project time', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await open(page, 'effects=fast&lang=en-US&tap=1');
    const end = await addToneClip(page);
    await setPlayhead(page, 0.5);
    await button(page, 'action.play').click();
    const played = await playedStats(page);
    await expect(button(page, 'action.play')).toBeVisible({ timeout: 10_000 });
    const heard = await page.evaluate(([s, n]) => (window as unknown as Harness).appHarness.heard(s, n), [
      TONE,
      played.hashed,
    ] as const);
    // The sound starts at the playhead and runs to the project end.
    expect(heard.from).toBeCloseTo(0.5, 6);
    expect(heard.to).toBeCloseTo(end, 6);
    // The tone is heard at its own time in the clip (the AAC priming is removed: INV-02), at its level.
    expect(Math.abs(heard.onset - (1 + HALF))).toBeLessThan(0.001);
    expect(heard.beforeDb).toBeLessThan(-50);
    expect(Math.abs(heard.toneDb - 20 * Math.log10(0.25 / Math.SQRT2))).toBeLessThan(0.5);
    expect(Math.abs(heard.freq - 440)).toBeLessThan(1);
    // What the worklet played is exactly what it was sent.
    expect(heard.hashL).toBe(played.hashL);
  });
});

test.describe('F-002 timing (app harness)', () => {
  test(
    'F-002.AC2 picture and decoded sound start together from the playhead and stop at the project end',
    { tag: '@realtime' },
    async ({ page }) => {
      test.setTimeout(60_000);
      await open(page, 'effects=fast&lang=en-US&tap=1');
      const end = await addToneClip(page);
      await setPlayhead(page, 0.5);
      await button(page, 'action.play').click();
      const played = await playedStats(page);
      await expect(button(page, 'action.play')).toBeVisible({ timeout: 10_000 });
      const sync = await page.evaluate(() => (window as unknown as Harness).appHarness.sync());
      const heard = await page.evaluate(([s, n]) => (window as unknown as Harness).appHarness.heard(s, n), [
        TONE,
        played.hashed,
      ] as const);
      // Sound: from the playhead's sample, with the clip's tone at its time, to the project end.
      expect(heard.from).toBeCloseTo(0.5, 6);
      expect(Math.abs(heard.onset - (1 + HALF))).toBeLessThan(0.001);
      expect(heard.to).toBeCloseTo(end, 6);
      expect(heard.hashL).toBe(played.hashL);
      expect(sync.underruns).toBe(0);
      // Picture: starts at the playhead and follows the sound clock (each frame within a frame + 40 ms).
      expect(sync.shown.length).toBeGreaterThan(30);
      expect(sync.shown[0]!.t).toBeGreaterThanOrEqual(0.5 - 1e-6);
      expect(sync.shown[0]!.t).toBeLessThan(0.5 + 0.2);
      const offsets = sync.shown.map((f) => f.heard - f.t);
      const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
      test.info().annotations.push({
        type: 'A/V offset (heard − shown)',
        description: `mean ${(mean * 1000).toFixed(1)} ms, max ${(Math.max(...offsets.map(Math.abs)) * 1000).toFixed(1)} ms over ${offsets.length} frames`,
      });
      for (const f of sync.shown) expect(Math.abs(f.heard - f.t)).toBeLessThan(FRAME + 0.04);
      expect((await previewOf(page)).time).toBeCloseTo(end, 5);
    },
  );

  test(
    'F-002.AC4 the preview follows the playhead moved across a clip within the NFR-03 150 ms (95th percentile)',
    { tag: '@realtime' },
    async ({ page }) => {
      await open(page);
      await addClips(page);
      // A drag across the clip: every other frame, forwards then back (the playhead starts at 0).
      const frames = [
        ...Array.from({ length: 30 }, (_, i) => 2 + i * 2),
        ...Array.from({ length: 20 }, (_, i) => 57 - i * 3),
      ];
      const ms = await page.evaluate((k) => (window as unknown as Harness).appHarness.scrub(k), frames);
      const sorted = [...ms].sort((a, b) => a - b);
      expect(sorted[Math.floor(sorted.length * 0.95) - 1]).toBeLessThan(150);
    },
  );

  test(
    'F-002.R2 the clock and worklet path: picture and an injected tone start together from the playhead and stay together to the end',
    { tag: '@realtime' },
    async ({ page }) => {
      await open(page);
      await addClips(page);
      await page.evaluate(() => (window as unknown as Harness).appHarness.feedTone('phone.mp4', 3));
      await setPlayhead(page, 0.5);
      await button(page, 'action.play').click();
      await expect.poll(async () => (await previewOf(page)).time).toBeGreaterThan(1.2);
      // Sound is being played by the worklet while the picture runs.
      const mid = await page.evaluate(() => (window as unknown as Harness).appHarness.sync());
      expect(mid.played).toBeGreaterThan(0);
      expect(mid.underruns).toBe(0);
      await expect(button(page, 'action.play')).toBeVisible({ timeout: 5000 });
      const sync = await page.evaluate(() => (window as unknown as Harness).appHarness.sync());
      expect(sync.shown.length).toBeGreaterThan(10);
      expect(sync.shown[0]!.t).toBeGreaterThanOrEqual(0.5 - 1e-6);
      expect(sync.shown[0]!.t).toBeLessThan(0.5 + 0.2);
      // The picture follows the sound: each frame shown is the frame being heard (within a frame + 40 ms).
      for (const s of sync.shown) expect(Math.abs(s.heard - s.t)).toBeLessThan(FRAME + 0.04);
      expect((await previewOf(page)).time).toBeCloseTo(END, 5);
    },
  );
});
