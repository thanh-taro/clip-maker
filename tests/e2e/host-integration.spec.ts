// F-019 Fit into the host portal (RULE-17, NFR-09, MOD-Host) on the multi-origin host harness
// (tests/e2e/support/host-harness.mjs): a stub of the TaroKit portal's tool page with the portal's
// sandbox and allow attributes for Clip Maker, the tool built with that stub as its one allowed host and
// served with its real CSP. Covers the theme from the address and from messages, the device preference,
// filling the host area, origin and source checks, frame-ancestors, the single ready signal and focus.
// AC2 (theme switch during playback of an edited project), AC6 (every M-1 feature, observed at the host) and AC9
// (the long 1080 export from the frame) are in host-embedded.spec.ts; AC7 is in language.spec.ts (F-022.AC8).
import { expect, test, type Frame, type Page } from '@playwright/test';
import {
  HOST_ALLOWED,
  HOST_OTHER,
  hostPageUrl,
  TOOL_ALLOWED,
  TOOL_BOTH,
  TOOL_EMPTY,
  type HostOptions,
} from './support/host-urls';

const SHELL = '[data-screen="SCR-Editor"]';
const DARK_WORK_AREA = 'rgb(11, 8, 18)';
const LIGHT_WORK_AREA = 'rgb(236, 232, 244)';

type HostWindow = Window & {
  __frameLoads: number;
  __received: { origin: string; data: unknown }[];
  __sendTheme: (v: unknown) => void;
  __sendLanguage: (v: unknown) => void;
  __fromSibling: (d: unknown) => void;
  __resizeTool: (w: number, h: number) => void;
};
type ToolWindow = Window & { __mark?: number; __keys?: string[] };

async function openHost(page: Page, o: HostOptions = {}, host = HOST_ALLOWED, tool = TOOL_ALLOWED): Promise<void> {
  await page.goto(hostPageUrl(host, tool, o));
}

/** The embedded tool's frame once its shell has rendered. */
async function toolFrame(page: Page): Promise<Frame> {
  await expect(page.frameLocator('#tool').locator(SHELL)).toBeVisible();
  const frame = page.frames().find((f) => f.url().startsWith(TOOL_ALLOWED));
  if (!frame) throw new Error('tool frame not found');
  return frame;
}

const workArea = (root: Page | Frame) =>
  root.locator('.tk-preview-area').evaluate((el) => getComputedStyle(el).backgroundColor);
const received = (page: Page) => page.evaluate(() => (window as unknown as HostWindow).__received);
const sendTheme = (page: Page, v: unknown) =>
  page.evaluate((value) => (window as unknown as HostWindow).__sendTheme(value), v);
const sendLanguage = (page: Page, v: unknown) =>
  page.evaluate((value) => (window as unknown as HostWindow).__sendLanguage(value), v);

/** Marks the tool's window, so a reload (which would lose the session) is detectable. */
const markWindow = (frame: Frame) => frame.evaluate(() => ((window as ToolWindow).__mark = 42));
const sameWindow = (frame: Frame) => frame.evaluate(() => (window as ToolWindow).__mark === 42);

/** Lets messages from other windows be delivered before asserting that nothing changed. */
const settle = (page: Page) => page.waitForTimeout(300);

test('F-019.AC1 the host opens the tool with theme dark: dark from first display, never light first', async ({
  page,
}) => {
  // The device prefers light, so any fallback would show light.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript((tool) => {
    if (location.origin !== tool) return;
    const seen: (string | null)[] = [];
    (window as unknown as { __themes: (string | null)[] }).__themes = seen;
    const record = () => {
      const t = document.documentElement?.getAttribute('data-theme') ?? null;
      if (seen[seen.length - 1] !== t) seen.push(t);
    };
    new MutationObserver(record).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }, TOOL_ALLOWED);
  await openHost(page, { theme: 'dark', lang: 'en-US' });
  const frame = await toolFrame(page);
  const themes = await frame.evaluate(() => (window as unknown as { __themes: (string | null)[] }).__themes);
  // Before the boot script (first in <head>) nothing is painted; from then on, dark only.
  expect(themes.filter((t) => t !== null)).toEqual(['dark']);
  expect(await workArea(frame)).toBe(DARK_WORK_AREA);
});

test('F-019.R1 follows later theme messages live, without reloading; an unknown value keeps the theme', async ({
  page,
}) => {
  await openHost(page, { theme: 'light', lang: 'en-US' });
  const frame = await toolFrame(page);
  const editor = page.frameLocator('#tool').locator(SHELL);
  await expect(editor).toHaveAttribute('data-workers', '5');
  await markWindow(frame);
  expect(await workArea(frame)).toBe(LIGHT_WORK_AREA);

  await sendTheme(page, 'dark');
  const html = page.frameLocator('#tool').locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await workArea(frame)).toBe(DARK_WORK_AREA);

  // Edge case: an unknown theme value keeps the current theme. The language message sent after it by
  // the same window is handled after it, so its effect proves 'blue' was processed.
  await sendTheme(page, 'blue');
  await sendLanguage(page, 'vi-VN');
  await expect(html).toHaveAttribute('lang', 'vi-VN');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  // Nothing reloaded: same window, workers still started, still the editor.
  expect(await sameWindow(frame)).toBe(true);
  await expect(editor).toHaveAttribute('data-workers', '5');
});

test('F-019.AC3 standalone on a dark device, the tool loads dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${TOOL_ALLOWED}/`);
  await expect(page.locator(SHELL)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await workArea(page)).toBe(DARK_WORK_AREA);
});

test('F-019.R2 standalone, the tool follows a change of the device preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${TOOL_ALLOWED}/`);
  await expect(page.locator(SHELL)).toBeVisible();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await workArea(page)).toBe(LIGHT_WORK_AREA);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('F-019.R1 embedded with no theme in the address and no message, the tool follows the device', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openHost(page, { lang: 'en-US' });
  await toolFrame(page);
  const html = page.frameLocator('#tool').locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  // Once the host sends a theme, the host owns it.
  await sendTheme(page, 'light');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await settle(page);
  await expect(html).toHaveAttribute('data-theme', 'light');
});

test('F-019.AC4 the tool fills the resized host area without a page scrollbar', async ({ page }) => {
  await openHost(page, { theme: 'dark', lang: 'vi-VN' });
  const frame = await toolFrame(page);
  for (const [w, h] of [
    [1200, 760],
    [820, 760],
    [390, 844],
    [320, 480],
    [1280, 800],
  ] as const) {
    await page.evaluate(([width, height]) => (window as unknown as HostWindow).__resizeTool(width, height), [
      w,
      h,
    ] as const);
    await expect.poll(() => frame.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([w, h]);
    const m = await frame.evaluate((sel) => {
      const shell = document.querySelector(sel)!.getBoundingClientRect();
      const doc = document.documentElement;
      return {
        shell: [Math.round(shell.width), Math.round(shell.height)],
        overflowX: doc.scrollWidth - doc.clientWidth,
        overflowY: doc.scrollHeight - doc.clientHeight,
      };
    }, SHELL);
    expect(m.shell, `${w}×${h}`).toEqual([w, h]);
    expect(m.overflowX, `${w}×${h}`).toBeLessThanOrEqual(0);
    expect(m.overflowY, `${w}×${h}`).toBeLessThanOrEqual(0);
  }
});

test('F-019.AC5 settings from an origin that is not allowed or from a window other than the host are ignored', async ({
  page,
}) => {
  await openHost(page, { theme: 'dark', lang: 'en-US' });
  await toolFrame(page);
  const html = page.frameLocator('#tool').locator('html');

  // A window on an origin not in the allow-list.
  await page.evaluate((src) => {
    const f = document.createElement('iframe');
    f.id = 'foreign';
    f.src = src;
    document.body.appendChild(f);
  }, `${HOST_OTHER}/foreign`);
  await expect.poll(() => page.frames().some((f) => f.url().startsWith(HOST_OTHER))).toBe(true);
  const foreign = page.frames().find((f) => f.url().startsWith(HOST_OTHER))!;
  await foreign.waitForLoadState();
  await foreign.evaluate(
    ([origin]) => {
      const tool = parent.frames[0] as Window;
      tool.postMessage({ type: 'taro:theme', value: 'light' }, origin as string);
      tool.postMessage({ type: 'taro:language', value: 'vi-VN' }, origin as string);
    },
    [TOOL_ALLOWED],
  );
  // The allowed origin, but a window other than the embedding page (a same-origin sibling frame).
  await page.evaluate(() => {
    const w = window as unknown as HostWindow;
    w.__fromSibling({ type: 'taro:theme', value: 'light' });
    w.__fromSibling({ type: 'taro:language', value: 'vi-VN' });
  });
  await settle(page);
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveAttribute('lang', 'en-US');

  // Control: the same message from the embedding page is accepted.
  await sendTheme(page, 'light');
  await expect(html).toHaveAttribute('data-theme', 'light');
});

/** The page CSP's frame-ancestors directive of a response, exactly. */
async function frameAncestorsOf(page: Page, url: string): Promise<string | undefined> {
  const csp = (await page.request.get(url)).headers()['content-security-policy'] ?? '';
  return csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith('frame-ancestors'));
}

/**
 * Waits until the host's frame has finished loading, then returns what its document is: in place of a
 * blocked page the browser shows an error page (Chromium) or an empty document (WebKit, which keeps the
 * frame's URL origin), never the tool's own document.
 */
async function loadedFrameDocument(page: Page): Promise<{ origin: string; title: string; shell: boolean } | null> {
  await expect.poll(() => page.evaluate(() => (window as unknown as HostWindow).__frameLoads)).toBeGreaterThan(0);
  const frame = await (await page.locator('#tool').elementHandle())?.contentFrame();
  if (!frame) return null;
  return frame
    .evaluate(
      (sel) => ({ origin: location.origin, title: document.title, shell: document.querySelector(sel) !== null }),
      SHELL,
    )
    .catch(() => null);
}

/** A loaded frame document that is not the tool's: no tool title, no shell (or not readable at all). */
const notTheTool = (doc: { title: string; shell: boolean } | null) =>
  doc === null || (doc.title !== 'Clip Maker' && !doc.shell);

test('F-019.AC5 a page that is not allowed cannot embed the tool', async ({ page }) => {
  expect(await frameAncestorsOf(page, `${TOOL_ALLOWED}/`)).toBe(`frame-ancestors ${HOST_ALLOWED}`);

  await openHost(page, { theme: 'dark' }, HOST_OTHER);
  const blocked = await loadedFrameDocument(page);
  expect(notTheTool(blocked), JSON.stringify(blocked)).toBe(true);
  expect(await received(page)).toEqual([]);

  // Control: the allowed host's frame loads the tool's own document.
  await openHost(page, { theme: 'dark' });
  expect(await loadedFrameDocument(page)).toMatchObject({ origin: TOOL_ALLOWED, title: 'Clip Maker' });
  await toolFrame(page);

  // An empty allow-list deploys frame-ancestors 'none' (RULE-17: standalone only). TOOL_EMPTY is a
  // header-only stand-in for that build (the HOST_ORIGINS="" build itself is a unit test).
  expect(await frameAncestorsOf(page, `${TOOL_EMPTY}/`)).toBe("frame-ancestors 'none'");
  await openHost(page, { theme: 'dark' }, HOST_ALLOWED, TOOL_EMPTY);
  const none = await loadedFrameDocument(page);
  expect(notTheTool(none), JSON.stringify(none)).toBe(true);
  await page.goto(`${TOOL_EMPTY}/`);
  await expect(page.locator(SHELL)).toBeVisible();
});

test('F-019.AC5 embedded by a page the tool does not allow, it sends no ready signal and ignores its settings', async ({
  page,
}) => {
  // The headers let HOST_OTHER frame this server, but the tool's compiled-in allow-list is HOST_ALLOWED
  // only: the tool's own origin checks (ready target, settings) are what refuse it.
  expect(await frameAncestorsOf(page, `${TOOL_BOTH}/`)).toBe(`frame-ancestors ${HOST_ALLOWED} ${HOST_OTHER}`);
  await openHost(page, { theme: 'dark', lang: 'en-US' }, HOST_OTHER, TOOL_BOTH);
  const tool = page.frameLocator('#tool');
  await expect(tool.locator(SHELL)).toBeVisible();
  const html = tool.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await sendTheme(page, 'light');
  await sendLanguage(page, 'vi-VN');
  await settle(page);
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveAttribute('lang', 'en-US');
  expect(await received(page)).toEqual([]);
});

test('F-019.R5 the only message the tool sends the host is one ready signal without content', async ({ page }) => {
  await openHost(page, { theme: 'dark', lang: 'vi-VN' });
  const frame = await toolFrame(page);
  await expect.poll(() => received(page)).toHaveLength(1);
  // Settings, resizing, focus, clicks and keys produce no message.
  await sendTheme(page, 'light');
  await sendLanguage(page, 'en-US');
  await page.evaluate(() => (window as unknown as HostWindow).__resizeTool(400, 600));
  await page
    .frameLocator('#tool')
    .locator('.tk-preview-area')
    .click({ position: { x: 5, y: 5 } });
  await frame.page().keyboard.press('Tab');
  await settle(page);
  expect(await received(page)).toEqual([{ origin: TOOL_ALLOWED, data: { type: 'taro:ready' } }]);
});

test('F-019.R6 focus moves into the tool only when the host moves it after the ready signal, with no autofocus', async ({
  page,
  browserName,
}) => {
  await openHost(page, { theme: 'dark', lang: 'en-US' });
  const frame = await toolFrame(page);
  await frame.evaluate(() => {
    const w = window as ToolWindow;
    w.__keys = [];
    window.addEventListener('keydown', (e) => w.__keys!.push(e.code), true);
  });
  // The host focused its frame on the first ready, and the tool's document has focus.
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('tool');
  await expect.poll(() => frame.evaluate(() => document.hasFocus())).toBe(true);
  // Chromium: the tool then focuses its first control. WebKit refuses focus() in a cross-origin frame
  // without a gesture, so its body keeps focus; either way keys now reach the tool.
  const active = await frame.evaluate(() => document.activeElement?.getAttribute('data-action') ?? 'body');
  expect(['add-media', 'body']).toContain(active);
  if (browserName === 'chromium') expect(active).toBe('add-media');
  await page.keyboard.press('KeyN');
  await expect.poll(() => frame.evaluate(() => (window as ToolWindow).__keys)).toEqual(['KeyN']);
  expect(await frame.locator('[autofocus]').count()).toBe(0);
});

test('F-019.AC8 F-017.R1 embedded with focus never moved, Space does nothing in the tool; after a click in the tool, Space plays', async ({
  page,
}) => {
  await openHost(page, { theme: 'dark', lang: 'en-US', focus: false });
  const tool = page.frameLocator('#tool');
  // A project to play: a 1 × 1 photo (3 s) through the tool's own Add media.
  const chooser = page.waitForEvent('filechooser');
  await tool.locator('.tk-empty').getByRole('button', { name: 'Add media' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'P.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(tool.locator('.tk-clip')).toHaveCount(1, { timeout: 20_000 });
  await tool.locator('.tk-media').getByRole('button', { name: 'Close' }).click();
  // Focus back on the host page (the host never moved it into the frame): Space stays with the host.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.focus();
  });
  const play = tool.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeVisible();
  await page.keyboard.press('Space');
  await settle(page);
  await expect(play).toBeVisible();
  // A click in the tool (the timeline): Space now plays.
  await tool.locator('.tk-timeline').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await expect(tool.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('F-019.R6 until focus moves into the tool, keys go to the host page; after a click they reach the tool', async ({
  page,
}) => {
  await openHost(page, { theme: 'dark', lang: 'en-US', focus: false });
  const frame = await toolFrame(page);
  await frame.evaluate(() => {
    const w = window as ToolWindow;
    w.__keys = [];
    window.addEventListener('keydown', (e) => w.__keys!.push(e.code), true);
  });
  await page.evaluate(() => {
    (window as unknown as { __hostKeys: string[] }).__hostKeys = [];
    window.addEventListener('keydown', (e) => (window as unknown as { __hostKeys: string[] }).__hostKeys.push(e.code));
  });
  await page.keyboard.press('Space');
  await settle(page);
  expect(await frame.evaluate(() => (window as ToolWindow).__keys)).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __hostKeys: string[] }).__hostKeys)).toEqual(['Space']);
  // Focus never moved, so no control in the tool took it.
  expect(await frame.evaluate(() => document.activeElement === document.body)).toBe(true);

  // A click in the tool moves focus there; keys then reach the tool.
  await page
    .frameLocator('#tool')
    .locator('.tk-timeline')
    .click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('KeyN');
  await expect.poll(() => frame.evaluate(() => (window as ToolWindow).__keys)).toEqual(['KeyN']);
});
