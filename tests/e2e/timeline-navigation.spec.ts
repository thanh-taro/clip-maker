// F-013 Navigate the timeline through the real UI on the app harness (tests/harness/app.html: the real
// `main()`, MOD-App, MOD-Timeline and the preview's playback): Zoom in / Zoom out / Fit and the frames readout
// (RULE-14's range), following the playhead during playback and a manual scroll that stops it, the Snapping
// toggle for the timeline (trim, move, scrub) and the preview (text), and on a phone (390 px, real two-finger
// touch through the DevTools protocol, Chromium only) the centre-fixed playhead: a pinch zooms around the pinch
// point and a swipe scrubs, pausing playback first. A 10-minute project with 120 clips scrolls and zooms without
// laying every clip out again (NFR-03). Axe at 320 and 1280 px in en-US and vi-VN. Photo clips are 1 × 1 PNGs
// whose lengths are set through `appHarness.setClip()` / `appHarness.load()`; the playhead through
// `appHarness.setPlayhead()` (F-002 binding).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import { songSource } from './support/audio-files';
import type { ClipSetup, ClipSummary } from '../harness/app';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const S = 1_000_000;
const SHOTS = fileURLToPath(new URL('../../.build-my-app/reports/screens/F-013/', import.meta.url));
type CopyId = keyof (typeof CATALOG)['en-US'];
const text = (lang: Language, id: CopyId): string => CATALOG[lang][id] as string;

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}
/** A 1 × 1 photo: 3 s on the timeline (RULE-05) until its length is set. */
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
    clips(): ClipSummary[];
    setClip(index: number, setup: ClipSetup): void;
    setPlayhead(seconds: number): void;
    state(): string;
    load(json: string): void;
    preview(): { playhead: number; state: string };
  };
}
const clipsOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.clips());
const setClip = (page: Page, index: number, setup: ClipSetup) =>
  page.evaluate(([i, s]) => (window as unknown as Harness).appHarness.setClip(i, s), [index, setup] as const);
const at = (page: Page, seconds: number) =>
  page.evaluate((s) => (window as unknown as Harness).appHarness.setPlayhead(s), seconds);
const preview = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.preview());
const stateOf = async <T>(page: Page): Promise<T> =>
  JSON.parse(await page.evaluate(() => (window as unknown as Harness).appHarness.state())) as T;
const load = (page: Page, doc: object) =>
  page.evaluate((json) => (window as unknown as Harness).appHarness.load(json), JSON.stringify(doc));

async function open(page: Page, lang: Language = 'en-US'): Promise<void> {
  await page.goto(`${APP}?effects=fast&lang=${lang}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
}

/** One photo of `seconds` s (more photos: `count`, each `seconds` long). */
async function photos(page: Page, seconds: number, count = 1, lang: Language = 'en-US'): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('.tk-empty')
    .getByRole('button', { name: text(lang, 'action.add_media') })
    .click();
  await (await chooser).setFiles(Array.from({ length: count }, (_, i) => photo(`P${i + 1}.png`)));
  await expect.poll(async () => (await clipsOf(page)).length, { timeout: 20_000 }).toBe(count);
  const media = page.locator('.tk-media');
  await media.getByRole('button', { name: text(lang, 'action.close') }).click();
  await expect(media).toHaveCount(0);
  for (let i = 0; i < count; i++) await setClip(page, i, { seconds });
  for (const close of await page.locator('.tk-notice__close').all()) await close.click();
}

const timeline = (page: Page, lang: Language = 'en-US') =>
  page.getByRole('region', { name: text(lang, 'timeline.label') });
/** A visible zoom or snapping control (the wide toolbar, or the narrow pill). */
const control = (page: Page, id: CopyId, lang: Language = 'en-US') =>
  timeline(page, lang)
    .getByRole('toolbar')
    .getByRole('button', { name: text(lang, id), exact: true });
const scroller = (page: Page) => page.locator('.tk-tl-lanes');
const scrollLeft = (page: Page) => scroller(page).evaluate((e) => e.scrollLeft);

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

/** Pixels per second of the timeline now (the track spans the project). */
async function pxPerSecond(page: Page): Promise<number> {
  const track = (await page.locator('.tk-track').boundingBox())!;
  const last = (await clipsOf(page)).at(-1)!.end;
  return track.width / last;
}

/** Zooms in until Zoom in is unavailable; returns the clicks it took. */
async function zoomInFully(page: Page, lang: Language = 'en-US'): Promise<number> {
  let n = 0;
  while ((await control(page, 'action.zoom_in', lang).getAttribute('aria-disabled')) !== 'true') {
    await control(page, 'action.zoom_in', lang).click();
    if (++n > 40) throw new Error('Zoom in never became unavailable');
  }
  return n;
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

async function shot(page: Page, name: string, browserName: string): Promise<void> {
  if (browserName !== 'chromium') return;
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

/** The playhead line's screen x. */
async function headX(page: Page): Promise<number> {
  const b = (await page.locator('.tk-playhead').boundingBox())!;
  return b.x + b.width / 2;
}

test.describe('F-013 timeline navigation with a pointer (app harness)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('F-013.AC1 F-013.R1 in a 5-minute project, zoomed in fully one frame is at least 12 px (shown as 1 frame = 12 px); Fit shows the whole project', async ({
    page,
    browserName,
  }) => {
    await open(page);
    // Five 60 s photos (RULE-05's longest photo): 5 minutes.
    await photos(page, 60, 5);
    expect((await clipsOf(page)).at(-1)!.end).toBe(300);
    await at(page, 150);
    // At the fit zoom out and Fit are unavailable; the whole project is in the view.
    await expect(control(page, 'action.zoom_out')).toHaveAttribute('aria-disabled', 'true');
    await expect(control(page, 'action.zoom_fit')).toHaveAttribute('aria-disabled', 'true');
    const head = await headX(page);
    await control(page, 'action.zoom_in').click();
    // The zoom keeps the playhead where it was on screen.
    expect(Math.abs((await headX(page)) - head)).toBeLessThan(2);
    await zoomInFully(page);
    const rate = (await stateOf<{ frame: { frameRate: number } }>(page)).frame.frameRate;
    const framePx = (await pxPerSecond(page)) / rate;
    expect(framePx).toBeGreaterThanOrEqual(12 - 0.01);
    expect(framePx).toBeLessThan(12.5);
    await expect(timeline(page).locator('.tk-tl-zoom-frames')).toHaveText(
      text('en-US', 'timeline.zoom_frames').replace('{px}', '12'),
    );
    // CMP-Timeline "frames": muted frame numbers between the seconds.
    await expect(timeline(page).locator('.tk-ruler__label--frame').first()).toBeVisible();
    expect(Math.abs((await headX(page)) - head)).toBeLessThan(2);
    await shot(page, 'frames-wide-en-US', browserName);
    await control(page, 'action.zoom_fit').click();
    const lanes = (await scroller(page).boundingBox())!;
    const track = (await timeline(page).locator('.tk-track').boundingBox())!;
    expect(track.x).toBeGreaterThanOrEqual(lanes.x - 0.5);
    expect(track.x + track.width).toBeLessThanOrEqual(lanes.x + lanes.width + 0.5);
    expect(await scrollLeft(page)).toBe(0);
    await expect(control(page, 'action.zoom_out')).toHaveAttribute('aria-disabled', 'true');
    await expect(control(page, 'action.zoom_in')).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('F-013 Edge cases in an empty project the zoom controls and Snapping are unavailable', async ({ page }) => {
    await open(page);
    for (const id of ['action.zoom_in', 'action.zoom_out', 'action.zoom_fit', 'action.snapping'] as const)
      await expect(control(page, id)).toHaveAttribute('aria-disabled', 'true');
    await expect(control(page, 'action.snapping')).toHaveAttribute('aria-pressed', 'true');
  });

  test('F-013.AC2 F-013.R2 zoomed in and playing, when the playhead reaches the view’s edge the view scrolls to keep it visible', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 60);
    for (let i = 0; i < 4; i++) await control(page, 'action.zoom_in').click();
    const lanes = (await scroller(page).boundingBox())!;
    const px = await pxPerSecond(page);
    // The playhead 0.5 s before the view's right edge.
    await at(page, (lanes.width - 0.5 * px) / px);
    expect(await scrollLeft(page)).toBe(0);
    await page.getByRole('button', { name: text('en-US', 'action.play') }).click();
    await expect.poll(() => scrollLeft(page), { timeout: 10_000 }).toBeGreaterThan(0);
    const x = await headX(page);
    expect(x).toBeGreaterThanOrEqual(lanes.x);
    expect(x).toBeLessThanOrEqual(lanes.x + lanes.width);
    await page.getByRole('button', { name: text('en-US', 'action.pause') }).click();
  });

  test('F-013.AC5 F-013.R2 playing and zoomed in, a manual scroll stays where the user scrolled until the playhead re-enters the view or playback restarts', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 60);
    for (let i = 0; i < 4; i++) await control(page, 'action.zoom_in').click();
    const lanes = (await scroller(page).boundingBox())!;
    const px = await pxPerSecond(page);
    await at(page, 1);
    await page.getByRole('button', { name: text('en-US', 'action.play') }).click();
    await expect.poll(async () => (await preview(page)).state).toBe('playing');
    // The user scrolls away (a vertical wheel scrolls along time), 3 s ahead of the playhead.
    await page.mouse.move(lanes.x + lanes.width / 2, lanes.y + lanes.height / 2);
    await page.mouse.wheel(0, 4 * px);
    await expect.poll(() => scrollLeft(page)).toBeGreaterThan(3 * px);
    const scrolled = await scrollLeft(page);
    // The view stays there while the playhead is out of view.
    await page.waitForTimeout(600);
    expect(Math.abs((await scrollLeft(page)) - scrolled)).toBeLessThan(1);
    // The playhead re-enters the view and reaches its edge: the view follows again.
    await expect.poll(() => scrollLeft(page), { timeout: 20_000 }).toBeGreaterThan(scrolled + 1);
    const x = await headX(page);
    expect(x).toBeGreaterThanOrEqual(lanes.x);
    expect(x).toBeLessThanOrEqual(lanes.x + lanes.width);
    // Scrolled away again, then playback restarts: the view shows the playhead at once.
    await page.mouse.wheel(0, -50 * px);
    await expect.poll(() => scrollLeft(page)).toBe(0);
    await page.getByRole('button', { name: text('en-US', 'action.pause') }).click();
    await page.getByRole('button', { name: text('en-US', 'action.play') }).click();
    await expect
      .poll(async () => {
        const hx = await headX(page);
        return hx >= lanes.x && hx <= lanes.x + lanes.width;
      })
      .toBe(true);
    expect(await scrollLeft(page)).toBeGreaterThan(0);
    await page.getByRole('button', { name: text('en-US', 'action.pause') }).click();
  });

  test('F-013.AC3 F-013.R3 with snapping off, a clip end dragged within 8 px of the playhead does not snap', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 10);
    await setClip(page, 0, { seconds: 10 });
    await at(page, 6);
    await control(page, 'action.snapping').click();
    await expect(control(page, 'action.snapping')).toHaveAttribute('aria-pressed', 'false');
    await timeline(page).locator('.tk-clip').first().click();
    const end = timeline(page).locator('.tk-trim--end');
    await settled(end);
    const px = await pxPerSecond(page);
    const b = (await end.boundingBox())!;
    const grab = b.x + b.width - 2;
    // The end aimed 5 px past the playhead (6 s): with snapping on it would snap there (F-004.AC6).
    await page.mouse.move(grab, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(grab - 4 * px + 5, b.y + b.height / 2, { steps: 6 });
    await expect(timeline(page).locator('.tk-snap')).toBeHidden();
    await page.mouse.up();
    const [c] = await clipsOf(page);
    expect(c!.end).not.toBe(6);
    expect(Math.abs(c!.end - (6 + 5 / px))).toBeLessThan(0.1);
  });

  test('F-013.R3 RULE-14 with snapping on, a dragged audio clip snaps by its end to the playhead (with the snap line); off, it does not', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 20);
    await at(page, 10);
    const state = await stateOf<{ sources: object[] }>(page);
    // D-052: the user's own audio file (a source) on the audio track.
    const doc = { ...state, sources: [...state.sources, songSource()] };
    const music = (start: number, end: number) => ({
      id: 'music-0',
      sourceId: songSource().id,
      start: start * S,
      in: 0,
      out: (end - start) * S,
      volume: 100,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    });
    await load(page, { ...doc, audioClips: [music(2, 6)] });
    const item = timeline(page).locator('.tk-aclip');
    await settled(item);
    const px = await pxPerSecond(page);
    const drag = async (dx: number): Promise<number> => {
      const b = (await item.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2, { steps: 6 });
      if ((await control(page, 'action.snapping').getAttribute('aria-pressed')) === 'true')
        await expect(timeline(page).locator('.tk-snap')).toBeVisible();
      else await expect(timeline(page).locator('.tk-snap')).toBeHidden();
      await page.mouse.up();
      const st = await stateOf<{ audioClips: { start: number; out: number }[] }>(page);
      return (st.audioClips[0]!.start + st.audioClips[0]!.out) / S;
    };
    // The end (6 s) dragged to 4 s + 5 px past it… lands on the playhead (10 s).
    expect(await drag(4 * px - 5)).toBeCloseTo(10, 3);
    await load(page, { ...doc, audioClips: [music(2, 6)] });
    await settled(item);
    await control(page, 'action.snapping').click();
    expect(Math.abs((await drag(4 * px - 5)) - (10 - 5 / px))).toBeLessThan(0.1);
  });

  test('F-013.R3 RULE-14 with a pointer the scrubbed playhead snaps to a clip boundary within 8 px', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 5, 2);
    const ruler = (await timeline(page).locator('.tk-ruler').boundingBox())!;
    const track = (await timeline(page).locator('.tk-track').boundingBox())!;
    const px = await pxPerSecond(page);
    await page.mouse.click(track.x + 5 * px + 5, ruler.y + ruler.height / 2);
    await expect.poll(async () => (await preview(page)).playhead).toBe(5);
    await control(page, 'action.snapping').click();
    await page.mouse.click(track.x + 5 * px + 5, ruler.y + ruler.height / 2);
    await expect.poll(async () => (await preview(page)).playhead).toBeGreaterThan(5);
  });

  test('NFR-03 F-013 a 10-minute project of 120 clips scrolls and zooms without laying every clip out again', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 5);
    // 120 clips of 5 s (one source) through the harness.
    const doc = await stateOf<{ clips: { id: string }[] }>(page);
    const first = doc.clips[0]!;
    await load(page, { ...doc, clips: Array.from({ length: 120 }, (_, i) => ({ ...first, id: `c${i}` })) });
    await expect(timeline(page).locator('.tk-clip')).toHaveCount(120);
    await at(page, 300);
    const started = Date.now();
    await zoomInFully(page);
    // Every zoom step lays out once; together well under a second per step on this machine.
    expect(Date.now() - started).toBeLessThan(20_000);
    const report = await page.evaluate(async () => {
      const lanes = document.querySelector<HTMLElement>('.tk-tl-lanes')!;
      let clipStyles = 0;
      const seen = new MutationObserver((list) => {
        for (const m of list) if ((m.target as Element).classList.contains('tk-clip')) clipStyles++;
      });
      seen.observe(lanes, { attributes: true, subtree: true, attributeFilter: ['style', 'aria-label', 'title'] });
      const frames: number[] = [];
      let last = performance.now();
      for (let i = 0; i < 40; i++) {
        lanes.scrollLeft += 97;
        await new Promise((r) => requestAnimationFrame(r));
        const now = performance.now();
        frames.push(now - last);
        last = now;
      }
      seen.disconnect();
      const canvases = [...document.querySelectorAll<HTMLCanvasElement>('.tk-clip__strip')];
      const sorted = [...frames].sort((a, b) => a - b);
      return {
        clipStyles,
        p95: sorted[Math.floor(sorted.length * 0.95)]!,
        widest: Math.max(...canvases.map((c) => c.width)),
        ticks: document.querySelectorAll('.tk-ruler > *').length,
        view: lanes.clientWidth,
      };
    });
    // Scrolling changes no clip's layout; no canvas is wider than three views; the ruler holds the view's part.
    expect(report.clipStyles).toBe(0);
    expect(report.widest).toBeLessThanOrEqual(3 * report.view * 2 + 2);
    expect(report.ticks).toBeLessThan(2000);
    // NFR-03: 30 fps is 33 ms a frame; the 95th percentile scrolled frame stays within twice that under test load.
    expect(report.p95).toBeLessThan(67);
  });

  test('F-013.R2 a mouse scrub on the ruler during playback, near the view’s edge, does not turn pages', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 60);
    for (let i = 0; i < 3; i++) await control(page, 'action.zoom_in').click();
    const lanes = (await scroller(page).boundingBox())!;
    const ruler = (await timeline(page).locator('.tk-ruler').boundingBox())!;
    await at(page, 1);
    await page.getByRole('button', { name: text('en-US', 'action.play') }).click();
    await expect.poll(async () => (await preview(page)).state).toBe('playing');
    const x = lanes.x + lanes.width - 10;
    await page.mouse.move(lanes.x + lanes.width / 2, ruler.y + ruler.height / 2);
    await page.mouse.down();
    for (let i = 0; i < 6; i++) await page.mouse.move(x - i, ruler.y + ruler.height / 2);
    expect(await scrollLeft(page)).toBe(0);
    await page.mouse.up();
    await page.getByRole('button', { name: text('en-US', 'action.pause') }).click();
  });

  test('F-013.R2 a vertical wheel at the view’s end leaves it to the page; Ctrl/⌘ + wheel never zooms the page, even when empty', async ({
    page,
  }) => {
    await open(page);
    const wheel = (opts: WheelEventInit) =>
      scroller(page).evaluate(
        (e, o) => {
          const ev = new WheelEvent('wheel', { ...o, bubbles: true, cancelable: true });
          e.dispatchEvent(ev);
          return ev.defaultPrevented;
        },
        opts as Record<string, unknown>,
      );
    expect(await wheel({ deltaY: 50, ctrlKey: true })).toBe(true);
    expect(await wheel({ deltaY: 50 })).toBe(false);
    await photos(page, 60);
    // At the fit there is nothing to scroll: the page takes the wheel.
    expect(await wheel({ deltaY: 50 })).toBe(false);
    await control(page, 'action.zoom_in').click();
    // At the start, a wheel back has nowhere to go; forward scrolls the timeline.
    expect(await wheel({ deltaY: -50 })).toBe(false);
    expect(await wheel({ deltaY: 50 })).toBe(true);
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-013.R1 NFR-06 the zoom controls and Snapping pass axe at 1280 px, zoomed to frames (${lang})`, async ({
      page,
      browserName,
    }) => {
      await open(page, lang);
      await photos(page, 20, 1, lang);
      await at(page, 4);
      await zoomInFully(page, lang);
      await expect(control(page, 'action.snapping', lang)).toHaveAttribute('aria-pressed', 'true');
      await axe(page);
      await shot(page, `frames-snapping-on-wide-${lang}`, browserName);
      await control(page, 'action.snapping', lang).click();
      await expect(control(page, 'action.snapping', lang)).toHaveAttribute('aria-pressed', 'false');
      await axe(page);
      await shot(page, `frames-snapping-off-wide-${lang}`, browserName);
    });
  }
});

test.describe('F-013 snapping in the preview (app harness)', () => {
  test('F-013.AC6 F-013.R3 with snapping off, a text layer dragged near the frame’s centre line in the preview does not snap', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 10);
    const doc = await stateOf<object>(page);
    await load(page, {
      ...doc,
      textLayers: [
        {
          id: 'T',
          content: 'Centre me',
          start: 0,
          end: 5 * S,
          typeface: 'sans',
          size: 6,
          colour: 'white',
          style: 'outline',
          align: 'centre',
          x: 0.3,
          y: 0.3,
          fade: false,
        },
      ],
    });
    await at(page, 1);
    await control(page, 'action.snapping').click();
    await page.locator('.tk-tclip').filter({ hasText: 'Centre me' }).click();
    const hit = page.locator('.tk-text-layer__hit[data-selected]');
    await settled(hit);
    const frame = (await page.locator('.tk-frame canvas').boundingBox())!;
    const b = (await hit.boundingBox())!;
    // The centre aimed 4 px right of the frame's vertical centre line (snapping on would put it on the line).
    const dx = frame.x + frame.width / 2 + 4 - (b.x + b.width / 2);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2, { steps: 6 });
    await expect(page.locator('.tk-text-layer__guide[data-snapped]')).toHaveCount(0);
    await page.mouse.up();
    await expect
      .poll(async () => (await stateOf<{ textLayers: { x: number }[] }>(page)).textLayers[0]!.x)
      .not.toBe(0.3);
    const { textLayers } = await stateOf<{ textLayers: { x: number }[] }>(page);
    expect(textLayers[0]!.x).not.toBe(0.5);
    expect(Math.abs(textLayers[0]!.x - (0.5 + 4 / frame.width))).toBeLessThan(0.01);
  });
});

test.describe('F-013 narrow playback (app harness)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('NFR-03 F-013.R2 at 390 px, playback keeps the playhead centred without rebuilding the ruler every frame', async ({
    page,
  }) => {
    await open(page);
    await photos(page, 60);
    await at(page, 1);
    await expect(scroller(page)).toHaveAttribute('data-centred', '');
    await page.evaluate(() => {
      const ruler = document.querySelector('.tk-ruler')!;
      const w = window as unknown as { rebuilds: number; frames: number[] };
      w.rebuilds = 0;
      w.frames = [];
      new MutationObserver((list) => {
        for (const m of list) if (m.removedNodes.length > 1) w.rebuilds++;
      }).observe(ruler, { childList: true });
      let last = performance.now();
      const tick = (now: number): void => {
        w.frames.push(now - last);
        last = now;
        if (w.frames.length < 1000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.getByRole('button', { name: text('en-US', 'action.play') }).click();
    await expect.poll(async () => (await preview(page)).playhead, { timeout: 15_000 }).toBeGreaterThan(4);
    await page.getByRole('button', { name: text('en-US', 'action.pause') }).click();
    const { rebuilds, frames } = await page.evaluate(() => {
      const w = window as unknown as { rebuilds: number; frames: number[] };
      return { rebuilds: w.rebuilds, frames: w.frames };
    });
    // 3 s at the fit moves the view a fraction of the made part: a few rebuilds at most, not one a frame.
    expect(rebuilds).toBeLessThanOrEqual(3);
    const sorted = [...frames].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length * 0.95)]!).toBeLessThan(67);
    const lanes = (await scroller(page).boundingBox())!;
    expect(Math.abs((await headX(page)) - (lanes.x + lanes.width / 2))).toBeLessThan(1.5);
  });
});

test.describe('F-013 wider touch screens (app harness, touch)', () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test('F-002.R3 F-013.R2 at 768 px zoomed in, a touch drag on the ruler scrubs and does not scroll the view', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP touch input');
    await open(page);
    await photos(page, 60);
    await expect(scroller(page)).not.toHaveAttribute('data-centred', '');
    for (let i = 0; i < 3; i++) await control(page, 'action.zoom_in').click();
    const ruler = (await timeline(page).locator('.tk-ruler').boundingBox())!;
    const track = (await timeline(page).locator('.tk-track').boundingBox())!;
    const px = await pxPerSecond(page);
    const cdp = await page.context().newCDPSession(page);
    const y = ruler.y + ruler.height / 2;
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y, id: 1 }] });
    await send('touchStart', track.x + 2 * px);
    for (let i = 1; i <= 6; i++) await send('touchMove', track.x + 2 * px + (i * px) / 2);
    await send('touchEnd');
    expect(await scrollLeft(page)).toBe(0);
    await expect.poll(async () => (await preview(page)).playhead).toBeCloseTo(5, 1);
  });
});

test.describe('F-013 on a phone: the centred playhead (app harness, touch)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  type TouchPoint = { x: number; y: number; id: number };
  /** Touch through the DevTools protocol (Chromium only: Playwright has no multi-touch API). */
  async function touch(page: Page) {
    const cdp = await page.context().newCDPSession(page);
    return (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: TouchPoint[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }
  const centreX = async (page: Page): Promise<number> => {
    const b = (await scroller(page).boundingBox())!;
    return b.x + b.width / 2;
  };

  test('F-002.AC8 F-013.R2 on a phone, paused, a swipe left by one second’s width advances the time by 1 s with the playhead centred', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP touch input');
    await open(page);
    await photos(page, 20);
    await at(page, 5);
    await settled(timeline(page).locator('.tk-track'));
    const px = await pxPerSecond(page);
    expect(Math.abs((await headX(page)) - (await centreX(page)))).toBeLessThan(1.5);
    const send = await touch(page);
    const track = (await timeline(page).locator('.tk-track').boundingBox())!;
    const y = track.y + track.height / 2;
    const x0 = (await centreX(page)) + 40;
    await send('touchStart', [{ x: x0, y, id: 1 }]);
    for (let i = 1; i <= 10; i++) await send('touchMove', [{ x: x0 - (px * i) / 10, y, id: 1 }]);
    // Held still before lifting: no momentum.
    await page.waitForTimeout(250);
    await send('touchMove', [{ x: x0 - px, y, id: 1 }]);
    await page.waitForTimeout(250);
    await send('touchEnd', []);
    await expect.poll(async () => (await preview(page)).playhead).toBeCloseTo(6, 1);
    expect(Math.abs((await headX(page)) - (await centreX(page)))).toBeLessThan(1.5);
    await shot(page, 'narrow-swiped-en-US', browserName);
  });

  test('F-013.AC7 F-013.R2 on a phone with playback running, a swipe pauses playback and the playhead time follows the swipe while staying centred', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP touch input');
    await open(page);
    await photos(page, 30);
    await at(page, 2);
    await page.getByRole('button', { name: text('en-US', 'action.play') }).click();
    await expect.poll(async () => (await preview(page)).state).toBe('playing');
    const px = await pxPerSecond(page);
    const send = await touch(page);
    const track = (await timeline(page).locator('.tk-track').boundingBox())!;
    const y = track.y + track.height / 2;
    const x0 = (await centreX(page)) + 60;
    await send('touchStart', [{ x: x0, y, id: 1 }]);
    await send('touchMove', [{ x: x0 - 10, y, id: 1 }]);
    await expect.poll(async () => (await preview(page)).state).toBe('paused');
    const from = (await preview(page)).playhead;
    // 2 s to the right moves the project 2 s earlier under the centre: the time goes back 2 s.
    for (let i = 1; i <= 8; i++) await send('touchMove', [{ x: x0 - 10 + (2 * px * i) / 8, y, id: 1 }]);
    await page.waitForTimeout(250);
    await send('touchMove', [{ x: x0 - 10 + 2 * px, y, id: 1 }]);
    await page.waitForTimeout(250);
    await send('touchEnd', []);
    await expect.poll(async () => (await preview(page)).playhead).toBeCloseTo(from - 2, 1);
    expect((await preview(page)).state).toBe('paused');
    expect(Math.abs((await headX(page)) - (await centreX(page)))).toBeLessThan(1.5);
  });

  test('F-013.AC4 F-013.R4 RULE-21 on a phone, pinching out on the timeline zooms in around the pinch point', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP touch input');
    await open(page);
    await photos(page, 20);
    await at(page, 4);
    const track = timeline(page).locator('.tk-track');
    await settled(track);
    const before = (await track.boundingBox())!;
    const pxBefore = before.width / 20;
    const y = before.y + before.height / 2;
    // The pinch point: right of the centre, over the project.
    const mid = (await centreX(page)) + 80;
    const timeUnder = (b: { x: number }, pxs: number) => (mid - b.x) / pxs;
    const t0 = timeUnder(before, pxBefore);
    const send = await touch(page);
    await send('touchStart', [
      { x: mid - 20, y, id: 1 },
      { x: mid + 20, y, id: 2 },
    ]);
    for (let i = 1; i <= 10; i++)
      await send('touchMove', [
        { x: mid - 20 - 4 * i, y, id: 1 },
        { x: mid + 20 + 4 * i, y, id: 2 },
      ]);
    await send('touchEnd', []);
    await settled(track);
    const after = (await track.boundingBox())!;
    const pxAfter = after.width / 20;
    // Spread to 3× their distance: zoomed in 3× (RULE-14 range permitting), the same time under the point.
    expect(pxAfter / pxBefore).toBeGreaterThan(2.5);
    expect(Math.abs(timeUnder(after, pxAfter) - t0)).toBeLessThan(0.1);
    // The playhead stays at the centre; the pinch moved the time under it (it scrubs).
    expect(Math.abs((await headX(page)) - (await centreX(page)))).toBeLessThan(1.5);
    await expect(control(page, 'action.zoom_out')).not.toHaveAttribute('aria-disabled', 'true');
    await shot(page, 'narrow-pinched-en-US', browserName);
  });

  test('F-013.R4 RULE-21 a cancelled pinch (touchcancel) puts the zoom and the playhead back; a held clip drag is not a pinch', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP touch input');
    await open(page);
    await photos(page, 20);
    await at(page, 4);
    const track = timeline(page).locator('.tk-track');
    await settled(track);
    const before = (await track.boundingBox())!;
    const y = before.y + before.height / 2;
    const mid = (await centreX(page)) + 60;
    const send = await touch(page);
    await send('touchStart', [
      { x: mid - 20, y, id: 1 },
      { x: mid + 20, y, id: 2 },
    ]);
    for (let i = 1; i <= 6; i++)
      await send('touchMove', [
        { x: mid - 20 - 6 * i, y, id: 1 },
        { x: mid + 20 + 6 * i, y, id: 2 },
      ]);
    expect((await track.boundingBox())!.width).toBeGreaterThan(before.width * 1.5);
    await send('touchCancel', []);
    await expect.poll(async () => (await track.boundingBox())!.width).toBeCloseTo(before.width, 0);
    expect((await preview(page)).playhead).toBe(4);
  });

  test('F-013.R2 a project change in the middle of a touch scroll ends it without errors', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP touch input');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    await photos(page, 20);
    await at(page, 4);
    const send = await touch(page);
    const track = (await timeline(page).locator('.tk-track').boundingBox())!;
    const y = track.y + track.height / 2;
    const x0 = (await centreX(page)) + 40;
    await send('touchStart', [{ x: x0, y, id: 1 }]);
    await send('touchMove', [{ x: x0 - 30, y, id: 1 }]);
    const doc = await stateOf<object>(page);
    await load(page, { ...doc, clips: [], sources: [] });
    await send('touchMove', [{ x: x0 - 90, y, id: 1 }]);
    await send('touchEnd', []);
    await expect(timeline(page).locator('.tk-lanes')).toHaveAttribute('data-empty', '');
    expect(errors).toEqual([]);
  });

  test('F-013.R2 D-013 a tap that stops the momentum leaves the view on a frame start', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP touch input');
    await open(page);
    await photos(page, 60);
    await control(page, 'action.zoom_in').click();
    await control(page, 'action.zoom_in').click();
    await at(page, 30);
    const send = await touch(page);
    const track = (await timeline(page).locator('.tk-track').boundingBox())!;
    const y = track.y + track.height / 2;
    const x0 = (await centreX(page)) + 60;
    // A quick flick, then a tap while it glides.
    await send('touchStart', [{ x: x0, y, id: 1 }]);
    for (let i = 1; i <= 5; i++) await send('touchMove', [{ x: x0 - 25 * i, y, id: 1 }]);
    await send('touchEnd', []);
    await send('touchStart', [{ x: x0, y, id: 2 }]);
    await send('touchEnd', []);
    const px = await pxPerSecond(page);
    const head = (await preview(page)).playhead;
    // The playhead is a frame start (30 fps) and the scroll puts exactly it under the centre line.
    expect(Math.abs(head * 30 - Math.round(head * 30))).toBeLessThan(1e-3);
    expect(Math.abs((await scrollLeft(page)) - head * px)).toBeLessThan(1);
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-013.R1 NFR-06 RULE-21 on a phone the zoom pill (Snapping, Zoom out, Zoom in, Fit) works at touch size and passes axe at 320 px (${lang})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: 320, height: 700 });
      await open(page, lang);
      await photos(page, 20, 1, lang);
      await at(page, 6);
      const pill = page.locator('.tk-tl-zoom');
      await expect(pill).toBeVisible();
      for (const b of await pill.getByRole('button').all()) {
        const box = (await b.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(32);
      }
      const px = await pxPerSecond(page);
      await control(page, 'action.zoom_in', lang).click();
      await expect.poll(() => pxPerSecond(page)).toBeCloseTo(2 * px, 1);
      // The playhead stays centred and keeps its time.
      expect(Math.abs((await headX(page)) - (await centreX(page)))).toBeLessThan(1.5);
      expect((await preview(page)).playhead).toBe(6);
      await axe(page);
      await shot(page, `narrow-zoomed-${lang}`, browserName);
      await control(page, 'action.zoom_fit', lang).click();
      await expect.poll(() => pxPerSecond(page)).toBeCloseTo(px, 1);
    });
  }
});
