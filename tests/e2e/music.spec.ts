// F-011 Add music and set sound through the real UI (MOD-App, MOD-Timeline, MOD-Audio, MOD-Assets; real
// decoders and workers) on the app harness (tests/harness/app.html), and the export half of the sound
// criteria on the media harness (tests/harness/index.html, real export workers, the file decoded back).
// The music picker (popover; the phone Audio sheet), placing bundled tracks per RULE-12, the audio lane
// (select, drag by the RULE-12 move rule, Earlier/Later, Delete, Duplicate, keys), the inspector's sound
// section (volume 0–200 %, Mute, Mute original sound) and axe at 320 and 1280 px in en-US and vi-VN.
// Settings with no control yet (a photo's length, F-004) and starting projects with audio clips in place
// are set through `appHarness.setClip()` / `appHarness.load()`. AC7 (offline) is in offline.spec.ts.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import { BUNDLED_MUSIC as MUSIC_TRACKS } from '../../src/core/music.gen';
import type { ClipSetup, ProjectSummary } from '../harness/app';
import type { ToneSpec } from '../harness/sound';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;
/** Screenshots of the feature's states for the build report (Chromium only). */
const SHOTS = '.build-my-app/reports/screens/F-011';
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;
const S = 1_000_000;
const CHORDS = MUSIC_TRACKS.find((t) => t.id === 'placeholder-chords')!; // 60 s
const PAD = MUSIC_TRACKS.find((t) => t.id === 'placeholder-pad')!; // 20 s

interface Harness {
  appHarness: {
    project(): ProjectSummary;
    setClip(index: number, setup: ClipSetup): void;
    setPlayhead(seconds: number): void;
    state(): string;
    load(json: string): void;
    preview(): { playhead: number; duration: number; state: string; shown: { exact: boolean } | null };
    toneClip(spec: ToneSpec): Promise<number[]>;
    heardLevels(): { truePeakDb: number; rmsDb: number; seconds: number };
  };
}
const h = (page: Page) => page.evaluate.bind(page);
const summary = (page: Page) => h(page)(() => (window as unknown as Harness).appHarness.project());
const stateOf = async (page: Page) =>
  JSON.parse(await h(page)(() => (window as unknown as Harness).appHarness.state())) as {
    clips: { volume?: number; muted?: boolean }[];
    audioClips: {
      id: string;
      sourceId: string;
      start: number;
      in: number;
      out: number;
      volume: number;
      muted: boolean;
    }[];
  };
const setPlayhead = (page: Page, s: number) =>
  h(page)((x) => (window as unknown as Harness).appHarness.setPlayhead(x), s);

const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function open(page: Page, lang: Language = 'en-US', extra = ''): Promise<void> {
  await page.goto(`${APP}?effects=fast&lang=${lang}${extra}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

/** Adds files through the empty state's Add media, then closes the media panel. */
async function add(
  page: Page,
  files: { name: string; mimeType: string; buffer: ReturnType<typeof Buffer.from> }[],
  lang: Language = 'en-US',
): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('.tk-empty')
    .getByRole('button', { name: text(lang, 'action.add_media') })
    .click();
  await (await chooser).setFiles(files);
  await expect.poll(async () => (await summary(page)).clips.length, { timeout: 20_000 }).toBe(files.length);
  const media = page.locator('.tk-media');
  await media.getByRole('button', { name: text(lang, 'action.close') }).click();
  await expect(media).toHaveCount(0);
}

/** A project of one photo `seconds` long (F-004's duration control is not built yet). */
async function photoProject(page: Page, seconds: number, lang: Language = 'en-US'): Promise<void> {
  await add(page, [{ name: 'P.png', mimeType: 'image/png', buffer: PHOTO }], lang);
  await h(page)((s) => (window as unknown as Harness).appHarness.setClip(0, { seconds: s }), seconds);
}

/** Replaces the audio track with clips of the 60 s bundled track at [start, end] seconds (one step). */
async function audioTrack(page: Page, spans: readonly (readonly [number, number])[]): Promise<void> {
  const state = await stateOf(page);
  const audioClips = spans.map(([a, b], i) => ({
    id: `music-${i}`,
    sourceId: CHORDS.id,
    start: a * S,
    in: 0,
    out: (b - a) * S,
    volume: 100,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  }));
  await h(page)(
    (json) => (window as unknown as Harness).appHarness.load(json),
    JSON.stringify({ ...state, audioClips }),
  );
}

const timeline = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('region', { name: text(lang, 'timeline.label') });
const audioItem = (page: Page, nth = 0): Locator => page.locator('.tk-aclip').nth(nth);
const tool = (page: Page, id: CopyId, lang: Language = 'en-US') =>
  timeline(page, lang)
    .getByRole('toolbar')
    .getByRole('button', { name: text(lang, id) });
const picker = (page: Page, lang: Language = 'en-US') => page.getByRole('dialog', { name: text(lang, 'music.title') });
const musicButton = (page: Page, lang: Language = 'en-US') =>
  page
    .getByRole('toolbar', { name: text(lang, 'toolbar.label') })
    .getByRole('button', { name: text(lang, 'action.music') });
const inspector = (page: Page) => page.locator('.tk-inspector');
const spans = async (page: Page) => (await summary(page)).audio.map((a) => [a.start, a.end]);

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

/** Waits until a locator's box stops moving (the lane's layout has settled). */
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

async function shot(page: Page, name: string, browserName: string): Promise<void> {
  if (browserName !== 'chromium') return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test.describe('F-011 music picker and audio track (app harness)', () => {
  test('F-011.AC6 F-011.R6 the picker opens from Music; every track shows its title, source and licence; Esc closes it', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await photoProject(page, 20);
    await musicButton(page).click();
    await expect(musicButton(page)).toHaveAttribute('aria-expanded', 'true');
    const dialog = picker(page);
    await expect(dialog).toBeVisible();
    const rows = dialog.getByRole('listitem');
    await expect(rows).toHaveCount(MUSIC_TRACKS.length);
    for (const [i, t] of MUSIC_TRACKS.entries()) {
      await expect(rows.nth(i)).toContainText(t.title);
      await expect(rows.nth(i)).toContainText(t.source);
      await expect(rows.nth(i)).toContainText(t.licence);
      await expect(
        rows.nth(i).getByRole('button', { name: `${text('en-US', 'music.preview')}: ${t.title}` }),
      ).toHaveAttribute('aria-pressed', 'false');
      await expect(rows.nth(i).getByRole('button', { name: text('en-US', 'music.add') })).toBeVisible();
    }
    await expect(dialog.getByText(text('en-US', 'music.your_audio_hint'))).toBeVisible();
    await expect(dialog.getByRole('button', { name: text('en-US', 'music.your_audio') })).toBeVisible();
    await expect(dialog.getByRole('button', { name: text('en-US', 'privacy.notices') })).toBeVisible();
    await shot(page, 'picker-wide-en', browserName);
    await axe(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(musicButton(page)).toBeFocused();
  });

  test('F-011.AC1 F-011.R1 a 60 s track added at 3 s in a 20 s project runs 3–63 s, past the end hatched; the picker stays open and the clip is selected', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await photoProject(page, 20);
    await setPlayhead(page, 3);
    await musicButton(page).click();
    const row = picker(page).getByRole('listitem').filter({ hasText: CHORDS.title });
    await row.getByRole('button', { name: text('en-US', 'music.add') }).click();
    expect(await spans(page)).toEqual([[3, 63]]);
    await expect(picker(page)).toBeVisible();
    await expect(audioItem(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(audioItem(page)).toHaveAccessibleName(`${CHORDS.title} 1:00`);
    // INV-07: the part after the project end is drawn hatched, starting at the end marker.
    const past = audioItem(page).locator('.tk-aclip__past');
    await expect(past).toBeVisible();
    await settled(audioItem(page));
    const end = (await timeline(page).locator('.tk-end').boundingBox())!;
    const hatched = (await past.boundingBox())!;
    expect(Math.abs(hatched.x - end.x)).toBeLessThan(3);
    await page.keyboard.press('Escape');
    await shot(page, 'audio-lane-wide', browserName);
  });

  test('F-011.AC11 RULE-12 with the playhead at the project end a new track starts at 0; with no room it is refused with COPY-notice.no_audio_room', async ({
    page,
  }) => {
    await open(page);
    await photoProject(page, 20);
    await setPlayhead(page, 20);
    await musicButton(page).click();
    const row = (t: { title: string }) => picker(page).getByRole('listitem').filter({ hasText: t.title });
    await row(PAD)
      .getByRole('button', { name: text('en-US', 'music.add') })
      .click();
    expect(await spans(page)).toEqual([[0, 20]]);
    // Whole project taken: Add at playhead is unavailable and the row says why (CMP-MusicPicker "no audio room").
    await setPlayhead(page, 5);
    await expect(row(CHORDS).getByText(text('en-US', 'notice.no_audio_room'))).toBeVisible();
    await expect(row(CHORDS).getByRole('button', { name: text('en-US', 'music.add') })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('F-011.AC2 RULE-12 INV-06 dragging the 0–5 s clip to start at 6 s places it at 3–8 s, the nearest free time where it fits whole', async ({
    page,
  }) => {
    await open(page);
    await photoProject(page, 30);
    await audioTrack(page, [
      [0, 5],
      [8, 12],
    ]);
    const first = audioItem(page, 0);
    await settled(first);
    const box = (await first.boundingBox())!;
    const pxPerS = box.width / 5;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 10, y);
    await page.mouse.down();
    for (let k = 1; k <= 6; k++) await page.mouse.move(box.x + 10 + k * pxPerS, y);
    await page.mouse.up();
    await expect
      .poll(() => spans(page))
      .toEqual([
        [3, 8],
        [8, 12],
      ]);
    await expect(first).toHaveAttribute('aria-pressed', 'true');
  });

  test('F-011.AC9 moving the 0–5 s clip to 10 s when 5–30 s is taken in a 30 s project changes nothing and makes no undo step', async ({
    page,
  }) => {
    await open(page);
    await photoProject(page, 30);
    await audioTrack(page, [
      [0, 5],
      [5, 30],
    ]);
    const steps = (await summary(page)).steps;
    const first = audioItem(page, 0);
    await settled(first);
    const box = (await first.boundingBox())!;
    const pxPerS = box.width / 5;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 10, y);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(box.x + 10 + k * pxPerS, y);
    await page.mouse.up();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(await spans(page)).toEqual([
      [0, 5],
      [5, 30],
    ]);
    expect((await summary(page)).steps).toBe(steps);
  });

  test('F-011.AC8 F-011.R8 RULE-21 Later moves a lone 4–8 s audio clip one frame later; the keys move it a frame or a second', async ({
    page,
  }) => {
    await open(page);
    await photoProject(page, 30);
    await audioTrack(page, [[4, 8]]);
    await audioItem(page).click();
    // The timeline toolbar's move actions read Earlier and Later for an audio clip (CMP-Timeline "audio item").
    await tool(page, 'action.time_later').click();
    const frame = 1 / 30;
    expect((await spans(page))[0]![0]).toBeCloseTo(4 + frame, 5);
    // The inspector's Earlier puts it back; Alt+Right one frame, Shift+Alt+Right one second (RULE-20).
    await inspector(page)
      .getByRole('button', { name: text('en-US', 'action.time_earlier') })
      .click();
    expect((await spans(page))[0]![0]).toBeCloseTo(4, 5);
    await audioItem(page).focus();
    await page.keyboard.press('Alt+ArrowRight');
    expect((await spans(page))[0]![0]).toBeCloseTo(4 + frame, 5);
    await page.keyboard.press('Shift+Alt+ArrowRight');
    expect((await spans(page))[0]![0]).toBeCloseTo(5 + frame, 5);
  });

  test('F-011.R2 RULE-12 Duplicate puts the copy at the nearest free time from the original’s end; Delete removes the selected audio clip', async ({
    page,
  }) => {
    await open(page);
    await photoProject(page, 30);
    await audioTrack(page, [
      [0, 5],
      [5, 9],
    ]);
    await audioItem(page, 0).click();
    await tool(page, 'action.duplicate').click();
    expect(await spans(page)).toEqual([
      [0, 5],
      [9, 14],
      [5, 9],
    ]);
    await tool(page, 'action.delete').click();
    expect(await spans(page)).toEqual([
      [9, 14],
      [5, 9],
    ]);
    await expect(page.locator('.tk-aclip[aria-pressed="true"]')).toHaveCount(0);
  });
});

test.describe('F-011 sound section (app harness)', () => {
  const VIDEO = { name: 'V.mp4', mimeType: 'video/mp4' };

  /** Adds three tone clips (each with sound). */
  async function threeClips(page: Page, lang: Language = 'en-US'): Promise<void> {
    const spec: ToneSpec = { seconds: 2, onset: 0.5, freq: 440, amp: 0.25, codec: 'aac', sampleRate: 48_000 };
    const bytes = await h(page)((s) => (window as unknown as Harness).appHarness.toneClip(s), spec);
    const buffer = Buffer.from(bytes);
    await add(
      page,
      ['A', 'B', 'C'].map((n) => ({ ...VIDEO, name: `${n}.mp4`, buffer })),
      lang,
    );
  }

  test('F-011.AC4 F-011.R4 Mute original sound mutes all three clips as one step and then reads Unmute original sound; one undo unmutes all three', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await threeClips(page);
    await timeline(page)
      .getByRole('button', { name: /^B\.mp4 / })
      .click();
    await expect(inspector(page).getByRole('heading', { name: text('en-US', 'inspector.sound') })).toBeVisible();
    const steps = (await summary(page)).steps;
    await inspector(page)
      .getByRole('button', { name: text('en-US', 'action.mute_all') })
      .click();
    expect((await stateOf(page)).clips.map((c) => c.muted)).toEqual([true, true, true]);
    expect((await summary(page)).steps).toBe(steps + 1);
    await expect(inspector(page).getByRole('button', { name: text('en-US', 'action.unmute_all') })).toBeVisible();
    await shot(page, 'inspector-sound-all-muted', browserName);
    await page.getByRole('button', { name: text('en-US', 'action.undo') }).click();
    expect((await stateOf(page)).clips.map((c) => c.muted ?? false)).toEqual([false, false, false]);
    // The step changed three clips, so nothing is selected after undo (RULE-13, build question 103).
    await timeline(page)
      .getByRole('button', { name: /^B\.mp4 / })
      .click();
    await expect(inspector(page).getByRole('button', { name: text('en-US', 'action.mute_all') })).toBeVisible();
  });

  test('F-011.R3 RULE-12 volume is set by the field (clamped to 0–200 %) and the slider; M toggles mute; a field change is one step', async ({
    page,
  }) => {
    await open(page);
    await threeClips(page);
    await timeline(page)
      .getByRole('button', { name: /^A\.mp4 / })
      .click();
    const field = inspector(page).getByRole('spinbutton', { name: text('en-US', 'sound.volume') });
    const slider = inspector(page).getByRole('slider', { name: text('en-US', 'sound.volume') });
    await field.fill('250');
    await field.press('Enter');
    await expect(field).toHaveValue('200');
    await expect(slider).toHaveValue('200');
    expect((await stateOf(page)).clips[0]!.volume).toBe(200);
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    expect((await stateOf(page)).clips[0]!.volume).toBe(199);
    const mute = inspector(page).getByRole('button', { name: text('en-US', 'action.mute'), exact: true });
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    await timeline(page)
      .getByRole('button', { name: /^A\.mp4 / })
      .focus();
    await page.keyboard.press('m');
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    expect((await stateOf(page)).clips[0]).toMatchObject({ muted: true, volume: 199 });
  });

  test('F-011.AC3 F-011.AC10 (preview) 50 % plays the clip 6.0 dB ± 0.5 dB quieter; muted it is silent; unmuted it is back at 50 %', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page, 'en-US', '&tap=1');
    const spec: ToneSpec = { seconds: 3, onset: 0.1, freq: 440, amp: 0.25, codec: 'aac', sampleRate: 48_000 };
    const bytes = await h(page)((s) => (window as unknown as Harness).appHarness.toneClip(s), spec);
    await add(page, [{ ...VIDEO, buffer: Buffer.from(bytes) }]);
    await expect
      .poll(async () => (await h(page)(() => (window as unknown as Harness).appHarness.preview())).shown?.exact)
      .toBe(true);
    const play = page.getByRole('button', { name: text('en-US', 'action.play') });
    /** Plays from 0 to the end and returns the level heard over the tone. */
    const level = async (): Promise<number> => {
      await setPlayhead(page, 0);
      await play.click();
      await expect(play).toBeVisible({ timeout: 15_000 });
      return (await h(page)(() => (window as unknown as Harness).appHarness.heardLevels())).rmsDb;
    };
    const full = await level();
    expect(full).toBeGreaterThan(-25);
    await timeline(page)
      .getByRole('button', { name: /^V\.mp4 / })
      .click();
    const field = inspector(page).getByRole('spinbutton', { name: text('en-US', 'sound.volume') });
    await field.fill('50');
    await field.press('Enter');
    const half = await level();
    expect(Math.abs(full - half - 6.0)).toBeLessThanOrEqual(0.5);
    const mute = inspector(page).getByRole('button', { name: text('en-US', 'action.mute'), exact: true });
    await mute.click();
    expect(await level()).toBeLessThan(-90);
    await mute.click();
    await expect(field).toHaveValue('50');
    expect(Math.abs((await level()) - half)).toBeLessThan(0.1);
  });

  test('F-011.AC5 (preview) music at 200 % over loud video sound never goes over −1 dBTP', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, 'en-US', '&tap=1');
    const spec: ToneSpec = { seconds: 3, onset: 0.1, freq: 440, amp: 0.9, codec: 'aac', sampleRate: 48_000 };
    const bytes = await h(page)((s) => (window as unknown as Harness).appHarness.toneClip(s), spec);
    await add(page, [{ ...VIDEO, buffer: Buffer.from(bytes) }]);
    await setPlayhead(page, 0);
    await musicButton(page).click();
    await picker(page)
      .getByRole('listitem')
      .filter({ hasText: PAD.title })
      .getByRole('button', { name: text('en-US', 'music.add') })
      .click();
    await page.keyboard.press('Escape');
    const field = inspector(page).getByRole('spinbutton', { name: text('en-US', 'sound.volume') });
    await field.fill('200');
    await field.press('Enter');
    expect((await stateOf(page)).audioClips[0]!.volume).toBe(200);
    const play = page.getByRole('button', { name: text('en-US', 'action.play') });
    await setPlayhead(page, 0);
    await play.click();
    await expect(play).toBeVisible({ timeout: 15_000 });
    const heard = await h(page)(() => (window as unknown as Harness).appHarness.heardLevels());
    expect(heard.seconds).toBeGreaterThan(2.9);
    expect(heard.rmsDb).toBeGreaterThan(-12); // loud: the limiter is working
    expect(heard.truePeakDb).toBeLessThanOrEqual(-1);
  });

  test('F-011.R1 Play preview auditions a track (pressed, with progress); Stop preview and closing the picker stop it', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await photoProject(page, 20);
    await musicButton(page).click();
    const row = picker(page).getByRole('listitem').filter({ hasText: PAD.title });
    const toggle = row.getByRole('button', { name: `${text('en-US', 'music.preview')}: ${PAD.title}` });
    await toggle.click();
    const stop = row.getByRole('button', { name: `${text('en-US', 'music.stop')}: ${PAD.title}` });
    await expect(stop).toHaveAttribute('aria-pressed', 'true');
    await expect(row).toHaveAttribute('data-previewing', '');
    // It plays: the progress line grows from the worklet's clock.
    await expect
      .poll(async () => (await row.locator('.tk-music__progress').boundingBox())?.width ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(1);
    await shot(page, 'picker-previewing', browserName);
    await stop.click();
    await expect(row).not.toHaveAttribute('data-previewing', '');
    await toggle.click();
    await expect(row).toHaveAttribute('data-previewing', '');
    await page.keyboard.press('Escape');
    await musicButton(page).click();
    await expect(picker(page).locator('[data-previewing]')).toHaveCount(0);
  });
});

test.describe('F-011 narrow layout and languages (app harness)', () => {
  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-011 NFR-06 the Audio sheet holds the selection's sound and the tracks at 320 px; axe passes (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await open(page, lang);
      await photoProject(page, 20, lang);
      const audioTab = page.getByRole('tab', { name: text(lang, 'tab.audio') });
      await audioTab.click();
      const sheet = page.getByRole('tabpanel', { name: text(lang, 'tab.audio') });
      await expect(sheet.getByRole('heading', { name: text(lang, 'music.title') })).toBeVisible();
      await expect(sheet.getByRole('button', { name: text(lang, 'music.your_audio') })).toBeVisible();
      await shot(page, `narrow-picker-${lang}`, browserName);
      await sheet
        .getByRole('listitem')
        .filter({ hasText: PAD.title })
        .getByRole('button', { name: text(lang, 'music.add') })
        .click();
      expect(await spans(page)).toEqual([[0, 20]]);
      // The new clip is selected: its sound section shows in the sheet, at touch size.
      await expect(sheet.getByRole('heading', { name: text(lang, 'inspector.sound') })).toBeVisible();
      const field = sheet.getByRole('spinbutton', { name: text(lang, 'sound.volume') });
      const fieldBox = (await field.boundingBox())!;
      expect(fieldBox.height).toBeGreaterThanOrEqual(44);
      await sheet.locator('.tk-sheet__body').evaluate((el) => el.scrollTo(0, 0));
      await shot(page, `narrow-audio-sheet-${lang}`, browserName);
      await axe(page);
      // The Edit sheet's move tiles read Earlier and Later for an audio clip.
      await page.getByRole('tab', { name: text(lang, 'inspector.edit') }).click();
      await expect(page.getByRole('button', { name: text(lang, 'action.time_later') })).toBeVisible();
    });

    test(`F-011 NFR-06 the picker and the audio clip's sound section pass axe at 1280 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, lang);
      await photoProject(page, 20, lang);
      await setPlayhead(page, 3);
      await musicButton(page, lang).click();
      await expect(picker(page, lang)).toBeVisible();
      await axe(page);
      await picker(page, lang)
        .getByRole('listitem')
        .filter({ hasText: CHORDS.title })
        .getByRole('button', { name: text(lang, 'music.add') })
        .click();
      await page.keyboard.press('Escape');
      await expect(inspector(page).getByRole('heading', { name: text(lang, 'inspector.sound') })).toBeVisible();
      await expect(inspector(page).getByRole('button', { name: text(lang, 'action.time_earlier') })).toBeVisible();
      await settled(audioItem(page));
      await shot(page, `inspector-sound-audio-${lang}`, browserName);
      await axe(page);
    });
  }
});

test.describe('F-011 export (media harness, real export workers)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
    await expect(page.locator('#out')).toHaveText('ready');
  });
  const tone: ToneSpec = { seconds: 3, onset: 0.1, freq: 440, amp: 0.25, codec: 'aac', sampleRate: 48_000 };
  const settings = { kind: 'video', resolution: 480, quality: 'balanced' } as const;
  const span = [0.5, 2.5] as const;
  const mix = (page: Page, m: { volume?: number; muted?: boolean; music?: { id: string; volume: number } }, t = tone) =>
    page.evaluate(([s, sp, mm, w]) => window.harness.export.runMix(s, sp, mm, w), [settings, t, m, span] as const);

  test('F-011.AC3 F-011.AC10 (export) 50 % is 6.0 dB ± 0.5 dB quieter in the decoded export; muted it is silent; unmuted at 50 % it is back', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const full = await mix(page, {});
    const half = await mix(page, { volume: 50 });
    const muted = await mix(page, { volume: 50, muted: true });
    const back = await mix(page, { volume: 50, muted: false });
    for (const r of [full, half, muted, back]) expect(r.ok).toBe(true);
    expect(Math.abs(full.rmsDb - half.rmsDb - 6.0)).toBeLessThanOrEqual(0.5);
    expect(muted.rmsDb).toBeLessThan(-80);
    expect(Math.abs(back.rmsDb - half.rmsDb)).toBeLessThan(0.1);
  });

  test('F-011.AC5 F-011.R5 Q87 (export) bundled music at 200 % over loud video sound: the decoded export’s true peak is ≤ −1 dBTP', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const loud = { ...tone, amp: 0.9 };
    const r = await mix(page, { music: { id: PAD.id, volume: 200 } }, loud);
    expect(r.ok).toBe(true);
    expect(r.rmsDb).toBeGreaterThan(-12);
    expect(r.truePeakDb).toBeLessThanOrEqual(-1);
    // The music is in the mix: the export is louder than the video's sound alone at the same settings.
    const alone = await mix(page, { volume: 100 }, { ...tone, amp: 0.05 });
    const withMusic = await mix(page, { volume: 100, music: { id: PAD.id, volume: 100 } }, { ...tone, amp: 0.05 });
    expect(withMusic.rmsDb).toBeGreaterThan(alone.rmsDb + 3);
  });
});
