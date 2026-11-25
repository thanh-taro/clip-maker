// F-024…F-027 colour tools through the real UI on the app harness (tests/harness/app.html: the real `main()`,
// workers and compositor): CMP-Inspector's colour-tool groups after Effects (wide) and in the phone Adjust
// sheet (320 px), CMP-ColourPicker (popover and in place of the sheet's body), per-tool and per-row Reset,
// Reset all, Apply to all, Copy / Paste colour and the compare hold. The rendered measures (C*, ΔE00, hue
// reached) are the engine's (tests/unit/compositor.colour-tools.test.ts, tests/e2e/colour-tools.spec.ts);
// here the preview is read for the visible change (photos of flat stripes, `appHarness.pixels()`).
// Axe at 320 and 1280 px in en-US and vi-VN; screenshots of the new groups go to
// .build-my-app/reports/screens/F-024 … F-027 (Chromium only).
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
const shotsOf = (feature: string): string =>
  fileURLToPath(new URL(`../../.build-my-app/reports/screens/${feature}/`, import.meta.url));

type Point = readonly [number, number];
interface Harness {
  appHarness: {
    project(): { steps: number };
    clips(): ClipSummary[];
    setClip(index: number, setup: { look?: string }): void;
    state(): string;
    stripes(width: number, height: number, colours: readonly (readonly number[])[]): Promise<number[]>;
    pixels(png: string, points: readonly Point[]): Promise<{ width: number; height: number; at: number[][] }>;
  };
}
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const stepsOf = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as Harness).appHarness.project())).steps;
const stateOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.state());
const toolsOf = async (page: Page, i = 0) => (await clipsOf(page))[i]!.colourTools;

const RED = [220, 30, 30];
const BLUE = [30, 30, 220];
const DARK = [40, 40, 40];
const MID = [128, 128, 128];
const WHITE = [255, 255, 255];

async function open(page: Page, lang: Language): Promise<void> {
  await page.goto(`${APP}?effects=fast&lang=${lang}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

async function photo(page: Page, name: string, colours: readonly (readonly number[])[]) {
  const bytes = await page.evaluate(([c]) => (window as unknown as Harness).appHarness.stripes(320, 180, c), [
    colours,
  ] as const);
  return { name, mimeType: 'image/png', buffer: Buffer.from(bytes) };
}

async function add(page: Page, photos: readonly (readonly (readonly number[])[])[], lang: Language): Promise<void> {
  const files = await Promise.all(photos.map((c, i) => photo(page, `p${i + 1}.png`, c)));
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
  for (const close of await page.locator('.tk-notice__close').all()) await close.click();
}

const timeline = (page: Page, lang: Language) => page.getByRole('region', { name: text(lang, 'timeline.label') });
const clipButton = (page: Page, name: string, lang: Language = 'en-US') =>
  timeline(page, lang).getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')} `) });
const inspector = (page: Page, lang: Language) =>
  page.getByRole('complementary', { name: text(lang, 'inspector.label') });
const adjustPanel = (page: Page, lang: Language = 'en-US') =>
  inspector(page, lang).getByRole('tabpanel', { name: text(lang, 'inspector.adjust') });
const undoButton = (page: Page) =>
  page
    .getByRole('toolbar', { name: text('en-US', 'toolbar.label') })
    .getByRole('button', { name: text('en-US', 'action.undo'), exact: true });
const tool = (scope: Locator, name: string) => scope.locator(`[data-tool="${name}"]`);
const toggle = (scope: Locator, name: string) => scope.locator(`[data-action="toggle-${name}"]`);
const sliderOf = (scope: Locator, control: string) => scope.locator(`[data-control="${control}-slider"]`);
const fieldOf = (scope: Locator, control: string) => scope.locator(`[data-control="${control}-field"]`);
const rowOf = (scope: Locator, control: string) => scope.locator(`[role="group"][data-control="${control}"]`);

/** Opens the app at 1280 px with these photos, selects the first and opens its Adjust tab. */
async function setUp(
  page: Page,
  photos: readonly (readonly (readonly number[])[])[] = [[MID]],
  lang: Language = 'en-US',
): Promise<Locator> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, lang);
  await add(page, photos, lang);
  await clipButton(page, 'p1.png', lang).click();
  await inspector(page, lang)
    .getByRole('tab', { name: text(lang, 'inspector.adjust') })
    .click();
  const panel = adjustPanel(page, lang);
  await expect(panel).toBeVisible();
  return panel;
}

/** Opens a group (when collapsed) and returns it. */
async function openTool(scope: Locator, name: string): Promise<Locator> {
  const b = toggle(scope, name);
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await expect(b).toHaveAttribute('aria-expanded', 'true');
  return tool(scope, name);
}

async function type(scope: Locator, control: string, value: string): Promise<void> {
  const f = fieldOf(scope, control);
  await f.fill(value);
  await f.press('Enter');
}

const canvas = (page: Page) => page.locator('.tk-frame canvas');
async function previewAt(page: Page, points: readonly Point[]): Promise<number[][]> {
  const png = (await canvas(page).screenshot()).toString('base64');
  const r = await page.evaluate(([p, pts]) => (window as unknown as Harness).appHarness.pixels(p, pts), [
    png,
    points,
  ] as const);
  return r.at;
}
const near = (got: readonly number[], want: readonly number[], tol: number): boolean =>
  got.every((v, i) => Math.abs(v - want[i]!) <= tol);
const greyish = (c: readonly number[], tol = 6): boolean =>
  Math.max(...c.slice(0, 3)) - Math.min(...c.slice(0, 3)) <= tol;

async function expectPreview(page: Page, points: readonly Point[], check: (at: number[][]) => boolean): Promise<void> {
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

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

async function shot(page: Page, feature: string, name: string, browserName: string): Promise<void> {
  if (browserName !== 'chromium') return;
  for (const close of await page.locator('.tk-notice__close').all()) await close.click();
  await page.screenshot({ path: `${shotsOf(feature)}${name}.png` });
}

/** The x of a range input's thumb centre for its value (knob `knob` px wide). */
const thumbX = (s: Locator, knob: number) =>
  s.evaluate((el: HTMLInputElement, k) => {
    const r = el.getBoundingClientRect();
    return r.left + k / 2 + ((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * (r.width - k);
  }, knob);

test.describe('F-024…F-027 colour tools in the Adjust panel (app harness)', () => {
  test('CMP-Inspector "clip Adjust · colour tools" four groups after Effects start collapsed; opening one is not an undo step and is kept for the session; a changed group shows Changed in its name and a Reset named for the tool', async ({
    page,
  }) => {
    const panel = await setUp(page, [[MID], [MID]]);
    const toggles = panel.locator('.tk-ctool__toggle');
    await expect(toggles).toHaveText([
      text('en-US', 'colour_tools.group_mixer'),
      text('en-US', 'colour_tools.group_pop'),
      text('en-US', 'colour_tools.group_split'),
      text('en-US', 'colour_tools.group_duotone'),
    ]);
    // After the Effects group (Light, Colour and Effects stay at the top).
    const order = await panel.evaluate((el) => {
      const effects = Array.from(el.querySelectorAll('.tk-adjust__group-title')).pop()!;
      const first = el.querySelector('.tk-ctool')!;
      return effects.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    expect(order).toBeTruthy();
    for (const b of await toggles.all()) await expect(b).toHaveAttribute('aria-expanded', 'false');
    const before = await stateOf(page);
    const steps = await stepsOf(page);
    const mixer = panel.getByRole('button', { name: text('en-US', 'colour_tools.group_mixer'), exact: true });
    await mixer.click();
    await expect(mixer).toHaveAttribute('aria-expanded', 'true');
    await expect(tool(panel, 'mixer').getByRole('radiogroup', { name: text('en-US', 'mixer.range') })).toBeVisible();
    expect(await stepsOf(page)).toBe(steps);
    expect(await stateOf(page)).toBe(before);
    // Kept while another clip is selected and back.
    await clipButton(page, 'p2.png').click();
    await expect(toggle(adjustPanel(page), 'mixer')).toHaveAttribute('aria-expanded', 'true');
    await clipButton(page, 'p1.png').click();
    // Changed: the state in the disclosure's name, and the group Reset after it.
    await type(adjustPanel(page), 'mixer-red-hue', '20');
    const changed = adjustPanel(page).getByRole('button', {
      name: `${text('en-US', 'colour_tools.group_mixer')} ${text('en-US', 'colour_tools.changed')}`,
      exact: true,
    });
    await expect(changed).toHaveAttribute('aria-expanded', 'true');
    const reset = adjustPanel(page).getByRole('button', {
      name: text('en-US', 'colour_tools.reset_tool', { tool: text('en-US', 'colour_tools.group_mixer') }),
    });
    await expect(reset).toHaveText(text('en-US', 'action.reset'));
    await reset.click();
    await expect(reset).toHaveCount(0);
    await expect(toggle(adjustPanel(page), 'mixer')).toBeFocused();
    expect(await toolsOf(page)).toBeNull();
  });

  test('F-024.AC1 F-024.R1 with the Red range shown, dragging Red Saturation to −100 while paused updates the preview during the drag and ends grey', async ({
    page,
  }) => {
    const panel = await setUp(page, [[RED]]);
    const mixer = await openTool(panel, 'mixer');
    await expect(mixer.getByRole('radio', { name: text('en-US', 'range.red') })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const s = mixer.getByRole('slider', {
      name: text('en-US', 'mixer.slider_name', {
        range: text('en-US', 'range.red'),
        control: text('en-US', 'mixer.saturation'),
      }),
    });
    const centre: Point[] = [[0.5, 0.5]];
    const [start] = await previewAt(page, centre);
    expect(near(start!, RED, 8), `start ${start}`).toBe(true);
    const steps = await stepsOf(page);
    await s.scrollIntoViewIfNeeded();
    const box = (await s.boundingBox())!;
    const y = box.y + box.height / 2;
    const x0 = await thumbX(s, 14);
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x0 - box.width * 0.25, y, { steps: 4 });
    expect(Number(await s.inputValue())).toBeLessThan(-20);
    // During the drag: less saturated already.
    await expectPreview(page, centre, ([c]) => c![0]! - c![2]! < start![0]! - start![2]! - 20);
    await page.mouse.move(box.x - 20, y, { steps: 4 });
    await page.mouse.up();
    await expect(s).toHaveValue('-100');
    await expect(s).toHaveAttribute('aria-valuetext', '−100');
    expect(await toolsOf(page)).toEqual({ mixer: { red: { saturation: -100 } } });
    expect(await stepsOf(page)).toBe(steps + 1);
    await expectPreview(page, centre, ([c]) => greyish(c!, 4));
  });

  test('F-024.AC9 F-024.R5 NFR-06 Right on the range choice shows the next range with no undo step; arrows and a typed 25 set its Hue; the range is named as changed', async ({
    page,
  }) => {
    const panel = await setUp(page);
    const mixer = await openTool(panel, 'mixer');
    const red = mixer.getByRole('radio', { name: text('en-US', 'range.red') });
    await red.focus();
    const steps = await stepsOf(page);
    const before = await stateOf(page);
    await page.keyboard.press('ArrowRight');
    const orange = mixer.getByRole('radio', { name: text('en-US', 'range.orange') });
    await expect(orange).toBeFocused();
    await expect(orange).toHaveAttribute('aria-checked', 'true');
    expect(await stepsOf(page)).toBe(steps);
    expect(await stateOf(page)).toBe(before);
    const hueName = text('en-US', 'mixer.slider_name', {
      range: text('en-US', 'range.orange'),
      control: text('en-US', 'mixer.hue'),
    });
    const hue = mixer.getByRole('slider', { name: hueName });
    await hue.focus();
    await page.keyboard.press('ArrowRight');
    expect(await toolsOf(page)).toEqual({ mixer: { orange: { hue: 1 } } });
    expect(await stepsOf(page)).toBe(steps + 1);
    await page.keyboard.press('ArrowLeft');
    expect(await toolsOf(page)).toBeNull();
    const field = mixer.getByRole('spinbutton', { name: hueName });
    await field.fill('25');
    await field.press('Enter');
    expect(await toolsOf(page)).toEqual({ mixer: { orange: { hue: 25 } } });
    await expect(hue).toHaveValue('25');
    await expect(
      mixer.getByRole('radio', {
        name: text('en-US', 'mixer.range_changed', { range: text('en-US', 'range.orange') }),
      }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(mixer.getByRole('radio', { name: text('en-US', 'range.red'), exact: true })).toBeVisible();
  });

  test('F-024.AC7 F-024.R4 Reset on Red Hue returns only it; the mixer Reset returns all; Reset all returns Brightness and Green Saturation and keeps the look', async ({
    page,
  }) => {
    const panel = await setUp(page);
    const mixer = await openTool(panel, 'mixer');
    await type(mixer, 'mixer-red-hue', '20');
    await mixer.getByRole('radio', { name: text('en-US', 'range.blue') }).click();
    await type(mixer, 'mixer-blue-lightness', '-30');
    await mixer.getByRole('radio', { name: /^Red/ }).click();
    await rowOf(mixer, 'mixer-red-hue')
      .getByRole('button', { name: text('en-US', 'action.reset') })
      .click();
    expect(await toolsOf(page)).toEqual({ mixer: { blue: { lightness: -30 } } });
    await expect(sliderOf(mixer, 'mixer-red-hue')).toBeFocused();
    await panel.locator('[data-action="reset-mixer"]').click();
    expect(await toolsOf(page)).toBeNull();
    // Reset all: Brightness and Green Saturation back to 0, the look kept.
    await page.evaluate(() => (window as unknown as Harness).appHarness.setClip(0, { look: 'film-retro' }));
    await type(panel, 'adjust-brightness', '30');
    await mixer.getByRole('radio', { name: text('en-US', 'range.green') }).click();
    await type(mixer, 'mixer-green-saturation', '40');
    expect((await clipsOf(page))[0]).toMatchObject({
      adjustments: { brightness: 30 },
      colourTools: { mixer: { green: { saturation: 40 } } },
    });
    await panel.locator('[data-action="reset-all"]').click();
    expect((await clipsOf(page))[0]).toMatchObject({ adjustments: {}, colourTools: null, look: 'film-retro' });
  });

  test('F-024.AC8 F-025.AC8 F-026.AC7 F-027.AC8 RULE-24 Apply to all, Copy and Paste colour carry the colour tools (one undo restores the others); holding compare shows clip 1 without them and adds no step', async ({
    page,
  }) => {
    const panel = await setUp(page, [[RED, BLUE], [MID], [MID]]);
    const mixer = await openTool(panel, 'mixer');
    await type(mixer, 'mixer-red-hue', '20');
    const pop = await openTool(panel, 'pop');
    await pop.getByRole('radio', { name: text('en-US', 'range.red') }).click();
    const split = await openTool(panel, 'split');
    await type(split, 'split-shadowsStrength', '50');
    const duo = await openTool(panel, 'duotone');
    await duo.getByRole('radio', { name: text('en-US', 'duotone.pair_plum_gold') }).click();
    const tools = await toolsOf(page);
    expect(tools).toMatchObject({
      mixer: { red: { hue: 20 } },
      pop: { colour: 'red' },
      splitToning: { shadowsStrength: 50 },
      duotone: { on: true, pair: 'plum-gold' },
    });
    const steps = await stepsOf(page);
    await panel.locator('[data-action="apply-all"]').click();
    for (const c of await clipsOf(page)) expect(c.colourTools).toEqual(tools);
    expect(await stepsOf(page)).toBe(steps + 1);
    await undoButton(page).click();
    expect((await clipsOf(page)).map((c) => c.colourTools)).toEqual([tools, null, null]);
    // Copy colour, then Paste colour on clip 3.
    await clipButton(page, 'p1.png').click();
    await adjustPanel(page).locator('[data-action="copy-colour"]').click();
    await clipButton(page, 'p3.png').click();
    await adjustPanel(page).locator('[data-action="paste-colour"]').click();
    expect((await clipsOf(page))[2]!.colourTools).toEqual(tools);
    // Compare: clip 1 without its colour tools (the red stripe as it is), no step.
    await clipButton(page, 'p1.png').click();
    const left: Point[] = [[0.25, 0.5]];
    await expectPreview(page, left, ([c]) => !near(c!, RED, 12));
    const before = await stateOf(page);
    const n = await stepsOf(page);
    await adjustPanel(page).locator('[data-action="compare"]').hover();
    await page.mouse.down();
    await expectPreview(page, left, ([c]) => near(c!, RED, 8));
    await page.mouse.up();
    await expectPreview(page, left, ([c]) => !near(c!, RED, 12));
    expect(await stepsOf(page)).toBe(n);
    expect(await stateOf(page)).toBe(before);
  });

  test('F-025.AC1 F-025.R1 choosing Red in colour pop keeps the red stripe and greys the blue one, as one undo step; Range shows 50 and Amount 100, unavailable while None', async ({
    page,
  }) => {
    const panel = await setUp(page, [[RED, BLUE]]);
    const pop = await openTool(panel, 'pop');
    const group = pop.getByRole('radiogroup', { name: text('en-US', 'pop.colour') });
    await expect(group).toHaveAccessibleDescription(text('en-US', 'pop.help'));
    await expect(group.getByRole('radio', { name: text('en-US', 'pop.none') })).toHaveAttribute('aria-checked', 'true');
    await expect(sliderOf(pop, 'pop-range')).toBeDisabled();
    await expect(fieldOf(pop, 'pop-amount')).toBeDisabled();
    const steps = await stepsOf(page);
    await group.getByRole('radio', { name: text('en-US', 'range.red') }).click();
    expect(await toolsOf(page)).toEqual({ pop: { colour: 'red' } });
    expect(await stepsOf(page)).toBe(steps + 1);
    await expect(fieldOf(pop, 'pop-range')).toHaveValue('50');
    await expect(fieldOf(pop, 'pop-amount')).toHaveValue('100');
    await expect(sliderOf(pop, 'pop-range')).toBeEnabled();
    const pts: Point[] = [
      [0.25, 0.5],
      [0.75, 0.5],
    ];
    await expectPreview(page, pts, ([r, b]) => near(r!, RED, 10) && greyish(b!));
  });

  test('F-025.AC9 F-025.R5 NFR-06 the arrow keys move the kept colour between None and the eight ranges; typing 40 sets Amount', async ({
    page,
  }) => {
    const panel = await setUp(page);
    const pop = await openTool(panel, 'pop');
    const none = pop.getByRole('radio', { name: text('en-US', 'pop.none') });
    await none.focus();
    await page.keyboard.press('ArrowRight');
    expect((await toolsOf(page))?.pop?.colour).toBe('red');
    await page.keyboard.press('ArrowRight');
    expect((await toolsOf(page))?.pop?.colour).toBe('orange');
    await expect(pop.getByRole('radio', { name: text('en-US', 'range.orange') })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await toolsOf(page)).toBeNull();
    await expect(none).toBeFocused();
    // Wraps from None to Magenta.
    await page.keyboard.press('ArrowLeft');
    expect((await toolsOf(page))?.pop?.colour).toBe('magenta');
    await type(pop, 'pop-amount', '40');
    expect(await toolsOf(page)).toEqual({ pop: { colour: 'magenta', amount: 40 } });
    await expect(sliderOf(pop, 'pop-amount')).toHaveValue('40');
  });

  test('F-025.AC7 F-025.R4 Reset on Range returns 50 and keeps Blue; the colour pop Reset returns None; Reset all returns None', async ({
    page,
  }) => {
    const panel = await setUp(page);
    const pop = await openTool(panel, 'pop');
    await pop.getByRole('radio', { name: text('en-US', 'range.blue') }).click();
    await type(pop, 'pop-range', '70');
    await rowOf(pop, 'pop-range')
      .getByRole('button', { name: text('en-US', 'action.reset') })
      .click();
    expect(await toolsOf(page)).toEqual({ pop: { colour: 'blue' } });
    await panel.locator('[data-action="reset-pop"]').click();
    expect(await toolsOf(page)).toBeNull();
    await expect(pop.getByRole('radio', { name: text('en-US', 'pop.none') })).toHaveAttribute('aria-checked', 'true');
    await pop.getByRole('radio', { name: text('en-US', 'range.blue') }).click();
    await panel.locator('[data-action="reset-all"]').click();
    expect(await toolsOf(page)).toBeNull();
  });

  test('F-026.AC1 F-026.R1 raising Shadows strength to 60 tints the dark picture with the Shadows hue during the drag', async ({
    page,
    browserName,
  }) => {
    const panel = await setUp(page, [[DARK]]);
    const split = await openTool(panel, 'split');
    const s = split.getByRole('slider', { name: text('en-US', 'split.shadows_strength') });
    const centre: Point[] = [[0.5, 0.5]];
    const [start] = await previewAt(page, centre);
    expect(greyish(start!, 4)).toBe(true);
    await s.scrollIntoViewIfNeeded();
    const box = (await s.boundingBox())!;
    const y = box.y + box.height / 2;
    const x0 = await thumbX(s, 14);
    const perUnit = (box.width - 14) / 100;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x0 + 40 * perUnit, y, { steps: 4 });
    // 210° (blue): the dark picture turns bluish while the pointer is held.
    await expectPreview(page, centre, ([c]) => c![2]! > c![0]! + 3);
    let x = x0 + 60 * perUnit;
    await page.mouse.move(x, y, { steps: 3 });
    for (let i = 0; i < 40 && (await s.inputValue()) !== '60'; i++) {
      x += Number(await s.inputValue()) < 60 ? 0.25 : -0.25;
      await page.mouse.move(x, y);
    }
    await page.mouse.up();
    const v = Number(await s.inputValue());
    if (browserName === 'chromium') expect(v).toBe(60);
    else expect(Math.abs(v - 60)).toBeLessThanOrEqual(1);
    expect(await toolsOf(page)).toEqual({ splitToning: { shadowsStrength: v } });
  });

  test('F-026.AC8 F-026.R5 NFR-06 Up on Highlights hue raises it by 1° and reads "36°, Orange"; the default Shadows hue reads "210°, Blue"; at 359° Up changes nothing', async ({
    page,
  }) => {
    const panel = await setUp(page);
    const split = await openTool(panel, 'split');
    const shadows = split.getByRole('slider', { name: text('en-US', 'split.shadows_hue') });
    await expect(shadows).toHaveAttribute(
      'aria-valuetext',
      text('en-US', 'colour_tools.hue_value', { degrees: 210, range: text('en-US', 'range.blue') }),
    );
    const hue = split.getByRole('slider', { name: text('en-US', 'split.highlights_hue') });
    await hue.focus();
    await page.keyboard.press('ArrowUp');
    expect(await toolsOf(page)).toEqual({ splitToning: { highlightsHue: 36 } });
    await expect(hue).toHaveAttribute(
      'aria-valuetext',
      text('en-US', 'colour_tools.hue_value', { degrees: 36, range: text('en-US', 'range.orange') }),
    );
    await type(split, 'split-highlightsHue', '359');
    const steps = await stepsOf(page);
    await hue.focus();
    await page.keyboard.press('ArrowUp');
    await expect(hue).toHaveValue('359');
    expect(await stepsOf(page)).toBe(steps);
  });

  test('F-026.AC6 F-026.R4 Reset on Balance returns only it; the split toning Reset returns strengths 0, hues 210° and 35°, Balance 0; Reset all does the same', async ({
    page,
  }) => {
    const panel = await setUp(page);
    const split = await openTool(panel, 'split');
    await type(split, 'split-shadowsStrength', '50');
    await type(split, 'split-balance', '30');
    await expect(sliderOf(split, 'split-balance')).toHaveAttribute(
      'aria-valuetext',
      text('en-US', 'split.balance_highlights', { value: 30 }),
    );
    await rowOf(split, 'split-balance')
      .getByRole('button', { name: text('en-US', 'action.reset') })
      .click();
    expect(await toolsOf(page)).toEqual({ splitToning: { shadowsStrength: 50 } });
    await expect(sliderOf(split, 'split-balance')).toHaveAttribute(
      'aria-valuetext',
      text('en-US', 'split.balance_even'),
    );
    await type(split, 'split-highlightsHue', '100');
    await panel.locator('[data-action="reset-split"]').click();
    expect(await toolsOf(page)).toBeNull();
    await expect(fieldOf(split, 'split-shadowsHue')).toHaveValue('210');
    await expect(fieldOf(split, 'split-highlightsHue')).toHaveValue('35');
    await type(split, 'split-shadowsStrength', '50');
    await type(split, 'split-balance', '-30');
    await expect(sliderOf(split, 'split-balance')).toHaveAttribute(
      'aria-valuetext',
      text('en-US', 'split.balance_shadows', { value: 30 }),
    );
    await panel.locator('[data-action="reset-all"]').click();
    expect(await toolsOf(page)).toBeNull();
  });

  test('F-027.AC1 F-027.R1 choosing Midnight & Peach shows the clip in its colours at Strength 100 as one undo step; at Strength 40, choosing Plum & Gold starts Strength at 100', async ({
    page,
  }) => {
    const panel = await setUp(page, [[DARK, WHITE]]);
    const duo = await openTool(panel, 'duotone');
    const pairs = duo.getByRole('radiogroup', { name: text('en-US', 'duotone.pairs') });
    await expect(pairs.getByRole('radio')).toHaveCount(8);
    await expect(sliderOf(duo, 'duotone-strength')).toBeDisabled();
    const steps = await stepsOf(page);
    await pairs.getByRole('radio', { name: text('en-US', 'duotone.pair_midnight_peach') }).click();
    expect(await stepsOf(page)).toBe(steps + 1);
    expect(await toolsOf(page)).toMatchObject({ duotone: { on: true, pair: 'midnight-peach', strength: 100 } });
    await expect(fieldOf(duo, 'duotone-strength')).toHaveValue('100');
    const pts: Point[] = [
      [0.25, 0.5],
      [0.75, 0.5],
    ];
    // Dark toward #1B2A4A (blue over red), white toward #F6C9A0 (red over blue).
    await expectPreview(page, pts, ([d, w]) => d![2]! > d![0]! + 10 && w![0]! > w![2]! + 40);
    await type(duo, 'duotone-strength', '40');
    await pairs.getByRole('radio', { name: text('en-US', 'duotone.pair_plum_gold') }).click();
    expect(await toolsOf(page)).toMatchObject({ duotone: { pair: 'plum-gold', strength: 100 } });
    await expect(fieldOf(duo, 'duotone-strength')).toHaveValue('100');
  });

  test('F-027.AC4 F-027.R3 CMP-ColourPicker in Custom: typing #FFD400 as the highlights colour shows it in the light tones; Swap exchanges the colours as one step; focus, Esc, invalid hex and a preset', async ({
    page,
  }) => {
    const panel = await setUp(page, [[DARK, WHITE]]);
    const duo = await openTool(panel, 'duotone');
    await duo.getByRole('radio', { name: text('en-US', 'duotone.custom') }).click();
    // F-027.AC5 (UI): a clip that never had a duotone starts Custom from Midnight & Peach.
    const hiName = text('en-US', 'picker.current', { name: text('en-US', 'duotone.highlights'), hex: '#F6C9A0' });
    const hi = duo.getByRole('button', { name: hiName });
    await expect(duo.getByRole('button', { name: /#1B2A4A$/ })).toBeVisible();
    await hi.click();
    const dialog = page.getByRole('dialog', { name: text('en-US', 'picker.title') });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('slider', { name: text('en-US', 'picker.hue') })).toBeFocused();
    const hex = dialog.getByRole('textbox', { name: text('en-US', 'picker.hex') });
    await expect(hex).toHaveValue('#F6C9A0');
    // Invalid: marked, explained, the colour kept.
    await hex.fill('zz');
    await hex.press('Enter');
    await expect(hex).toHaveAttribute('aria-invalid', 'true');
    await expect(hex).toHaveAccessibleDescription(text('en-US', 'picker.hex_invalid'));
    expect((await toolsOf(page))?.duotone?.highlights).toBe('#F6C9A0');
    const steps = await stepsOf(page);
    await hex.fill('ffd400');
    await hex.press('Enter');
    expect((await toolsOf(page))?.duotone?.highlights).toBe('#FFD400');
    expect(await stepsOf(page)).toBe(steps + 1);
    await expect(hex).toHaveValue('#FFD400');
    await expectPreview(page, [[0.75, 0.5]], ([w]) => near(w!, [255, 212, 0], 10));
    // The picker's keys: a hue step is one step.
    await dialog.getByRole('slider', { name: text('en-US', 'picker.hue') }).focus();
    await page.keyboard.press('ArrowRight');
    expect(await stepsOf(page)).toBe(steps + 2);
    expect((await toolsOf(page))?.duotone?.highlights).not.toBe('#FFD400');
    // A preset tap: one step.
    await dialog.getByRole('radio', { name: text('en-US', 'colour.yellow') }).click();
    expect((await toolsOf(page))?.duotone?.highlights).toBe('#FFD60A');
    await hex.fill('#FD0');
    await hex.press('Enter');
    expect((await toolsOf(page))?.duotone?.highlights).toBe('#FFDD00');
    // Esc closes it and returns focus to its colour button; nothing changes.
    const n = await stepsOf(page);
    await dialog.getByRole('slider', { name: text('en-US', 'picker.lightness') }).focus();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(duo.locator('[data-action="colour-highlights"]')).toBeFocused();
    expect(await stepsOf(page)).toBe(n);
    // Swap: one step.
    await duo.getByRole('button', { name: text('en-US', 'duotone.swap') }).click();
    expect(await toolsOf(page)).toMatchObject({ duotone: { shadows: '#FFDD00', highlights: '#1B2A4A' } });
    expect(await stepsOf(page)).toBe(n + 1);
  });

  test('F-027.AC8 F-027.R5 Reset on Strength returns 100; the duotone Reset returns None and Custom then starts from Midnight & Peach', async ({
    page,
  }) => {
    const panel = await setUp(page);
    const duo = await openTool(panel, 'duotone');
    await duo.getByRole('radio', { name: text('en-US', 'duotone.pair_teal_cream') }).click();
    await type(duo, 'duotone-strength', '40');
    await rowOf(duo, 'duotone-strength')
      .getByRole('button', { name: text('en-US', 'action.reset') })
      .click();
    expect(await toolsOf(page)).toMatchObject({ duotone: { pair: 'teal-cream', strength: 100 } });
    await panel.locator('[data-action="reset-duotone"]').click();
    expect(await toolsOf(page)).toBeNull();
    await expect(duo.getByRole('radio', { name: text('en-US', 'duotone.none') })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await duo.getByRole('radio', { name: text('en-US', 'duotone.custom') }).click();
    expect(await toolsOf(page)).toMatchObject({ duotone: { shadows: '#1B2A4A', highlights: '#F6C9A0' } });
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-024 F-025 F-026 F-027 NFR-06 NFR-07 axe passes with every colour-tool group open and the colour picker open at 1280 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      const panel = await setUp(page, [[RED, BLUE, DARK, WHITE], [MID]], lang);
      const mixer = await openTool(panel, 'mixer');
      await type(mixer, 'mixer-red-hue', '20');
      await type(mixer, 'mixer-red-saturation', '-35');
      await mixer.locator('[data-value="blue"]').click();
      await type(mixer, 'mixer-blue-lightness', '-30');
      await mixer.locator('[data-value="red"]').click();
      const pop = await openTool(panel, 'pop');
      await pop.locator('[data-value="red"]').click();
      await type(pop, 'pop-amount', '80');
      const split = await openTool(panel, 'split');
      await type(split, 'split-shadowsStrength', '40');
      await type(split, 'split-highlightsStrength', '30');
      await type(split, 'split-balance', '-20');
      const duo = await openTool(panel, 'duotone');
      await duo.locator('[data-value="custom"]').click();
      await duo.locator('[data-action="colour-highlights"]').click();
      await expect(page.getByRole('dialog', { name: text(lang, 'picker.title') })).toBeVisible();
      await axe(page);
      // The page never scrolls sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
      for (const [feature, name] of [
        ['F-024', 'mixer'],
        ['F-025', 'pop'],
        ['F-026', 'split'],
        ['F-027', 'duotone'],
      ] as const) {
        await tool(panel, name).scrollIntoViewIfNeeded();
        await toggle(panel, name).evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await shot(page, feature, `inspector-${name}-wide-${lang}`, browserName);
      }
      await page.getByRole('dialog').scrollIntoViewIfNeeded();
      await shot(page, 'F-027', `inspector-duotone-picker-wide-${lang}`, browserName);
    });

    test(`F-024 F-025 F-026 F-027 RULE-21 NFR-06 NFR-07 the phone Adjust sheet: colour-tool groups at touch size, two rows of four ranges, the picker in place of the body, no sideways scroll, axe at 320 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, lang);
      await add(page, [[RED, BLUE, DARK, WHITE]], lang);
      await clipButton(page, 'p1.png', lang).click();
      const tab = page.getByRole('tab', { name: text(lang, 'inspector.adjust') });
      await tab.click();
      const sheet = page.getByRole('tabpanel', { name: text(lang, 'inspector.adjust') });
      await expect(sheet).toBeVisible();
      const noSideways = async (): Promise<void> => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
        const body = sheet.locator('.tk-sheet__body');
        const [sw, cw] = await body.evaluate((el) => [el.scrollWidth, el.clientWidth]);
        expect(sw).toBeLessThanOrEqual(cw!);
      };
      for (const name of ['mixer', 'pop', 'split', 'duotone']) {
        const b = toggle(sheet, name);
        await b.scrollIntoViewIfNeeded();
        expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      const mixer = await openTool(sheet, 'mixer');
      const radios = mixer.getByRole('radio');
      const tops = new Set<number>();
      for (const r of await radios.all()) {
        const b = (await r.boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.width).toBeGreaterThanOrEqual(44);
        tops.add(Math.round(b.y));
      }
      expect(tops.size).toBe(2);
      await type(mixer, 'mixer-red-hue', '20');
      const hue = sliderOf(mixer, 'mixer-red-hue');
      expect((await hue.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await toggle(sheet, 'mixer').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await noSideways();
      await shot(page, 'F-024', `sheet-mixer-narrow-${lang}`, browserName);
      await axe(page);
      const pop = await openTool(sheet, 'pop');
      await pop.locator('[data-value="red"]').click();
      await toggle(sheet, 'pop').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await noSideways();
      await shot(page, 'F-025', `sheet-pop-narrow-${lang}`, browserName);
      const split = await openTool(sheet, 'split');
      await type(split, 'split-shadowsStrength', '40');
      await toggle(sheet, 'split').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await noSideways();
      await shot(page, 'F-026', `sheet-split-narrow-${lang}`, browserName);
      const duo = await openTool(sheet, 'duotone');
      await duo.locator('[data-value="custom"]').click();
      await toggle(sheet, 'duotone').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await noSideways();
      await shot(page, 'F-027', `sheet-duotone-narrow-${lang}`, browserName);
      await axe(page);
      // The picker opens in place of the sheet's body, Done at the top; touch-size rows; Done returns.
      const button = duo.locator('[data-action="colour-shadows"]');
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await button.click();
      const dialog = sheet.getByRole('dialog', { name: text(lang, 'picker.title') });
      await expect(dialog).toBeVisible();
      await expect(sheet.locator('[data-section="colour-tools"]')).toHaveCount(0);
      await expect(dialog.getByRole('slider', { name: text(lang, 'picker.hue') })).toBeFocused();
      for (const r of await dialog.getByRole('radio').all())
        expect((await r.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      const hexBox = (await dialog.getByRole('textbox', { name: text(lang, 'picker.hex') }).boundingBox())!;
      expect(hexBox.height).toBeGreaterThanOrEqual(44);
      expect(hexBox.x + hexBox.width).toBeLessThanOrEqual(320);
      await noSideways();
      await shot(page, 'F-027', `sheet-duotone-picker-narrow-${lang}`, browserName);
      await axe(page);
      await dialog.getByRole('button', { name: text(lang, 'picker.done') }).click();
      await expect(dialog).toHaveCount(0);
      await expect(sheet).toBeVisible();
      await expect(duo.locator('[data-action="colour-shadows"]')).toBeFocused();
    });
  }
});
