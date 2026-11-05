// F-020.R2 — the export claims of COPY-privacy.details, on the media harness (tests/harness/export.ts)
// with the real export workers: an export makes no request beyond the tool's own files and sends no
// content, keeps nothing in cookies, web storage or databases, and its scratch space is deleted when
// the export ends (PRN-01, NFR-01, INV-01, ADR-0010).
import { expect, test, type BrowserContext } from '@playwright/test';
import { MEDIA_HARNESS_PORT } from './support/ports';

const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;
const ORIGIN = new URL(HARNESS).origin;

/** Records every request (method, URL, body); any request to another origin is aborted. */
async function watch(context: BrowserContext): Promise<string[]> {
  const requests: string[] = [];
  context.on('request', (r) => requests.push(`${r.method()} ${r.url()}${r.postData() === null ? '' : ' +body'}`));
  await context.route(
    (url) => url.origin !== ORIGIN && url.protocol !== 'data:' && url.protocol !== 'blob:',
    (route) => route.abort(),
  );
  return requests;
}

test.describe('F-020 export privacy', () => {
  test('F-020.R2 NFR-01 PRN-01 an export requests nothing but the tool’s own files, stores nothing, and its scratch is deleted when it ends', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    // The default context: in Chromium the export uses its scratch file. Playwright WebKit's default
    // context has no origin-private file system (memory sink), so there the scratch check is moot; a
    // persistent WebKit context would share its data store with export.spec.ts's sweep test, which
    // runs in parallel and would delete this export's files (the scratch lifecycle on WebKit is
    // covered there, serially).
    const requests = await watch(context);
    await page.goto(HARNESS);
    await expect(page.locator('#out')).toHaveText('ready');
    const atStart = requests.length;

    const r = await page.evaluate(() =>
      window.harness.export.run({
        frames: 30,
        settings: { kind: 'video', resolution: 480, quality: 'balanced' },
        sound: true,
      }),
    );
    expect(r.result.ok, JSON.stringify(r.result)).toBe(true);

    // Network: during the export only the tool's own files were fetched, by GET, with no body. WebKit
    // also reports reads of the page's own in-memory `blob:` URLs (the finished file), which never
    // leave the page.
    const offDevice = (q: string) =>
      !(q.startsWith(`GET ${ORIGIN}/`) || q.startsWith(`GET blob:${ORIGIN}/`)) || q.endsWith(' +body');
    expect(requests.slice(atStart).filter(offDevice)).toEqual([]);
    expect(requests.filter(offDevice)).toEqual([]);

    // Scratch: deleted once the export has ended (after the hand-over hold of ADR-0010 outcome item 6).
    if (r.scratchFile) {
      await expect
        .poll(() => page.evaluate(() => window.harness.export.scratchNames()), { timeout: 20_000 })
        .not.toContain(r.scratchFile);
    }
    await expect.poll(() => page.evaluate(() => window.harness.export.pending()), { timeout: 20_000 }).toEqual([]);

    // Nothing else was kept: no cookies, web storage or databases.
    const stored = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookie: document.cookie,
      dbs: 'databases' in indexedDB ? (await indexedDB.databases()).map((d) => d.name) : [],
    }));
    expect(stored).toEqual({ local: 0, session: 0, cookie: '', dbs: [] });
  });
});
