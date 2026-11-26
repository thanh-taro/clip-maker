// F-028 colour replace through the real UI on the app harness (tests/harness/app.html: the real `main()`, workers
// and compositor): CMP-Inspector's Colour replace group (cards, Add, the limit, Remove, Range and Softness, Reset),
// pick mode on CMP-Preview (pointer click, the touch magnifier, the keyboard marker, Esc and Cancel, grey and faint
// picks, the ungraded picture, gestures that never move the clip, Play), the From picker's grey refusal, and the help
// text in both languages. The rendered measures (hue reached, lightness kept, ΔE00) are the engine's
// (tests/unit/compositor.colour-replace.test.ts, tests/e2e/colour-tools.spec.ts). Axe at 1280 and 320 px in en-US and
// vi-VN, in pick mode too; screenshots go to .build-my-app/reports/screens/F-028 (Chromium only).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ClipSummary } from '../harness/app';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId, params: Record<string, string | number> = {}): string =>
  (CATALOG[lang][id] as string).replace(/\{(\w+)\}/g, (_, k: string) => String(params[k]));
const SHOTS = fileURLToPath(new URL('../../.build-my-app/reports/screens/F-028/', import.meta.url));

type Point = readonly [number, number];
interface Harness {
  appHarness: {
    project(): { steps: number };
    clips(): ClipSummary[];
    setPlayhead(seconds: number): void;
    preview(): { state: string; time: number };
    stripes(width: number, height: number, colours: readonly (readonly number[])[]): Promise<number[]>;
    pixels(png: string, points: readonly Point[]): Promise<{ width: number; height: number; at: number[][] }>;
  };
}
const h = (page: Page) => page.evaluate.bind(page);
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const stepsOf = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as Harness).appHarness.project())).steps;
const replaceOf = async (page: Page, i = 0) => (await clipsOf(page))[i]!.colourTools?.replace ?? [];

// Five flat patches, each a fifth of the width: the frame's centre (0.5) is in the middle of GREEN, 0.7 of BLUE.
const RED = [200, 40, 30];
const ORANGE = [220, 140, 40];
const GREEN = [46, 158, 58];
const BLUE = [40, 80, 220];
const GREY = [128, 128, 128];
const FAINT = [154, 138, 138]; // C* about 8: faint (RULE-25)
const PATCHES = [RED, ORANGE, GREEN, BLUE, GREY];
const rgbOf = (s: string): number[] => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const close = (got: string, want: readonly number[], tol = 3): boolean =>
  rgbOf(got).every((v, i) => Math.abs(v - want[i]!) <= tol);

async function open(page: Page, lang: Language): Promise<void> {
  await page.goto(`${APP}?effects=fast&lang=${lang}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

async function add(page: Page, photos: readonly (readonly (readonly number[])[])[], lang: Language): Promise<void> {
  const files = await Promise.all(
    photos.map(async (c, i) => {
      const bytes = await h(page)(([c]) => (window as unknown as Harness).appHarness.stripes(320, 180, c), [
        c,
      ] as const);
      return { name: `p${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(bytes) };
    }),
  );
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
  for (const x of await page.locator('.tk-notice__close').all()) await x.click();
}

const timeline = (page: Page, lang: Language) => page.getByRole('region', { name: text(lang, 'timeline.label') });
const clipButton = (page: Page, name: string, lang: Language = 'en-US') =>
  timeline(page, lang).getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')} `) });
const inspector = (page: Page, lang: Language) =>
  page.getByRole('complementary', { name: text(lang, 'inspector.label') });
const group = (scope: Locator) => scope.locator('[data-tool="replace"]');
const addButton = (scope: Locator) => scope.locator('[data-action="replace-add"]');
const card = (scope: Locator, i: number) => scope.locator(`[data-replacement="${i}"]`);
const canvas = (page: Page) => page.locator('.tk-frame canvas');
const pill = (page: Page) => page.locator('[data-section="pick-mode"]');

/** Opens the app at 1280 px with these photos, selects the first, opens Adjust and the Colour replace group. */
async function setUp(
  page: Page,
  photos: readonly (readonly (readonly number[])[])[] = [PATCHES],
  lang: Language = 'en-US',
): Promise<Locator> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, lang);
  await add(page, photos, lang);
  await clipButton(page, 'p1.png', lang).click();
  await inspector(page, lang)
    .getByRole('tab', { name: text(lang, 'inspector.adjust') })
    .click();
  const panel = inspector(page, lang).getByRole('tabpanel', { name: text(lang, 'inspector.adjust') });
  await expect(panel).toBeVisible();
  await openReplace(panel);
  return panel;
}

async function openReplace(scope: Locator): Promise<Locator> {
  const b = scope.locator('[data-action="toggle-replace"]');
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await expect(b).toHaveAttribute('aria-expanded', 'true');
  return group(scope);
}

/** Client coordinates of a point of the preview frame (fractions). */
async function at(page: Page, [x, y]: Point): Promise<Point> {
  const b = (await canvas(page).boundingBox())!;
  return [b.x + x * b.width, b.y + y * b.height];
}

async function clickFrame(page: Page, p: Point): Promise<void> {
  const [x, y] = await at(page, p);
  await page.mouse.click(x, y);
}

async function previewAt(page: Page, points: readonly Point[]): Promise<number[][]> {
  const png = (await canvas(page).screenshot()).toString('base64');
  return (await h(page)(([p, pts]) => (window as unknown as Harness).appHarness.pixels(p, pts), [png, points] as const))
    .at;
}

async function expectPreview(page: Page, points: readonly Point[], check: (c: number[][]) => boolean): Promise<void> {
  let last: number[][] = [];
  await expect
    .poll(
      async () => {
        last = await previewAt(page, points);
        return check(last);
      },
      { timeout: 15_000, message: 'preview colours' },
    )
    .toBe(true)
    .catch((e: unknown) => {
      throw new Error(`${String(e)}\nlast colours: ${JSON.stringify(last)}`);
    });
}
const near = (got: readonly number[], want: readonly number[], tol: number): boolean =>
  want.every((v, i) => Math.abs(got[i]! - v) <= tol);

async function axe(page: Page): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

async function shot(page: Page, name: string, browserName: string): Promise<void> {
  if (browserName !== 'chromium') return;
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

/** Adds a replacement by picking the patch at `p` (pointer), and waits for it. */
async function addByPick(page: Page, panel: Locator, p: Point): Promise<void> {
  const n = (await replaceOf(page)).length;
  await addButton(panel).click();
  await expect(pill(page)).toBeVisible();
  await clickFrame(page, p);
  await expect.poll(async () => (await replaceOf(page)).length).toBe(n + 1);
  await expect(pill(page)).toHaveCount(0);
}

test.describe('F-028 colour replace (app harness)', () => {
  test('F-028.AC1 F-028.R8 Add colour to replace shows the ungraded source; a click on a red patch adds From = To = that colour as one step, pick mode ends and the graded picture returns unchanged', async ({
    page,
  }) => {
    const panel = await setUp(page);
    // A graded clip: brightness up, so the ungraded picture is told apart.
    const field = panel.locator('[data-control="adjust-brightness-field"]');
    await field.fill('60');
    await field.press('Enter');
    const red: Point = [0.1, 0.5];
    const [graded] = await previewAt(page, [red]);
    expect(near(graded!, RED, 10)).toBe(false);
    const steps = await stepsOf(page);
    await addButton(panel).click();
    await expect(addButton(panel)).toHaveAttribute('aria-pressed', 'true');
    await expect(pill(page)).toContainText(text('en-US', 'replace.picking'));
    // Pick mode shows the clip's source picture, without its adjustments.
    await expectPreview(page, [red], ([c]) => near(c!, RED, 4));
    expect(await stepsOf(page)).toBe(steps);
    await clickFrame(page, red);
    await expect.poll(async () => (await replaceOf(page)).length).toBe(1);
    const [r] = await replaceOf(page);
    expect(close(r!.from, RED) && r!.to === r!.from).toBe(true);
    expect([r!.range, r!.softness]).toEqual([30, 50]);
    expect(await stepsOf(page)).toBe(steps + 1);
    await expect(pill(page)).toHaveCount(0);
    await expect(page.locator('.tk-preview-status')).toHaveText(text('en-US', 'replace.picked', { hex: r!.from }));
    // The graded picture returns, unchanged by the new replacement (To equals From).
    await expectPreview(page, [red], ([c]) => near(c!, graded!, 2));
  });

  test('F-028.AC2 F-028.R1 with three replacements Add is unavailable with COPY-replace.limit; Remove (one step) makes it available again', async ({
    page,
  }) => {
    const panel = await setUp(page);
    for (const p of [
      [0.1, 0.5],
      [0.3, 0.5],
      [0.5, 0.5],
    ] as Point[])
      await addByPick(page, panel, p);
    const g = group(panel);
    await expect(g.locator('[data-replacement]')).toHaveCount(3);
    await expect(addButton(panel)).toBeDisabled();
    await expect(g.locator('[data-notice="replace_limit"]')).toHaveText(text('en-US', 'replace.limit'));
    await expect(addButton(panel)).toHaveAttribute(
      'aria-describedby',
      (await g.locator('[data-notice="replace_limit"]').getAttribute('id'))!,
    );
    await expect(card(g, 0).getByRole('heading')).toHaveText(text('en-US', 'replace.item', { n: 1 }));
    const steps = await stepsOf(page);
    await card(g, 1)
      .getByRole('button', { name: text('en-US', 'replace.remove') })
      .click();
    expect(await stepsOf(page)).toBe(steps + 1);
    expect((await replaceOf(page)).map((r) => close(r.from, GREEN))).toEqual([false, true]);
    await expect(addButton(panel)).toBeEnabled();
    await expect(g.locator('[data-notice="replace_limit"]')).toHaveCount(0);
  });

  test('F-028.AC4 RULE-20 NFR-06 started by keyboard the marker takes focus; Shift+Right twice then Enter picks 20 % right of the centre; its value reads COPY-replace.marker_value; Esc cancels with no change', async ({
    page,
  }) => {
    const panel = await setUp(page);
    await addButton(panel).focus();
    await page.keyboard.press('Enter');
    await expect(pill(page)).toContainText(text('en-US', 'replace.picking_keys'));
    const marker = page.getByRole('slider', { name: text('en-US', 'replace.marker') });
    await expect(marker).toBeFocused();
    await expect(marker).toHaveAttribute('aria-valuenow', '50');
    await expect(marker).toHaveAttribute('aria-valuetext', new RegExp(`^#[0-9A-F]{6}, 50 %, 50 %$`));
    expect(close((await marker.getAttribute('data-hex'))!, GREEN)).toBe(true);
    // Esc: pick mode ends, nothing changes, focus returns to Add.
    const steps = await stepsOf(page);
    await page.keyboard.press('Escape');
    await expect(pill(page)).toHaveCount(0);
    expect(await stepsOf(page)).toBe(steps);
    expect(await replaceOf(page)).toEqual([]);
    await expect(addButton(panel)).toBeFocused();
    // Again: Shift+Right twice, then Enter.
    await page.keyboard.press('Enter');
    await expect(marker).toBeFocused();
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(marker).toHaveAttribute('aria-valuenow', '70');
    await expect(marker).toHaveAttribute('aria-valuetext', new RegExp(`, 70 %, 50 %$`));
    await expect.poll(async () => close((await marker.getAttribute('data-hex')) ?? '#000000', BLUE)).toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await replaceOf(page)).length).toBe(1);
    expect(close((await replaceOf(page))[0]!.from, BLUE)).toBe(true);
    expect(await stepsOf(page)).toBe(steps + 1);
    await expect(pill(page)).toHaveCount(0);
  });

  test('F-028.AC5 F-028.R2 starting pick mode pauses playback; with the playhead outside the selected clip it moves to the clip’s first frame, without an undo step', async ({
    page,
  }) => {
    const panel = await setUp(page, [PATCHES, PATCHES]);
    await clipButton(page, 'p2.png').click();
    await openReplace(panel);
    const p2 = (await clipsOf(page))[1]!;
    // The playhead on clip 1, playing.
    await h(page)(() => (window as unknown as Harness).appHarness.setPlayhead(0.2));
    await page.locator('[data-action="play-pause"]').first().click();
    await expect
      .poll(async () => (await h(page)(() => (window as unknown as Harness).appHarness.preview())).state)
      .toBe('playing');
    const steps = await stepsOf(page);
    await addButton(panel).click();
    await expect(pill(page)).toBeVisible();
    const pv = await h(page)(() => (window as unknown as Harness).appHarness.preview());
    expect(pv.state).toBe('paused');
    expect(pv.time).toBe(p2.start);
    expect(await stepsOf(page)).toBe(steps);
    // The playhead on the clip stays.
    await page.locator('[data-action="pick-cancel"]').click();
    await h(page)(([t]) => (window as unknown as Harness).appHarness.setPlayhead(t), [p2.start + 0.5] as const);
    const before = (await h(page)(() => (window as unknown as Harness).appHarness.preview())).time;
    await addButton(panel).click();
    await expect(pill(page)).toBeVisible();
    expect((await h(page)(() => (window as unknown as Harness).appHarness.preview())).time).toBe(before);
  });

  test('F-028.AC8 F-028.R4 a click on a grey wall adds nothing, shows COPY-notice.replace_grey and keeps pick mode on; for Colour 1 its From is unchanged', async ({
    page,
  }) => {
    const panel = await setUp(page);
    const steps = await stepsOf(page);
    await addButton(panel).click();
    await clickFrame(page, [0.9, 0.5]);
    await expect(page.locator('[data-notice="replace_grey"]')).toContainText(text('en-US', 'notice.replace_grey'));
    await expect(pill(page)).toBeVisible();
    expect(await replaceOf(page)).toEqual([]);
    expect(await stepsOf(page)).toBe(steps);
    // A click outside the clip's picture? Here the photo fills the frame: pick red to finish.
    await clickFrame(page, [0.1, 0.5]);
    await expect.poll(async () => (await replaceOf(page)).length).toBe(1);
    const from = (await replaceOf(page))[0]!.from;
    await card(group(panel), 0).locator('[data-action="replace-pick-0"]').click();
    await expect(card(group(panel), 0).locator('[data-action="replace-pick-0"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await clickFrame(page, [0.9, 0.5]);
    await expect(pill(page)).toBeVisible();
    expect((await replaceOf(page))[0]!.from).toBe(from);
  });

  test('F-028.AC17 F-028.R2 Pick from preview on Colour 1 with To blue sets From to the green clicked and keeps To, as one step', async ({
    page,
  }) => {
    const panel = await setUp(page);
    await addByPick(page, panel, [0.1, 0.5]);
    const c = card(group(panel), 0);
    // To blue, typed in the picker.
    await c.locator('[data-action="colour-replace-0-to"]').click();
    const dialog = c.getByRole('dialog', { name: text('en-US', 'picker.title') });
    await expect(dialog).toContainText(text('en-US', 'picker.editing', { name: text('en-US', 'replace.to') }));
    const hexField = dialog.getByRole('textbox', { name: text('en-US', 'picker.hex') });
    await hexField.fill('#0050FF');
    await hexField.press('Enter');
    await dialog.getByRole('button', { name: text('en-US', 'picker.done') }).click();
    expect((await replaceOf(page))[0]!.to).toBe('#0050FF');
    const steps = await stepsOf(page);
    await c.locator('[data-action="replace-pick-0"]').click();
    await clickFrame(page, [0.5, 0.5]);
    await expect.poll(async () => close((await replaceOf(page))[0]!.from, GREEN)).toBe(true);
    expect((await replaceOf(page))[0]!.to).toBe('#0050FF');
    expect(await stepsOf(page)).toBe(steps + 1);
    await expect(c.locator('[data-action="replace-pick-0"]')).toBeFocused();
  });

  test('F-028.AC15 F-028.R4 a faint patch (C* about 8) is accepted as From with COPY-notice.replace_faint shown once', async ({
    page,
  }) => {
    const panel = await setUp(page, [[FAINT, FAINT, RED]]);
    await addButton(panel).click();
    await clickFrame(page, [0.2, 0.5]);
    await expect.poll(async () => (await replaceOf(page)).length).toBe(1);
    expect(close((await replaceOf(page))[0]!.from, FAINT)).toBe(true);
    await expect(page.locator('[data-notice="replace_faint"]')).toHaveCount(1);
    await expect(page.locator('[data-notice="replace_faint"]')).toContainText(text('en-US', 'notice.replace_faint'));
  });

  test('F-028.AC16 F-028.R8 in pick mode a drag or a pinch on the preview neither moves nor scales the clip; Play ends pick mode without a change and plays', async ({
    page,
  }) => {
    const panel = await setUp(page, [PATCHES, PATCHES]);
    const placement = (await clipsOf(page))[0]!.placement;
    const steps = await stepsOf(page);
    await addButton(panel).click();
    // A mouse drag (no pick: it ends outside the frame).
    const [x0, y0] = await at(page, [0.5, 0.5]);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 + 80, y0 + 40, { steps: 5 });
    await page.mouse.move(5, 5, { steps: 2 });
    await page.mouse.up();
    // A two-finger pinch (synthetic touch pointers on the pick layer).
    await page.locator('.tk-pick-layer').evaluate(
      (el, [x, y]) => {
        const ev = (type: string, id: number, cx: number) =>
          new PointerEvent(type, {
            pointerId: id,
            pointerType: 'touch',
            isPrimary: id === 1,
            clientX: cx,
            clientY: y,
            bubbles: true,
            button: 0,
          });
        el.dispatchEvent(ev('pointerdown', 1, x - 10));
        el.dispatchEvent(ev('pointerdown', 2, x + 10));
        window.dispatchEvent(ev('pointermove', 1, x - 60));
        window.dispatchEvent(ev('pointermove', 2, x + 60));
        window.dispatchEvent(ev('pointercancel', 2, x + 60));
        window.dispatchEvent(ev('pointercancel', 1, x - 60));
      },
      [x0, y0] as const,
    );
    expect((await clipsOf(page))[0]!.placement).toEqual(placement);
    expect(await stepsOf(page)).toBe(steps);
    await expect(pill(page)).toBeVisible();
    await expect(page.locator('.tk-place-layer')).toBeHidden();
    // Play: pick mode ends, playback starts, nothing changed.
    await page.locator('[data-action="play-pause"]').first().click();
    await expect(pill(page)).toHaveCount(0);
    await expect
      .poll(async () => (await h(page)(() => (window as unknown as Harness).appHarness.preview())).state)
      .toBe('playing');
    expect(await stepsOf(page)).toBe(steps);
    expect(await replaceOf(page)).toEqual([]);
  });

  test('F-028.AC11 F-028.R6 the first one’s Range Reset returns only it to 30; the group Reset removes every replacement; the group shows Changed with one at To = From', async ({
    page,
  }) => {
    const panel = await setUp(page);
    await addByPick(page, panel, [0.1, 0.5]);
    await addByPick(page, panel, [0.5, 0.5]);
    const g = group(panel);
    const toggleName = `${text('en-US', 'colour_tools.group_replace')} ${text('en-US', 'colour_tools.changed')}`;
    await expect(panel.getByRole('button', { name: toggleName, exact: true })).toBeVisible();
    for (const [i, v] of [
      [0, '70'],
      [1, '60'],
    ] as const) {
      const f = card(g, i).locator(`[data-control="replace-${i}-range-field"]`);
      await f.fill(v);
      await f.press('Enter');
    }
    await card(g, 0)
      .locator('[role="group"][data-control="replace-0-range"]')
      .getByRole('button', { name: text('en-US', 'action.reset') })
      .click();
    expect((await replaceOf(page)).map((r) => r.range)).toEqual([30, 60]);
    await panel.locator('[data-action="reset-replace"]').click();
    expect(await replaceOf(page)).toEqual([]);
    await expect(panel.locator('[data-action="toggle-replace"]')).toBeFocused();
  });

  test('F-028.R4 CMP-ColourPicker "refused (colour replace From)" a typed grey From is refused with COPY-notice.replace_grey under the field and the colour reverts', async ({
    page,
  }) => {
    const panel = await setUp(page);
    await addByPick(page, panel, [0.1, 0.5]);
    const from = (await replaceOf(page))[0]!.from;
    const c = card(group(panel), 0);
    await c.locator('[data-action="colour-replace-0-from"]').click();
    const dialog = c.getByRole('dialog', { name: text('en-US', 'picker.title') });
    const hexField = dialog.getByRole('textbox', { name: text('en-US', 'picker.hex') });
    await hexField.fill('#808080');
    await hexField.press('Enter');
    await expect(dialog.locator('[data-notice="replace_grey"]')).toHaveText(text('en-US', 'notice.replace_grey'));
    await expect(hexField).toHaveValue(from);
    expect((await replaceOf(page))[0]!.from).toBe(from);
  });

  test('F-028.AC3 F-028.R2 RULE-21 on touch, pressing and dragging shows a magnifier ringed in the colour under the finger; lifting picks it; the placement is unchanged', async ({
    page,
    browserName,
  }) => {
    const panel = await setUp(page);
    const placement = (await clipsOf(page))[0]!.placement;
    await addButton(panel).click();
    const [ax, ay] = await at(page, [0.1, 0.6]);
    const [bx] = await at(page, [0.7, 0.6]);
    const layer = page.locator('.tk-pick-layer');
    const touch = (type: string, x: number, target: 'layer' | 'window') =>
      layer.evaluate(
        (el, [t, cx, cy, where]) => {
          const ev = new PointerEvent(t as string, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            clientX: cx as number,
            clientY: cy as number,
            bubbles: true,
            button: 0,
          });
          (where === 'layer' ? el : window).dispatchEvent(ev);
        },
        [type, x, ay, target] as const,
      );
    await touch('pointerdown', ax, 'layer');
    const lens = page.locator('.tk-pick-lens');
    await expect(lens).toBeVisible();
    await expect.poll(async () => close((await lens.getAttribute('data-hex')) ?? '#000000', RED)).toBe(true);
    for (let i = 1; i <= 6; i++) {
      await touch('pointermove', ax + ((bx - ax) * i) / 6, 'window');
      await page.waitForTimeout(60);
    }
    await expect.poll(async () => close((await lens.getAttribute('data-hex')) ?? '#000000', BLUE)).toBe(true);
    if (browserName === 'chromium') await page.screenshot({ path: `${SHOTS}magnifier-wide-en-US.png` });
    await touch('pointerup', bx, 'window');
    await expect(lens).toHaveCount(0);
    await expect.poll(async () => (await replaceOf(page)).length).toBe(1);
    expect(close((await replaceOf(page))[0]!.from, BLUE)).toBe(true);
    expect((await clipsOf(page))[0]!.placement).toEqual(placement);
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-028.AC12 F-028.R7 NFR-06 NFR-07 the Colour replace group shows COPY-replace.help; cards, pick mode and the marker pass axe at 1280 px; screenshots (${lang})`, async ({
      page,
      browserName,
    }) => {
      const panel = await setUp(page, [PATCHES], lang);
      const g = group(panel);
      await expect(g.locator('.tk-ctool__help').first()).toHaveText(text(lang, 'replace.help'));
      await addByPick(page, panel, [0.1, 0.5]);
      await addByPick(page, panel, [0.5, 0.5]);
      const f = card(g, 0).locator('[data-control="replace-0-range-field"]');
      await f.fill('45');
      await f.press('Enter');
      await panel.locator('[data-action="toggle-replace"]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      for (const x of await page.locator('.tk-notice__close').all()) await x.click();
      await shot(page, `inspector-replace-wide-${lang}`, browserName);
      await axe(page);
      // Pick mode by pointer, then by keyboard (the marker).
      await card(g, 0).locator('[data-action="replace-pick-0"]').click();
      await expect(pill(page)).toBeVisible();
      await shot(page, `pick-mode-wide-${lang}`, browserName);
      await axe(page);
      await page.keyboard.press('Escape');
      await addButton(panel).focus();
      await page.keyboard.press('Enter');
      const marker = page.getByRole('slider', { name: text(lang, 'replace.marker') });
      await expect(marker).toBeFocused();
      await expect(pill(page)).toContainText(text(lang, 'replace.picking_keys'));
      await shot(page, `pick-keys-wide-${lang}`, browserName);
      await axe(page);
      await page.keyboard.press('Escape');
    });

    test(`F-028 CMP-Inspector "colour replace (1.3.0)" narrow RULE-21 NFR-07 the phone Adjust sheet: cards at 320 px (From → To on one row, Pick full width, Remove an icon button), pick mode with the sheet open, no sideways scroll, axe (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      await add(page, [PATCHES], lang);
      await clipButton(page, 'p1.png', lang).click();
      await page.getByRole('tab', { name: text(lang, 'inspector.adjust') }).click();
      const sheet = page.getByRole('tabpanel', { name: text(lang, 'inspector.adjust') });
      await expect(sheet).toBeVisible();
      const g = await openReplace(sheet);
      await expect(g.locator('.tk-ctool__help').first()).toHaveText(text(lang, 'replace.help'));
      await addByPick(page, sheet, [0.1, 0.5]);
      const c = card(g, 0);
      const from = c.locator('[data-action="colour-replace-0-from"]');
      const to = c.locator('[data-action="colour-replace-0-to"]');
      const pick = c.locator('[data-action="replace-pick-0"]');
      const remove = c.getByRole('button', { name: text(lang, 'replace.remove') });
      const [fb, tb, pb, cb, rb] = await Promise.all(
        [from, to, pick, c, remove].map(async (l) => (await l.boundingBox())!),
      );
      expect(Math.abs(fb!.y - tb!.y)).toBeLessThan(2);
      expect(pb!.width).toBeGreaterThan(cb!.width * 0.8);
      for (const b of [fb!, tb!, pb!, rb!]) expect(b.height).toBeGreaterThanOrEqual(44);
      await expect(remove).toHaveText('');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      const [sw, cw] = await sheet.locator('.tk-sheet__body').evaluate((el) => [el.scrollWidth, el.clientWidth]);
      expect(sw).toBeLessThanOrEqual(cw!);
      await c.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      for (const x of await page.locator('.tk-notice__close').all()) await x.click();
      await shot(page, `sheet-replace-narrow-${lang}`, browserName);
      await axe(page);
      // Pick mode: the sheet stays open and the preview above takes the pick.
      await pick.click();
      await expect(pill(page)).toBeVisible();
      await expect(sheet).toBeVisible();
      const pb2 = (await pill(page).boundingBox())!;
      expect(pb2.x + pb2.width).toBeLessThanOrEqual(320);
      await shot(page, `pick-mode-narrow-${lang}`, browserName);
      await axe(page);
      await clickFrame(page, [0.5, 0.5]);
      await expect.poll(async () => close((await replaceOf(page))[0]!.from, GREEN)).toBe(true);
    });
  }
});
