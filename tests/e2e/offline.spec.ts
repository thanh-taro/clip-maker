// F-021 Work offline (ADR-0015; NFR-01, NFR-10) on the offline harness (tests/e2e/support/offline-servers.mjs):
// the real /sw.js of the production build under its deploy headers, standalone and embedded in the stub
// portal (F-019's host harness), on Chromium and WebKit. Each engine has its own tool server, so the
// server-side request logs (which see the service worker's fetches on every engine) never mix.
// "No connection": the tool's server drops every connection, as if it were stopped, and on Chromium the
// context is also put offline with `context.setOffline(true)`. Playwright's offline mode breaks service
// workers on WebKit (every navigation fails with an internal error; the sibling image-annotator's
// ADR-0021), so WebKit relies on the server alone. Embedded, the stub portal page is not the tool's to
// cache, so the portal stays and loads the tool into its frame again.
// Not covered yet (need later features): AC1's add a video, apply a look, add text and bundled music
// through the editor (F-001, F-008, F-010, F-011) and export from the export panel (F-015); here the
// export runs from the offline copy of the export harness with the real export workers. AC2's looks and
// music join once they are packed into the asset manifest (F-008, F-011); the manifest check below
// then covers them with no change.
import { expect, test, type APIRequestContext, type BrowserContext, type Frame, type Page } from '@playwright/test';
import { HOST_ALLOWED, hostPageUrl, offlineServer } from './support/host-urls';

const SHELL = '[data-screen="SCR-Editor"]';
const CACHE_PREFIX = 'clip-maker-offline-';
/** The workers the tool starts at start-up (ADR-0003); each sets `onmessage` once its module has run. */
const WORKERS = ['engine', 'audio', 'analysis', 'export', 'export-audio'] as const;

type Way = 'standalone' | 'embedded';
const WAYS: Way[] = ['standalone', 'embedded'];

interface Logged {
  readonly method: string;
  readonly path: string;
  readonly query: string;
  readonly dest: string;
  readonly mode: string;
}

const ctl = (request: APIRequestContext, server: string, q: string) => request.get(`${server}/${q}`);
const resetLog = (request: APIRequestContext, server: string) => ctl(request, server, '__log/reset');
const requestLog = async (request: APIRequestContext, server: string) =>
  (await (await ctl(request, server, '__log/dump')).json()) as Logged[];
const publish = (request: APIRequestContext, server: string, v: '1' | '2') =>
  ctl(request, server, `__ctl/version?v=${v}`);

/** Opens the tool standalone or in the stub portal; returns the tool's frame once its shell shows. */
async function openTool(page: Page, way: Way, tool: string): Promise<Frame> {
  if (way === 'standalone') {
    await page.goto(`${tool}/?theme=dark&lang=en-US`);
    await expect(page.locator(SHELL)).toBeVisible({ timeout: 15_000 });
    return page.mainFrame();
  }
  await page.goto(hostPageUrl(HOST_ALLOWED, tool, { theme: 'dark', lang: 'en-US' }));
  return toolFrame(page, tool);
}

async function toolFrame(page: Page, tool: string): Promise<Frame> {
  await expect(page.frameLocator('#tool').locator(SHELL)).toBeVisible({ timeout: 15_000 });
  const frame = page.frames().find((f) => f.url().startsWith(tool));
  if (!frame) throw new Error('tool frame not found');
  return frame;
}

/**
 * Opens the tool again, as the user does: standalone a new load of the page; embedded the stub portal
 * loads the tool into its frame again (the portal page itself stays, it is not the tool's to cache).
 */
async function reopen(page: Page, way: Way, tool: string): Promise<Frame> {
  if (way === 'standalone') {
    await page.reload();
    await expect(page.locator(SHELL)).toBeVisible({ timeout: 15_000 });
    return page.mainFrame();
  }
  await page.evaluate(() => {
    const frame = document.getElementById('tool') as HTMLIFrameElement;
    frame.src = frame.src;
  });
  await page.waitForFunction(() => (window as unknown as { __frameLoads: number }).__frameLoads >= 2);
  return toolFrame(page, tool);
}

/**
 * Waits until the worker is active and its version's cache holds a full copy (the manifest is stored
 * last, ADR-0015); returns that cache's keys as paths and the manifest's files.
 */
async function offlineReady(frame: Frame): Promise<{ cache: string; keys: string[]; files: string[] }> {
  const ready = () =>
    frame.evaluate(async (prefix) => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.active?.state !== 'activated') return null;
      for (const name of await caches.keys()) {
        if (!name.startsWith(prefix)) continue;
        const cache = await caches.open(name);
        const manifest = await cache.match('/asset-manifest.json');
        if (!manifest) continue;
        const { files } = (await manifest.json()) as { files: Record<string, string> };
        const keys = (await cache.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search);
        return { cache: name, keys, files: Object.keys(files) };
      }
      return null;
    }, CACHE_PREFIX);
  await expect.poll(ready, { timeout: 30_000 }).not.toBeNull();
  return (await ready())!;
}

/**
 * The start-up workers running, found by their built file names, each with its module evaluated. The
 * engine worker answers only between frames of its start-up effects check, which takes seconds on
 * software WebGL (F-023), so callers wait up to a minute.
 */
async function runningWorkers(page: Page): Promise<string[]> {
  const names: string[] = [];
  for (const w of page.workers()) {
    const m = /\/assets\/([\w-]+)\.worker-[\w-]+\.js$/.exec(w.url());
    if (!m?.[1]) continue;
    // A worker of an earlier load of the frame may still be listed while it closes.
    const runs = await w
      .evaluate(() => typeof (self as unknown as { onmessage: unknown }).onmessage === 'function')
      .catch(() => false);
    if (runs && !names.includes(m[1])) names.push(m[1]);
  }
  return names.sort();
}

const controlled = (frame: Frame) => frame.evaluate(() => !!navigator.serviceWorker.controller);

const serverDown = (request: APIRequestContext, server: string, on: boolean) =>
  ctl(request, server, `__ctl/down?on=${on ? 1 : 0}`);

/** No connection from here on (see the header). */
async function offline(
  context: BrowserContext,
  request: APIRequestContext,
  server: string,
  browserName: string,
): Promise<void> {
  await serverDown(request, server, true);
  if (browserName === 'chromium') await context.setOffline(true);
}

test.describe('F-021 offline', () => {
  // One server per engine: the tests of this file share its request log, so they run one at a time.
  test.describe.configure({ mode: 'default' });
  test.afterEach(async ({ request, browserName }) => {
    for (const which of ['tool', 'update', 'harness'] as const)
      await serverDown(request, offlineServer(browserName, which), false);
  });

  for (const way of WAYS) {
    test(`F-021.AC1 F-021.R1 opened once online, the tool opens with no connection and its engine and export workers load from the offline copy (${way})`, async ({
      page,
      context,
      browserName,
      request,
    }) => {
      test.setTimeout(120_000);
      const tool = offlineServer(browserName);
      const first = await openTool(page, way, tool);
      const { keys, files } = await offlineReady(first);
      // Every file of the build's manifest is stored, the page under the address it is opened at.
      for (const f of files) expect(keys).toContain(f === '/index.html' ? '/' : f);
      expect(files.length).toBeGreaterThan(10);

      await offline(context, request, tool, browserName);
      const frame = await reopen(page, way, tool);
      expect(await controlled(frame)).toBe(true);
      // The start-up check passed offline (F-023): the editor, not SCR-Unsupported, and the workers run.
      await expect(frame.locator('[data-screen="SCR-Unsupported"]')).toHaveCount(0);
      await expect.poll(() => runningWorkers(page), { timeout: 60_000 }).toEqual([...WORKERS].sort());
      // Every typeface loads from the offline copy (ADR-0012 §2).
      await expect
        .poll(() => frame.evaluate(() => [...document.fonts].map((f) => f.status)), { timeout: 10_000 })
        .toEqual(expect.arrayContaining(['loaded']));
      expect(await frame.evaluate(() => [...document.fonts].every((f) => f.status === 'loaded'))).toBe(true);
    });
  }

  test('F-021.AC1 F-021.R1 opened once online, an export runs with no connection from the offline copy (export harness, real export workers)', async ({
    page,
    context,
    browserName,
    request,
  }) => {
    test.setTimeout(120_000);
    const harness = offlineServer(browserName, 'harness');
    await page.goto(`${harness}/`);
    await expect(page.locator('#out')).toHaveText('ready');
    await offlineReady(page.mainFrame());

    await offline(context, request, harness, browserName);
    await page.reload();
    await expect(page.locator('#out')).toHaveText('ready');
    expect(await controlled(page.mainFrame())).toBe(true);
    const r = await page.evaluate(() =>
      window.harness.export.run({
        frames: 30,
        settings: { kind: 'video', resolution: 480, quality: 'balanced' },
        sound: true,
      }),
    );
    expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
  });

  test('F-021.AC2 F-021.R1 F-021.R2 NFR-01 the first visit fetches every file the tool can need, only its own; a later session asks for nothing but the version check while opening', async ({
    page,
    context,
    browserName,
    request,
  }) => {
    test.setTimeout(120_000);
    const tool = offlineServer(browserName);
    await resetLog(request, tool);
    const first = await openTool(page, 'standalone', tool);
    const { files } = await offlineReady(first);
    await page.waitForLoadState('networkidle');

    // First visit: every request is a GET for one of the tool's own files (or the worker), with no
    // query but the page's own address, and every file of the manifest was fetched during it.
    const own = new Set([...files.map((f) => (f === '/index.html' ? '/' : f)), '/', '/sw.js', '/asset-manifest.json']);
    const visit = await requestLog(request, tool);
    expect(visit.filter((r) => r.method !== 'GET' || !own.has(r.path))).toEqual([]);
    expect(visit.filter((r) => r.query && r.path !== '/')).toEqual([]);
    const fetched = new Set(visit.map((r) => r.path));
    expect(files.filter((f) => !fetched.has(f === '/index.html' ? '/' : f))).toEqual([]);

    // A later session (the tab was closed): opening it checks for a new version (the page, network
    // first, and the browser's /sw.js check); typefaces and the export workers ask for nothing.
    const later = await context.newPage();
    await page.close();
    await resetLog(request, tool);
    const frame = await openTool(later, 'standalone', tool);
    expect(await controlled(frame)).toBe(true);
    await expect.poll(() => runningWorkers(later), { timeout: 60_000 }).toEqual([...WORKERS].sort());
    // First use of every typeface in this session: text set in each face.
    await frame.evaluate(async () => {
      const families = new Set([...document.fonts].map((f) => f.family));
      for (const family of families) {
        const el = document.createElement('span');
        el.style.fontFamily = family;
        el.textContent = 'Clip Maker — Tiếng Việt';
        document.body.append(el);
      }
      await document.fonts.ready;
    });
    await later.waitForLoadState('networkidle');
    const session = await requestLog(request, tool);
    expect(session.filter((r) => r.path !== '/' && r.path !== '/sw.js')).toEqual([]);
  });

  test('F-021.AC3 F-021.R3 a version published while the tool is open never reloads it; opened again online and once more, the new version is used, offline too', async ({
    playwright,
    browserName,
    request,
  }, testInfo) => {
    test.setTimeout(90_000);
    const tool = offlineServer(browserName, 'update');
    await publish(request, tool, '1');
    // A persistent profile, as a real browser has (in-memory WebKit contexts lose Cache Storage when a
    // new service worker activates; the sibling image-annotator's ADR-0021).
    const context = await playwright[browserName].launchPersistentContext(testInfo.outputPath('profile'));
    try {
      const pageOf = async () => context.newPage();
      let page = context.pages()[0] ?? (await pageOf());
      const version = (f: Frame) =>
        f.evaluate(() => document.querySelector('meta[name="tk-e2e-version"]')?.getAttribute('content') ?? '1');
      const cacheNames = (f: Frame) =>
        f.evaluate(async (prefix) => (await caches.keys()).filter((n) => n.startsWith(prefix)), CACHE_PREFIX);

      // A returning user: opened once (cached), then opened again under the worker's control.
      const v1Cache = (await offlineReady(await openTool(page, 'standalone', tool))).cache;
      const next = await pageOf();
      await page.close();
      page = next;
      const open = await openTool(page, 'standalone', tool);
      expect(await controlled(open)).toBe(true);
      await open.evaluate(() => ((window as unknown as { __mark: number }).__mark = 42));
      let navigations = 0;
      page.on('framenavigated', (f) => {
        if (f === page.mainFrame()) navigations++;
      });

      // Published while the tool is open. The browser finds the new worker (here asked directly), which
      // installs and waits: nothing reloads, nothing takes over, the session goes on.
      const v1Version = ((await (await request.get(`${tool}/asset-manifest.json`)).json()) as { version: string })
        .version;
      await publish(request, tool, '2');
      const v2Manifest = (await (await request.get(`${tool}/asset-manifest.json`)).json()) as { version: string };
      expect(v2Manifest.version).not.toBe(v1Version);
      await open.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
      await expect
        .poll(() =>
          open.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state ?? null),
        )
        .toBe('installed');
      await page.waitForTimeout(500);
      expect(navigations).toBe(0);
      expect(await open.evaluate(() => (window as unknown as { __mark?: number }).__mark)).toBe(42);
      expect(await version(open)).toBe('1');
      expect(
        await open.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return navigator.serviceWorker.controller !== null && navigator.serviceWorker.controller === reg?.active;
        }),
      ).toBe(true);
      expect(await cacheNames(open)).toEqual(expect.arrayContaining([v1Cache, `${CACHE_PREFIX}${v2Manifest.version}`]));
      await expect(page.locator(SHELL)).toBeVisible();

      // Opened again online: the new version (its page is fetched first).
      const again = await pageOf();
      await page.close();
      page = again;
      expect(await version(await openTool(page, 'standalone', tool))).toBe('2');
      // … and once more: the new worker has taken over; the old version's copy is gone.
      const more = await pageOf();
      await page.close();
      page = more;
      const v2 = await openTool(page, 'standalone', tool);
      expect(await version(v2)).toBe('2');
      await expect.poll(() => cacheNames(v2)).toEqual([`${CACHE_PREFIX}${v2Manifest.version}`]);

      // And with no connection, the offline copy is the new version.
      await offline(context, request, tool, browserName);
      const offlineOpen = await openTool(page, 'standalone', tool);
      expect(await version(offlineOpen)).toBe('2');
      await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute('href', /v2\.css$/);
    } finally {
      await context.close();
      await publish(request, tool, '1');
    }
  });
});
