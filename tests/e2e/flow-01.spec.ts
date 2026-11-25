// FLOW-01 "Make a short vertical clip" end to end through the real UI on the app harness (tests/harness/app.html: the
// real `main()`, workers, compositor and looks): open, add three videos, 9:16, trim the starts and split out a dull
// middle, a look + Brightness + Apply to all, a title, the user's own music file (D-052), play, export at 1080, and the
// file read back (9:16 at 1080 × 1920, the length of the edited timeline, sound). Exits: the leave-page warning while
// changes are unexported, and a failed export that leaves the project as it was. Media is the small fixture under
// tests/fixtures/media, and a WAV made by the test (./support/audio-files.ts; nothing is added to git).
// Implements: FLOW-01.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSummary, ExportRead, ProjectSummary } from '../harness/app';
import { wavTone } from './support/audio-files';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;
const S = 1_000_000;

interface Harness {
  appHarness: {
    project(): ProjectSummary;
    clips(): ClipSummary[];
    state(): string;
    setPlayhead(seconds: number): void;
    preview(): { state: string; time: number };
    unexported(): boolean;
    readExport(
      bytes: number[],
      times: readonly number[],
      points: readonly (readonly [number, number])[],
      windows: readonly number[],
      onsetAmp: number,
      names: readonly string[],
    ): Promise<ExportRead>;
  };
}
interface Doc {
  frame: { aspect: string };
  clips: { in?: number; out?: number; adjustments?: Record<string, number>; look?: { id: string } | null }[];
  textLayers: { content: string; start: number }[];
  audioClips: { sourceId: string; start: number }[];
}

const FIXTURE = readFileSync(fileURLToPath(new URL('../fixtures/media/mp4-faststart.mp4', import.meta.url)));
/** The 2.07 s phone-style fixture, under three names (the "three videos"). */
const video = (name: string) => ({ name, mimeType: 'video/mp4', buffer: FIXTURE });

const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const projectOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.project());
const docOf = async (page: Page): Promise<Doc> =>
  JSON.parse(await page.evaluate(() => (window as unknown as Harness).appHarness.state())) as Doc;
const stateOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.state());
const at = (page: Page, seconds: number) =>
  page.evaluate((s) => (window as unknown as Harness).appHarness.setPlayhead(s), seconds);
const unexported = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.unexported());
const ends = async (page: Page) => (await clipsOf(page)).map((c) => [c.start, c.end] as const);

/** True when the tool's `beforeunload` listener asks for the browser's leave-page warning (F-018.R1). */
const warns = (page: Page) =>
  page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });

async function open(page: Page, query = 'effects=fast&lang=en-US'): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${APP}?${query}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

const timeline = (page: Page) => page.getByRole('region', { name: text('en-US', 'timeline.label') });
const clipButton = (page: Page, name: string, nth = 0) =>
  timeline(page)
    .getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')} \\d:\\d\\d$`) })
    .nth(nth);
const tool = (page: Page, id: CopyId) =>
  timeline(page)
    .getByRole('toolbar')
    .getByRole('button', { name: text('en-US', id) });
const toolbar = (page: Page) => page.getByRole('toolbar', { name: text('en-US', 'toolbar.label') });
const transport = (page: Page) => page.locator('.tk-transport');
const inspectorOf = (page: Page, id: CopyId) => page.getByRole('complementary', { name: text('en-US', id) });

/** Step 2 (F-001.R1, R3): Add media with the file picker, then close the media panel. */
async function addVideos(page: Page, names: string[]): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('.tk-empty')
    .getByRole('button', { name: text('en-US', 'action.add_media') })
    .click();
  await (await chooser).setFiles(names.map(video));
  await expect.poll(async () => (await clipsOf(page)).length, { timeout: 30_000 }).toBe(names.length);
  const media = page.locator('.tk-media');
  await media.getByRole('button', { name: text('en-US', 'action.close') }).click();
  await expect(media).toHaveCount(0);
  for (const close of await page.locator('.tk-notice__close').all()) await close.click().catch(() => undefined);
}

/** Step 3 (F-012.R1): 9:16 in the frame inspector (shown while nothing is selected). */
async function chooseNineSixteen(page: Page): Promise<void> {
  await page
    .getByRole('complementary', { name: text('en-US', 'inspector.frame') })
    .getByRole('radiogroup', { name: text('en-US', 'frame.aspect') })
    .getByRole('radio', { name: '9:16', exact: true })
    .click();
  expect((await docOf(page)).frame.aspect).toBe('9:16');
}

const exportButton = (page: Page) =>
  toolbar(page).getByRole('button', { name: text('en-US', 'action.export'), exact: true });
const panel = (page: Page) =>
  page.getByRole('dialog', { name: text('en-US', 'export.title') }).and(page.locator('.tk-export'));

/** Step 9 (F-015.R1): the export panel at 1080 (its default), waiting for the estimate. */
async function openExportAt1080(page: Page) {
  await exportButton(page).click();
  const p = panel(page);
  await expect(p).toBeVisible();
  await expect(p.getByRole('radio', { name: '1080', exact: true })).toBeChecked();
  await expect(p.locator('.tk-export__estimate[data-estimate="ready"]')).toBeVisible({ timeout: 30_000 });
  return p;
}

test.use({ actionTimeout: 15_000 });

test.describe('FLOW-01 make a short vertical clip', () => {
  test('FLOW-01 F-001.R1 F-001.R3 F-012.R1 F-004.R1 F-004.R2 F-003.R3 F-008.R2 F-007.R1 F-007.R4 F-010.R1 F-010.R2 F-011.R1 F-002.R2 F-015.R1 F-015.R5 F-018.R1 three videos become a 9:16 clip with a look, brightness, a title and music, play, and export as a 1080 × 1920 file', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    // 1. Open the tool: SCR-Editor, empty (F-023.R1).
    await open(page);
    expect(await clipsOf(page)).toEqual([]);
    expect(await unexported(page)).toBe(false);
    expect(await warns(page)).toBe(false);

    // 2. Add three videos (F-001.R1, R3): placed in order on the main track, no gap.
    await addVideos(page, ['A.mp4', 'B.mp4', 'C.mp4']);
    const whole = (await clipsOf(page))[0]!.end;
    const placed = await ends(page);
    expect(placed[0]![0]).toBe(0);
    placed.forEach(([from, to], i) => {
      expect(to - from).toBeCloseTo(whole, 2);
      if (i > 0) expect(from).toBeCloseTo(placed[i - 1]![1], 3);
    });
    expect((await clipsOf(page)).map((c) => c.source)).toEqual(['A.mp4', 'B.mp4', 'C.mp4']);
    expect(await unexported(page)).toBe(true);

    // 3. Choose 9:16 (F-012.R1).
    await chooseNineSixteen(page);

    // 4. Trim the starts (F-004.R1): each clip loses its first 0.3 s, the track stays gap-free.
    for (const name of ['A.mp4', 'B.mp4', 'C.mp4']) {
      const index = ['A.mp4', 'B.mp4', 'C.mp4'].indexOf(name);
      await clipButton(page, name).click();
      await at(page, (await clipsOf(page))[index]!.start + 0.3);
      await tool(page, 'action.set_in').click();
    }
    const trimmed = whole - 0.3;
    const afterTrim = await clipsOf(page);
    for (const c of afterTrim) expect(c.end - c.start).toBeCloseTo(trimmed, 2);
    expect(afterTrim[1]!.start).toBeCloseTo(afterTrim[0]!.end, 3);
    expect(afterTrim[2]!.start).toBeCloseTo(afterTrim[1]!.end, 3);
    expect((await docOf(page)).clips.map((c) => c.in)).toEqual([0.3 * S, 0.3 * S, 0.3 * S]);

    //    Split out the dull middle of B (F-004.R2, F-003.R3): two splits, then delete the middle piece.
    const b0 = afterTrim[1]!.start;
    await clipButton(page, 'B.mp4').click();
    await at(page, b0 + 0.6);
    await tool(page, 'action.split').click();
    expect((await clipsOf(page)).length).toBe(4);
    await at(page, b0 + 1.0);
    // The second piece holds the playhead: select it (a click on a selected clip would clear the selection).
    if (!(await clipsOf(page))[2]!.selected) await clipButton(page, 'B.mp4', 1).click();
    await tool(page, 'action.split').click();
    expect((await clipsOf(page)).length).toBe(5);
    // The middle piece is the one to go.
    if (!(await clipsOf(page))[2]!.selected) await clipButton(page, 'B.mp4', 1).click();
    expect((await clipsOf(page)).map((c) => c.selected)).toEqual([false, false, true, false, false]);
    const before = await clipsOf(page);
    await tool(page, 'action.delete').click();
    const edited = await clipsOf(page);
    expect(edited.map((c) => c.source)).toEqual(['A.mp4', 'B.mp4', 'B.mp4', 'C.mp4']);
    const middle = before[2]!.end - before[2]!.start;
    expect(middle).toBeCloseTo(0.4, 1);
    const length = edited.at(-1)!.end;
    expect(length).toBeCloseTo(3 * trimmed - middle, 2);
    // No gap after the delete: later clips moved earlier (INV-03).
    for (let i = 1; i < edited.length; i++) expect(edited[i]!.start).toBeCloseTo(edited[i - 1]!.end, 3);

    // 5. A look (F-008.R2) and Brightness (F-007.R1) on clip A, then Apply to all (F-007.R4).
    await clipButton(page, 'A.mp4').click();
    const inspector = inspectorOf(page, 'inspector.label');
    await inspector
      .getByRole('tablist')
      .getByRole('tab', { name: text('en-US', 'looks.title'), exact: true })
      .click();
    const look = inspector
      .getByRole('radiogroup', { name: text('en-US', 'looks.title') })
      .getByRole('radio')
      .nth(1); // the first look after None
    await look.click();
    expect((await clipsOf(page))[0]!.look).not.toBeNull();
    const chosen = (await clipsOf(page))[0]!.look;
    await inspector
      .getByRole('tablist')
      .getByRole('tab', { name: text('en-US', 'inspector.adjust') })
      .click();
    const adjust = inspector.getByRole('tabpanel', { name: text('en-US', 'inspector.adjust') });
    const brightness = adjust
      .getByRole('group', { name: text('en-US', 'adjust.brightness'), exact: true })
      .getByRole('spinbutton');
    await brightness.fill('25');
    await brightness.press('Enter');
    expect((await clipsOf(page))[0]!.adjustments).toMatchObject({ brightness: 25 });
    await adjust.getByRole('button', { name: text('en-US', 'action.apply_all'), exact: true }).click();
    for (const c of await clipsOf(page)) {
      expect(c.look).toBe(chosen);
      expect(c.adjustments).toMatchObject({ brightness: 25 });
    }

    // 6. Add a title (F-010.R1, R2): starts at the playhead (0), typed directly, then styled in the text inspector.
    await at(page, 0);
    await toolbar(page)
      .getByRole('button', { name: text('en-US', 'action.add_text'), exact: true })
      .click();
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-state', 'editing-text');
    await expect(page.getByRole('textbox', { name: text('en-US', 'text.field') })).toBeFocused();
    await page.keyboard.type('Đà Lạt 2026');
    await page
      .locator('.tk-texteditor__bar')
      .getByRole('button', { name: text('en-US', 'text.done') })
      .click();
    expect((await projectOf(page)).texts).toEqual(['Đà Lạt 2026']);
    const layer = (await docOf(page)).textLayers[0]!;
    expect(layer.start).toBe(0);

    // 7. Add the user's own music file (F-011.R1, D-052): Music opens the file picker for audio files; the
    // song is listed as a source and placed on the audio track from the playhead (0), selected.
    await at(page, 0);
    const chooser = page.waitForEvent('filechooser');
    await toolbar(page)
      .getByRole('button', { name: text('en-US', 'action.music') })
      .click();
    const picker = await chooser;
    expect(picker.isMultiple()).toBe(true);
    expect(await picker.element().getAttribute('accept')).toMatch(/^audio\/\*/);
    await picker.setFiles([wavTone('song.wav', 6, 220, 0.25)]);
    await expect.poll(async () => (await projectOf(page)).audio.length, { timeout: 20_000 }).toBe(1);
    const audio = (await projectOf(page)).audio;
    expect(audio[0]).toMatchObject({ source: 'song.wav', start: 0 });
    expect((await projectOf(page)).sources.map((s) => s.name)).toContain('song.wav');
    await expect(page.locator('.tk-aclip').first()).toHaveAttribute('aria-pressed', 'true');

    // 8. Watch it (F-002.R2): play from 0 with picture and sound; it stops at the project end.
    await at(page, 0);
    await transport(page)
      .getByRole('button', { name: text('en-US', 'action.play'), exact: true })
      .click();
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-state', 'playing');
    await expect(transport(page).getByRole('button', { name: text('en-US', 'action.play'), exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const ended = await page.evaluate(() => (window as unknown as Harness).appHarness.preview());
    expect(ended.state).toBe('paused');
    expect(ended.time).toBeCloseTo(length, 1);

    // Exit (F-018.R1): with unexported changes, leaving would ask the browser to warn.
    expect(await unexported(page)).toBe(true);
    expect(await warns(page)).toBe(true);

    // 9. Export at 1080 (F-015.R1, R5): the file is handed to the browser under clip-<date>-<time>.mp4.
    const p = await openExportAt1080(page);
    const download = page.waitForEvent('download', { timeout: 240_000 });
    await p.getByRole('button', { name: text('en-US', 'action.export'), exact: true }).click();
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/^clip-\d{8}-\d{6}\.(mp4|webm)$/);
    const bytes = Array.from(readFileSync((await d.path())!));
    const run = page.locator('dialog.tk-run');
    await expect(run).toHaveAttribute('data-phase', 'done');
    expect(await unexported(page)).toBe(false);
    expect(await warns(page)).toBe(false);

    // The saved file: 9:16 at 1080 (1080 × 1920), as long as the edited timeline, with the music's sound.
    const read = await page.evaluate(
      ([b, t]) =>
        (window as unknown as Harness).appHarness.readExport(b, t, [[0.5, 0.5]], [0.5], 0.05, [
          'A.mp4',
          'B.mp4',
          'C.mp4',
        ]),
      [bytes, [0.5]] as const,
    );
    expect([read.width, read.height]).toEqual([1080, 1920]);
    expect(Math.abs(read.duration - length)).toBeLessThan(0.1);
    expect(read.sound).not.toBeNull();
    expect(Math.abs(read.sound!.duration - length)).toBeLessThan(0.1);
    expect(read.found).toEqual([]);
    // Exporting changed nothing in the project.
    expect((await clipsOf(page)).map((c) => c.source)).toEqual(['A.mp4', 'B.mp4', 'B.mp4', 'C.mp4']);
  });

  test('FLOW-01 F-015.R6 F-018.R1 a failed export leaves the project as it was and still warns on leaving; lowering the resolution is offered', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page, 'effects=fast&lang=en-US&exportFault=failed');
    await addVideos(page, ['A.mp4', 'B.mp4']);
    await chooseNineSixteen(page);
    const before = await stateOf(page);
    expect(await warns(page)).toBe(true);

    const p = await openExportAt1080(page);
    await p.getByRole('button', { name: text('en-US', 'action.export'), exact: true }).click();
    const alert = page.getByRole('alertdialog', { name: text('en-US', 'export.failed_title') });
    await expect(alert).toBeVisible({ timeout: 60_000 });
    await expect(alert).toContainText(text('en-US', 'error.export_failed'));
    // The project is unchanged and not counted as exported; the user can go back and pick a lower size.
    expect(await stateOf(page)).toBe(before);
    expect(await unexported(page)).toBe(true);
    expect(await warns(page)).toBe(true);
    await alert.getByRole('button', { name: text('en-US', 'action.change_settings') }).click();
    await expect(panel(page).getByRole('radio', { name: '720', exact: true })).toBeEnabled();
  });
});
