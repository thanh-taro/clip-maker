// F-003 arranging clips through the real UI (MOD-App + MOD-Timeline, real decoders) on the app harness
// (tests/harness/app.html): the timeline region, selecting, moving by drag and by visible controls and
// keys, deleting and duplicating with RULE-05 cross-fades and the RULE-03 refusal, the phone tab bar's
// Edit sheet with notices above an open sheet (build-spec-questions 74e), and axe at 320 and 1280 px in
// en-US and vi-VN. Settings that have no control yet (photo length F-004, speed F-005, look F-008,
// cross-fade F-009) are set through `appHarness.setClip()`; undo through `appHarness.undo()` (F-014).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSetup, ClipSummary, ProjectSummary } from '../harness/app';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}
const VIDEO_BYTES = readFileSync(fileURLToPath(new URL('../fixtures/media/mp4-faststart.mp4', import.meta.url)));
/** A 2 s phone-style video (the F-001 fixture). */
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
    undo(): void;
    preview(): { playhead: number };
  };
}
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const stepsOf = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as Harness).appHarness.project())).steps;
const order = async (page: Page) => (await clipsOf(page)).map((c) => c.source);
const setClip = (page: Page, index: number, setup: ClipSetup) =>
  page.evaluate(([i, s]) => (window as unknown as Harness).appHarness.setClip(i, s), [index, setup] as const);

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

const timeline = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('region', { name: text(lang, 'timeline.label') });
const clip = (page: Page, name: string, nth = 0, lang: Language = 'en-US'): Locator =>
  timeline(page, lang)
    .getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')} \\d:\\d\\d$`) })
    .nth(nth);
/** INV-03: the clips sit end to end from 0 (cross-fades overlap by their length). */
const gapFree = (clips: readonly ClipSummary[]): boolean =>
  clips.every((c, i) =>
    i === 0 ? c.start === 0 : Math.abs(c.start - (clips[i - 1]!.end - clips[i - 1]!.crossFade)) < 0.001,
  );
const tool = (page: Page, id: CopyId, lang: Language = 'en-US') =>
  timeline(page, lang)
    .getByRole('toolbar')
    .getByRole('button', { name: text(lang, id) });
const notice = (page: Page, tag: string) => page.locator(`[data-notice="${tag}"]`);

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

const ABC = () => [video('A.mp4'), photo('B.png'), video('C.mp4')];

test.describe('F-003 arrange clips (app harness)', () => {
  test('F-003.R1 the timeline shows each clip with its name and length; a selected clip is shown and its actions become available', async ({
    page,
  }) => {
    await open(page);
    // Empty: the actions are unavailable, with readable labels.
    await expect(tool(page, 'action.delete')).toHaveAttribute('aria-disabled', 'true');
    await add(page, ABC());
    await expect(timeline(page).getByRole('button', { name: /^(A\.mp4|B\.png|C\.mp4) / })).toHaveCount(3);
    await expect(clip(page, 'A.mp4')).toHaveAccessibleName('A.mp4 0:02');
    await expect(clip(page, 'B.png')).toHaveAccessibleName('B.png 0:03');
    for (const id of ['action.delete', 'action.duplicate', 'action.move_left', 'action.move_right'] as const)
      await expect(tool(page, id)).toHaveAttribute('aria-disabled', 'true');
    await clip(page, 'B.png').click();
    await expect(clip(page, 'B.png')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-state', 'selected');
    for (const id of ['action.delete', 'action.duplicate', 'action.move_left', 'action.move_right'] as const)
      await expect(tool(page, id)).not.toHaveAttribute('aria-disabled', 'true');
    expect((await clipsOf(page)).map((c) => c.selected)).toEqual([false, true, false]);
    // A click on empty track space clears the selection (RULE-21); selecting is not an undo step.
    const track = timeline(page).locator('.tk-track');
    const box = (await track.boundingBox())!;
    await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
    await expect(clip(page, 'B.png')).toHaveAttribute('aria-pressed', 'false');
    expect(await stepsOf(page)).toBe(1);
  });

  test('F-003.AC1 dragging C to the start gives C, A, B with no gaps, as one undo step', async ({ page }) => {
    await open(page);
    await add(page, ABC());
    const c = (await clip(page, 'C.mp4').boundingBox())!;
    const a = (await clip(page, 'A.mp4').boundingBox())!;
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + 20, a.y + a.height / 2, { steps: 12 });
    await expect(timeline(page).locator('.tk-track__drop')).toBeVisible();
    await page.mouse.up();
    await expect.poll(() => order(page)).toEqual(['C.mp4', 'A.mp4', 'B.png']);
    const clips = await clipsOf(page);
    expect(gapFree(clips)).toBe(true);
    expect(clips[0]!.selected).toBe(true);
    expect(await stepsOf(page)).toBe(2);
    await page.evaluate(() => (window as unknown as Harness).appHarness.undo());
    expect(await order(page)).toEqual(['A.mp4', 'B.png', 'C.mp4']);
  });

  test('F-003.AC2 deleting B leaves A and C adjacent and the project shorter by B', async ({ page }) => {
    await open(page);
    await add(page, ABC());
    const before = await clipsOf(page);
    await clip(page, 'B.png').click();
    await tool(page, 'action.delete').click();
    const clips = await clipsOf(page);
    expect(clips.map((x) => x.source)).toEqual(['A.mp4', 'C.mp4']);
    expect(clips[1]!.start).toBe(clips[0]!.end);
    // Shorter by B's 3 s.
    expect(clips[1]!.end).toBeCloseTo(before[2]!.end - 3, 3);
    // Nothing is selected afterwards, so the actions are unavailable again.
    await expect(tool(page, 'action.delete')).toHaveAttribute('aria-disabled', 'true');
    expect(await stepsOf(page)).toBe(2);
  });

  test('F-003.AC3 duplicating A with a look and speed 2× puts a copy with the same look and speed right after A', async ({
    page,
  }) => {
    await open(page);
    await add(page, [video('A.mp4'), photo('B.png')]);
    await setClip(page, 0, { look: 'film-retro', speedPct: 200 });
    await clip(page, 'A.mp4').click();
    await tool(page, 'action.duplicate').click();
    const clips = await clipsOf(page);
    expect(clips.map((x) => [x.source, x.speed, x.look])).toEqual([
      ['A.mp4', 200, 'film-retro'],
      ['A.mp4', 200, 'film-retro'],
      ['B.png', 100, null],
    ]);
    // The copy follows A on the timeline and the original stays selected.
    await expect(clip(page, 'A.mp4', 1)).toBeVisible();
    expect(clips.map((x) => x.selected)).toEqual([true, false, false]);
  });

  test('F-003.AC4 with a cross-fade between A and B, moving B after C removes the A–B cross-fade', async ({ page }) => {
    await open(page);
    await add(page, ABC());
    await setClip(page, 0, { crossFadeTenths: 5 });
    // The cross-fade marker (a bow-tie) sits on the A–B join.
    await expect(timeline(page).locator('.tk-xfade')).toHaveCount(1);
    await clip(page, 'B.png').click();
    await tool(page, 'action.move_right').click();
    const clips = await clipsOf(page);
    expect(clips.map((x) => [x.source, x.crossFade])).toEqual([
      ['A.mp4', 0],
      ['C.mp4', 0],
      ['B.png', 0],
    ]);
    await expect(timeline(page).locator('.tk-xfade')).toHaveCount(0);
  });

  test('F-003.AC5 by keyboard only a clip moves one place left, is deleted, and another is duplicated, through visible controls', async ({
    page,
    browserName,
  }) => {
    await open(page);
    await add(page, ABC());
    // Focus moves through the clips in track order; Enter selects (a toggle button, announced as pressed).
    // (Safari moves Tab to buttons with Option+Tab unless "Press Tab to highlight each item" is on.)
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await clip(page, 'A.mp4').focus();
    await page.keyboard.press(tab);
    await expect(clip(page, 'B.png')).toBeFocused();
    await page.keyboard.press(tab);
    await expect(clip(page, 'C.mp4')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(clip(page, 'C.mp4')).toHaveAttribute('aria-pressed', 'true');
    // The visible Move earlier control, reached by keyboard.
    await tool(page, 'action.move_left').focus();
    await page.keyboard.press('Enter');
    expect(await order(page)).toEqual(['A.mp4', 'C.mp4', 'B.png']);
    // Delete it with the visible control…
    await tool(page, 'action.delete').focus();
    await page.keyboard.press('Enter');
    expect(await order(page)).toEqual(['A.mp4', 'B.png']);
    // …then select another and duplicate it with the visible control.
    await clip(page, 'A.mp4').focus();
    await page.keyboard.press('Space');
    await tool(page, 'action.duplicate').focus();
    await page.keyboard.press('Enter');
    expect(await order(page)).toEqual(['A.mp4', 'A.mp4', 'B.png']);
    // RULE-20 keys do the same with focus on a clip: Alt+Left, Mod+D, Delete.
    await clip(page, 'B.png').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Alt+ArrowLeft');
    expect(await order(page)).toEqual(['A.mp4', 'B.png', 'A.mp4']);
    await page.keyboard.press(browserName === 'webkit' ? 'Meta+KeyD' : 'ControlOrMeta+KeyD');
    expect(await order(page)).toEqual(['A.mp4', 'B.png', 'B.png', 'A.mp4']);
    await page.keyboard.press('Delete');
    expect(await order(page)).toEqual(['A.mp4', 'B.png', 'A.mp4']);
    // Focus stays on the track after the focused clip was deleted.
    await expect(timeline(page).locator('.tk-clip:focus')).toHaveCount(1);
    expect(await stepsOf(page)).toBe(7);
  });

  test('F-003.AC6 with cross-fades A–B and B–C, deleting B leaves A and C adjacent with no cross-fade', async ({
    page,
  }) => {
    await open(page);
    await add(page, ABC());
    await setClip(page, 0, { crossFadeTenths: 5 });
    await setClip(page, 1, { crossFadeTenths: 5 });
    await expect(timeline(page).locator('.tk-xfade')).toHaveCount(2);
    await clip(page, 'B.png').click();
    await page.keyboard.press('Backspace');
    const clips = await clipsOf(page);
    expect(clips.map((x) => [x.source, x.crossFade])).toEqual([
      ['A.mp4', 0],
      ['C.mp4', 0],
    ]);
    expect(clips[1]!.start).toBe(clips[0]!.end);
    await expect(timeline(page).locator('.tk-xfade')).toHaveCount(0);
  });

  test('F-003.AC7 duplicating A (cross-fading into B) gives A, A′, B with only A′ cross-fading into B', async ({
    page,
  }) => {
    await open(page);
    await add(page, [video('A.mp4'), photo('B.png')]);
    await setClip(page, 0, { crossFadeTenths: 5 });
    await clip(page, 'A.mp4').click();
    await tool(page, 'action.duplicate').click();
    const clips = await clipsOf(page);
    expect(clips.map((x) => [x.source, x.crossFade])).toEqual([
      ['A.mp4', 0],
      ['A.mp4', 0.5],
      ['B.png', 0],
    ]);
    // A′ follows A directly; B overlaps A′ by the 0.5 s cross-fade.
    expect(clips[1]!.start).toBe(clips[0]!.end);
    expect(clips[2]!.start).toBeCloseTo(clips[1]!.end - 0.5, 3);
  });

  test('F-003.AC8 in a 9 min 59.5 s project whose only cross-fade is 1 s, a reorder that would remove it is refused with COPY-notice.length_full', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await open(page);
    // P0 (60 s, a 1 s cross-fade into P1), P1 … P8 (60 s each), P9 (59.5 s) and P10 (1 s).
    await add(
      page,
      Array.from({ length: 11 }, (_, i) => photo(`P${i}.png`)),
    );
    await setClip(page, 0, { crossFadeTenths: 10 });
    await setClip(page, 10, { seconds: 1 });
    for (let i = 0; i < 9; i++) await setClip(page, i, { seconds: 60 });
    await setClip(page, 9, { seconds: 59.5 });
    expect((await clipsOf(page)).at(-1)!.end).toBe(599.5);
    const before = await stepsOf(page);
    await clip(page, 'P1.png').click();
    await tool(page, 'action.move_right').click();
    await expect(notice(page, 'length_full')).toHaveText(text('en-US', 'notice.length_full'));
    expect((await order(page)).slice(0, 3)).toEqual(['P0.png', 'P1.png', 'P2.png']);
    expect((await clipsOf(page))[0]!.crossFade).toBe(1);
    expect(await stepsOf(page)).toBe(before);
  });

  test('RULE-03 a duplicate that does not fit at all is refused with COPY-notice.length_full', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await add(
      page,
      Array.from({ length: 10 }, (_, i) => photo(`P${i}.png`)),
    );
    for (let i = 0; i < 10; i++) await setClip(page, i, { seconds: 60 });
    await clip(page, 'P0.png').click();
    await tool(page, 'action.duplicate').click();
    await expect(notice(page, 'length_full')).toBeVisible();
    expect(await clipsOf(page)).toHaveLength(10);
  });

  test('F-002.R3 pressing and dragging on the ruler scrubs the playhead', async ({ page }) => {
    await open(page);
    await add(page, ABC());
    const ruler = (await timeline(page).locator('.tk-ruler').boundingBox())!;
    const track = (await timeline(page).locator('.tk-track').boundingBox())!;
    // The project is 7 s and fills the track: the middle of the track is 3.5 s.
    await page.mouse.move(track.x + track.width / 2, ruler.y + ruler.height / 2);
    await page.mouse.down();
    await page.mouse.move(track.x + (track.width * 2) / 7, ruler.y + ruler.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect
      .poll(async () => (await page.evaluate(() => (window as unknown as Harness).appHarness.preview())).playhead)
      .toBeCloseTo(2, 0);
  });

  test('RULE-21 on touch a clip moves after a 0.4 s hold and drag; a quick swipe does not move it', async ({
    page,
  }) => {
    await open(page);
    await add(page, ABC());
    const touch = async (name: string, toX: number, holdMs: number) => {
      const b = (await clip(page, name).boundingBox())!;
      await page.evaluate(
        async ({ x, y, toX, holdMs }) => {
          const at = (cx: number) => document.elementFromPoint(cx, y) ?? document.body;
          const target = at(x);
          const fire = (el: Element, type: string, cx: number) =>
            el.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                pointerId: 7,
                pointerType: 'touch',
                clientX: cx,
                clientY: y,
                isPrimary: true,
                button: 0,
              }),
            );
          fire(target, 'pointerdown', x);
          await new Promise((r) => setTimeout(r, holdMs));
          for (let i = 1; i <= 6; i++) fire(target, 'pointermove', x + ((toX - x) * i) / 6);
          fire(target, 'pointerup', toX);
        },
        { x: b.x + b.width / 2, y: b.y + b.height / 2, toX, holdMs },
      );
    };
    const a = (await clip(page, 'A.mp4').boundingBox())!;
    await touch('C.mp4', a.x + 4, 0);
    expect(await order(page)).toEqual(['A.mp4', 'B.png', 'C.mp4']);
    await touch('C.mp4', a.x + 4, 500);
    await expect.poll(() => order(page)).toEqual(['C.mp4', 'A.mp4', 'B.png']);
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-003.R6 NFR-06 the timeline with a selected clip passes axe at 1280 px (${lang})`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, lang);
      await axe(page);
      await add(page, ABC(), lang);
      await clip(page, 'B.png', 0, lang).click();
      await expect(tool(page, 'action.move_left', lang)).toBeVisible();
      await axe(page);
    });

    test(`F-003.R6 NFR-06 the phone Edit sheet moves, duplicates and deletes, and passes axe at 320 px (${lang})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      await add(page, ABC(), lang);
      // No sheet is open by default; the timeline's own toolbar is hidden on narrow layouts.
      const tab = page.getByRole('tab', { name: text(lang, 'inspector.edit') });
      await expect(tab).toHaveAttribute('aria-selected', 'false');
      await expect(timeline(page, lang).getByRole('toolbar')).toBeHidden();
      await axe(page);
      await clip(page, 'B.png', 0, lang).click();
      await tab.click();
      const sheet = page.getByRole('tabpanel', { name: text(lang, 'inspector.edit') });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('heading')).toHaveText(text(lang, 'inspector.label'));
      await expect(sheet).toContainText('B.png');
      // The transport and the timeline peek stay visible above the open sheet.
      const peek = (await timeline(page, lang).locator('.tk-track').boundingBox())!;
      const top = (await sheet.boundingBox())!.y;
      expect(peek.y + peek.height).toBeLessThanOrEqual(top + 1);
      await expect(page.getByRole('button', { name: text(lang, 'action.play') })).toBeVisible();
      await axe(page);
      await sheet.getByRole('button', { name: text(lang, 'action.move_left') }).click();
      expect(await order(page)).toEqual(['B.png', 'A.mp4', 'C.mp4']);
      await sheet.getByRole('button', { name: text(lang, 'action.duplicate') }).click();
      expect(await order(page)).toEqual(['B.png', 'B.png', 'A.mp4', 'C.mp4']);
      await sheet.getByRole('button', { name: text(lang, 'action.delete') }).click();
      expect(await order(page)).toEqual(['B.png', 'A.mp4', 'C.mp4']);
      // Every tile is touch-size (RULE-21).
      for (const b of await sheet.getByRole('button').all()) {
        const box = (await b.boundingBox())!;
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('CMP-Notice placement · narrow: notices sit above an open sheet (74e)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await open(page);
    await add(
      page,
      Array.from({ length: 10 }, (_, i) => photo(`P${i}.png`)),
    );
    for (let i = 0; i < 10; i++) await setClip(page, i, { seconds: 60 });
    await clip(page, 'P0.png').click();
    await page.getByRole('tab', { name: text('en-US', 'inspector.edit') }).click();
    const sheet = page.getByRole('tabpanel');
    await sheet.getByRole('button', { name: text('en-US', 'action.duplicate') }).click();
    const warn = notice(page, 'length_full');
    await expect(warn).toBeVisible();
    expect((await warn.boundingBox())!.y + (await warn.boundingBox())!.height).toBeLessThanOrEqual(
      (await sheet.boundingBox())!.y,
    );
    await warn.getByRole('button', { name: text('en-US', 'action.close') }).click();
    await expect(warn).toHaveCount(0);
    // The media panel's sheet overlays the editor (CMP-MediaPanel narrow): the stack moves up above it.
    const chooser = page.waitForEvent('filechooser');
    await sheet.getByRole('button', { name: text('en-US', 'action.add_media') }).click();
    await (await chooser).setFiles([]);
    const media = page.getByRole('dialog', { name: text('en-US', 'media.title') });
    await expect(media).toBeVisible();
    // Placing a photo again in a full project is refused: the notice shows above the media sheet.
    await media
      .getByRole('listitem')
      .filter({ hasText: 'P0.png' })
      .getByRole('button', { name: text('en-US', 'media.place_again') })
      .click();
    await expect(warn).toBeVisible();
    const w = (await warn.boundingBox())!;
    expect(w.y + w.height).toBeLessThanOrEqual((await media.boundingBox())!.y);
  });
});
