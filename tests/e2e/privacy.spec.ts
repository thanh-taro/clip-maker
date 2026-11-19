// F-020 — the privacy guarantee (CMP-StatusBar), on `pnpm preview` of dist/ with the real headers:
// the badge at 320 px and desktop width in both languages and themes, the privacy details popover,
// the source link (new tab, no referrer, session untouched), and the in-tool licence notices inside a
// host frame that blocks new tabs, offline. The claims COPY-privacy.details makes are checked too: the
// tool requests only its own files and keeps nothing in the browser's storage (PRN-01, NFR-01, INV-01).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NOTICE_CODE, NOTICE_FONTS, NOTICE_TEXTS } from '../../src/app/notices.gen';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import { HOST_ALLOWED, TOOL_ALLOWED, hostPageUrl } from './support/host-urls';

/** The looks manifest's response, waited for from before the page opens (it may come late, see below). */
const manifestResponse = (page: Page) =>
  page.waitForResponse((r) => new URL(r.url()).pathname === '/asset-manifest.json', { timeout: 30_000 });

/**
 * The tool's start-up requests are over: the device check is done (its `tk-device-checked` mark, in the tool's
 * own frame), the looks manifest GET that follows it has been answered, and the network is idle. `networkidle`
 * alone can fire before the device check ends, and so before that GET.
 */
async function startupSettled(page: Page, toolUrl: string, manifest: Promise<unknown>): Promise<void> {
  const frame = () => page.frames().find((f) => f.url().startsWith(toolUrl));
  await expect
    .poll(async () => (await frame()?.evaluate(() => performance.getEntriesByName('tk-device-checked').length)) ?? 0, {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
  await manifest;
  await page.waitForLoadState('networkidle');
}

const REPO = 'https://github.com/thanh-taro/clip-maker';
const text = (lang: Language, id: keyof (typeof CATALOG)['en-US']): string => CATALOG[lang][id] as string;

/** Records every request; any request to another origin is aborted, never sent. */
async function guard(context: BrowserContext, origin: string): Promise<{ requests: string[] }> {
  const requests: string[] = [];
  context.on('request', (r) => requests.push(`${r.method()} ${r.url()}`));
  await context.route(
    (url) => url.origin !== origin && url.protocol !== 'data:',
    (route) => route.abort(),
  );
  return { requests };
}

const badgeOf = (page: Page, lang: Language) =>
  page.locator('footer').getByRole('button', { name: text(lang, 'privacy.badge') });

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

/**
 * RULE-21 hit test: which of the points `reach` px above and below the target's centre land on it.
 * Points outside the viewport are reported as `null` (only the device's bottom safe area is there).
 */
const hits = (target: Locator, reach: number) =>
  target.evaluate((el, d) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    return [y - d, y + d].map((py) => {
      if (py < 0 || py >= innerHeight) return null;
      const hit = document.elementFromPoint(x, py);
      return !!hit && (hit === el || el.contains(hit));
    });
  }, reach);

test.describe('F-020 privacy badge', () => {
  for (const width of [320, 1280]) {
    for (const [lang, theme] of [
      ['en-US', 'dark'],
      ['vi-VN', 'light'],
      ['en-US', 'light'],
      ['vi-VN', 'dark'],
    ] as const) {
      test(`F-020.AC1 COPY-privacy.badge is fully visible in the status area at ${width} px (${lang}, ${theme})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: width < 700 ? 640 : 800 });
        await page.goto(`/?theme=${theme}&lang=${lang}`);
        const badge = badgeOf(page, lang);
        await expect(badge).toBeVisible();
        const label = badge.getByText(text(lang, 'privacy.badge'), { exact: true });
        await expect(label).toBeVisible();
        // Measure with the real typefaces in place (a fallback face has other widths).
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        // Fully visible: not clipped or ellipsed, inside the viewport, and no horizontal page scroll (NFR-07).
        const fit = await label.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            clipped: el.scrollWidth > Math.ceil(r.width) + 1,
            left: r.left,
            right: r.right,
            viewport: document.documentElement.clientWidth,
            pageScroll: document.documentElement.scrollWidth,
            fontSize: parseFloat(getComputedStyle(el).fontSize),
          };
        });
        expect(fit.clipped).toBe(false);
        expect(fit.left).toBeGreaterThanOrEqual(0);
        expect(fit.right).toBeLessThanOrEqual(fit.viewport);
        expect(fit.pageScroll).toBeLessThanOrEqual(fit.viewport);
        // Never below the smallest type size (CMP-StatusBar accessibility; tokens font.size.2xs = 11 px).
        expect(fit.fontSize).toBeGreaterThanOrEqual(11);
        // The source link sits next to the statement (F-020.R3), named by COPY-privacy.source_label.
        const link = page.locator('footer').getByRole('link', { name: text(lang, 'privacy.source_label') });
        await expect(link).toBeVisible();
        // RULE-21: the narrow row's targets take touches 22 px above and below their centre (44 px,
        // reaching into the bottom safe area); wide with a fine pointer they meet the 24 px minimum.
        const reach = width < 700 ? 22 : 11;
        for (const target of [badge, link]) {
          const [above, below] = await hits(target, reach);
          expect(above).toBe(true);
          if (below !== null) expect(below).toBe(true);
        }
      });
    }
  }

  test.describe('with a coarse pointer', () => {
    // A touch-first device at desktop width (a tablet in landscape): mobile emulation with touch makes
    // the primary pointer coarse; an engine that cannot emulate it skips the test.
    test.use({ hasTouch: true, isMobile: true });
    test('F-020.AC1 RULE-21 at desktop width with touch, the badge and source link take touches 22 px from their centre', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/?lang=en-US');
      const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
      test.skip(!coarse, 'this engine does not report a coarse pointer for an emulated touch screen');
      const badge = badgeOf(page, 'en-US');
      await expect(badge).toBeVisible();
      for (const target of [badge, page.locator('footer').getByRole('link')]) {
        const [above, below] = await hits(target, 22);
        expect(above).toBe(true);
        if (below !== null) expect(below).toBe(true);
      }
    });
  });
});

test.describe('F-020 privacy details', () => {
  for (const [lang, width] of [
    ['en-US', 1280],
    ['vi-VN', 320],
  ] as const) {
    test(`F-020.AC2 activating the badge shows COPY-privacy.details; Esc, close and a click outside dismiss it (${lang}, ${width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(`/?lang=${lang}`);
      const badge = badgeOf(page, lang);
      const details = page.getByRole('dialog', { name: text(lang, 'privacy.badge') });
      await expect(badge).toHaveAttribute('aria-expanded', 'false');

      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      // Open → details; the badge reports its expanded state. Esc closes and focus returns to the badge.
      await badge.click();
      await expect(details).toBeVisible();
      await expect(details.getByText(text(lang, 'privacy.details'), { exact: true })).toBeVisible();
      await expect(badge).toHaveAttribute('aria-expanded', 'true');
      await expect(details).toHaveAccessibleDescription(text(lang, 'privacy.details'));
      const box = await details.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      // NFR-06: no axe violation with the details open, nor with the notices view open.
      await axe(page);
      await details.getByRole('button', { name: text(lang, 'privacy.notices') }).click();
      const notices = page.getByRole('dialog', { name: text(lang, 'privacy.notices_title') });
      await expect(notices).toBeVisible();
      await axe(page);
      await notices.getByRole('button', { name: text(lang, 'action.back') }).click();
      await expect(notices).toBeHidden();
      await expect(details).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(details).toBeHidden();
      await expect(badge).toHaveAttribute('aria-expanded', 'false');
      await expect(badge).toBeFocused();

      // Close button.
      await badge.click();
      await expect(details).toBeVisible();
      await details.getByRole('button', { name: text(lang, 'action.close') }).click();
      await expect(details).toBeHidden();
      await expect(badge).toBeFocused();

      // A click outside (the work area).
      await badge.click();
      await expect(details).toBeVisible();
      await page.locator('.tk-preview-area').click({ position: { x: 5, y: 5 } });
      await expect(details).toBeHidden();

      // Activating the badge again toggles the details closed.
      await badge.click();
      await expect(details).toBeVisible();
      await badge.click();
      await expect(details).toBeHidden();
    });
  }
});

test('F-020.AC3 the source link opens the repository in a new tab with no referrer and no opener; the session is unchanged', async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? '').origin;
  const { requests } = await guard(context, origin);
  await page.goto('/?lang=en-US');
  const editor = page.locator('[data-screen="SCR-Editor"]');
  await expect(editor).toBeVisible();
  // The session's identity: a value only this page holds, and the editor's state.
  await page.evaluate(() => ((window as unknown as { __session: number }).__session = 4242));
  const state = await editor.getAttribute('data-state');

  const link = page.locator('footer').getByRole('link', { name: text('en-US', 'privacy.source_label') });
  await expect(link).toHaveAttribute('href', REPO);
  await expect(link).toHaveAttribute('target', '_blank');
  const rel = ((await link.getAttribute('rel')) ?? '').split(/\s+/);
  expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));

  const opened = context.waitForEvent('request', (r) => r.url().startsWith(REPO));
  const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
  const request = await opened;
  expect(request.url()).toBe(REPO);
  expect(request.headers()['referer']).toBeUndefined();
  expect(request.frame().page()).toBe(popup);
  await popup.close();

  // The tool's page did not navigate, reload or change state.
  expect(page.url()).toBe(`${origin}/?lang=en-US`);
  expect(await page.evaluate(() => (window as unknown as { __session?: number }).__session)).toBe(4242);
  await expect(editor).toHaveAttribute('data-state', state ?? '');
  // The only request to another origin is the new tab's own navigation, which the test aborted.
  expect(requests.filter((r) => !r.includes(` ${origin}/`))).toEqual([`GET ${REPO}`]);
});

// "Given an edited project" (spec question 52): a clip added through the UI (F-001) and the playhead moved
// with the transport (F-002); the timeline view (F-003) and the Undo button (F-014) are not built yet, so
// the project is read through the transport (its length and the playhead) and the editor state.
test('F-020.AC3 with an edited project, opening the source link leaves the project and the playhead unchanged', async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? '').origin;
  await guard(context, origin);
  await page.goto('/?lang=en-US');
  const editor = page.locator('[data-screen="SCR-Editor"]');
  await expect(editor).toHaveAttribute('data-device', 'supported');
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('main')
    .getByRole('button', { name: text('en-US', 'action.add_media') })
    .click();
  await (
    await chooser
  ).setFiles({
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    buffer: readFileSync(fileURLToPath(new URL('../fixtures/media/mp4-faststart.mp4', import.meta.url))),
  });
  const transport = page.locator('.tk-transport');
  const next = transport.getByRole('button', { name: text('en-US', 'action.next_frame'), exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await next.click();
  await expect(transport).toContainText('0:00·02 / 0:02');
  await expect(editor).toHaveAttribute('data-state', 'default');

  const link = page.locator('footer').getByRole('link', { name: text('en-US', 'privacy.source_label') });
  const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
  await popup.close();

  expect(page.url()).toBe(`${origin}/?lang=en-US`);
  await expect(transport).toContainText('0:00·02 / 0:02');
  await expect(editor).toHaveAttribute('data-state', 'default');
  await expect(page.getByRole('complementary').getByRole('listitem').filter({ hasText: 'clip.mp4' })).toBeVisible();
});

test('F-020.AC4 in a host frame that blocks new tabs and offline, COPY-privacy.notices opens COPY-privacy.notices_title inside the tool, listing every typeface, dependency, asset and music track', async ({
  browser,
}) => {
  // F-019's host harness: the stub portal page frames the tool with the portal's sandbox (no
  // `allow-popups`, so new tabs are blocked), and the tool is built for that host with its real headers.
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const requests: string[] = [];
    context.on('request', (r) => requests.push(r.url()));
    const page = await context.newPage();
    const manifest = manifestResponse(page);
    await page.goto(hostPageUrl(HOST_ALLOWED, TOOL_ALLOWED, { theme: 'dark', lang: 'en-US' }));
    const tool = page.frameLocator('#tool');
    const badge = tool.locator('footer').getByRole('button', { name: text('en-US', 'privacy.badge') });
    await expect(badge).toBeVisible({ timeout: 15_000 });
    // The first visit is online: MOD-Host has loaded every typeface (ADR-0012 §2) before going offline.
    const frame = page.frames().find((f) => f.url().startsWith(TOOL_ALLOWED));
    await expect
      .poll(() => frame?.evaluate(() => [...document.fonts].map((f) => f.status).join()), { timeout: 10_000 })
      .toMatch(/^loaded(,loaded)+$/);
    // ... and its start-up requests (the looks manifest after the device check) are done.
    await startupSettled(page, TOOL_ALLOWED, manifest);

    // Offline from here on: whatever the view needs is already in the page.
    await context.setOffline(true);
    const before = requests.length;

    // The host blocks new tabs: the source link does nothing and the tool stays as it was.
    const popups: Page[] = [];
    context.on('page', (p) => popups.push(p));
    await tool
      .locator('footer')
      .getByRole('link', { name: text('en-US', 'privacy.source_label') })
      .click();
    await page.waitForTimeout(500);
    expect(popups).toEqual([]);
    await expect(tool.locator('[data-screen="SCR-Editor"]')).toBeVisible();

    await badge.click();
    const details = tool.getByRole('dialog', { name: text('en-US', 'privacy.badge') });
    await details.getByRole('button', { name: text('en-US', 'privacy.notices') }).click();
    const notices = tool.getByRole('dialog', { name: text('en-US', 'privacy.notices_title') });
    await expect(notices).toBeVisible();
    await expect(notices.getByRole('heading', { name: text('en-US', 'privacy.notices_title') })).toBeVisible();

    // Three tables with real headers: typefaces, code, music; each row is title, source, licence.
    for (const [heading, rows] of [
      [text('en-US', 'notices.fonts'), NOTICE_FONTS],
      [text('en-US', 'notices.code'), NOTICE_CODE],
    ] as const) {
      const table = notices.getByRole('table', { name: heading });
      await expect(table.getByRole('columnheader')).toHaveText([
        text('en-US', 'notices.col_title'),
        text('en-US', 'notices.col_source'),
        text('en-US', 'notices.col_licence'),
      ]);
      const body = table.locator('tbody tr');
      await expect(body).toHaveCount(rows.length);
      for (const [i, r] of rows.entries()) {
        await expect(body.nth(i).getByRole('cell')).toHaveText([r.title, r.source, r.licence]);
      }
    }
    await expect(notices.getByRole('table', { name: text('en-US', 'music.title') })).toBeVisible();
    // The notices a licence requires to be shown (DEP-11's Feather MIT notice), in full.
    for (const n of NOTICE_TEXTS) {
      await expect(notices.getByText(n.title, { exact: true })).toBeVisible();
      await expect(notices.locator('pre').filter({ hasText: n.text.split('\n')[2] ?? n.text })).toHaveText(n.text);
    }

    // No request and no new tab while the notices were opened (R4).
    expect(requests.slice(before)).toEqual([]);
    expect(popups).toEqual([]);

    // Back returns to the details; close ends both, and focus returns to the badge.
    await notices.getByRole('button', { name: text('en-US', 'action.back') }).click();
    await expect(notices).toBeHidden();
    await expect(details).toBeVisible();
    await details.getByRole('button', { name: text('en-US', 'privacy.notices') }).click();
    await expect(notices).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(notices).toBeHidden();
    await expect(details).toBeHidden();
    await expect(badge).toBeFocused();
  } finally {
    await context.close();
  }
});

test('NFR-01 PRN-01 INV-01 a session requests only the tool’s own files by GET and leaves nothing in cookies, web storage, databases or caches', async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? '').origin;
  const bodies: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' || r.postData() !== null) bodies.push(`${r.method()} ${r.url()}`);
  });
  const { requests } = await guard(context, origin);
  const manifest = manifestResponse(page);
  await page.goto('/?lang=vi-VN');
  const badge = badgeOf(page, 'vi-VN');
  await expect(badge).toBeVisible();
  // Use everything the status area offers: details, notices, back, close.
  await badge.click();
  await page.getByRole('button', { name: text('vi-VN', 'privacy.notices') }).click();
  await expect(page.getByRole('dialog', { name: text('vi-VN', 'privacy.notices_title') })).toBeVisible();
  await page.getByRole('button', { name: text('vi-VN', 'action.back') }).click();
  await page.keyboard.press('Escape');
  await startupSettled(page, origin, manifest);

  expect(requests.filter((r) => !r.startsWith(`GET ${origin}/`))).toEqual([]);
  expect(bodies).toEqual([]);
  const stored = await page.evaluate(async () => {
    const dbs = 'databases' in indexedDB ? await indexedDB.databases() : [];
    const cacheNames = 'caches' in self ? await caches.keys() : [];
    const cached: string[] = [];
    for (const n of cacheNames) for (const r of await (await caches.open(n)).keys()) cached.push(r.url);
    let opfs: string[] | null = null;
    try {
      const root = await navigator.storage.getDirectory();
      opfs = [];
      for await (const [name, handle] of (
        root as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }
      ).entries()) {
        if (handle.kind === 'directory') {
          for await (const inner of (handle as unknown as { keys(): AsyncIterable<string> }).keys())
            opfs.push(`${name}/${inner}`);
        } else opfs.push(name);
      }
    } catch {
      opfs = null; // No origin-private file system in this context (Playwright WebKit's ephemeral one).
    }
    return {
      local: localStorage.length,
      session: sessionStorage.length,
      cookie: document.cookie,
      dbs: dbs.map((d) => d.name),
      cached,
      opfs,
    };
  });
  expect(stored.local).toBe(0);
  expect(stored.session).toBe(0);
  expect(stored.cookie).toBe('');
  expect(stored.dbs).toEqual([]);
  // The offline cache (F-021) may hold the tool's own files only.
  expect(stored.cached.filter((u) => new URL(u).origin !== origin)).toEqual([]);
  // Scratch space exists only during an export: none is left after a session without one.
  if (stored.opfs !== null) expect(stored.opfs).toEqual([]);
});
