// F-023 device support (RULE-22) in real engines (adapters/tests.md "Device support"):
// - on the production build, an unsupported device is played by removing or refusing interfaces on
//   the page before it loads (the presence check and the codec probe run on the main thread);
// - on the app harness (tests/harness/app.html), the engine worker's timed effects check is replaced
//   through the address (?effects=slow|fail), since a worker's globals can't be changed from a test.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP_HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;

/** `window.appHarness` of tests/harness/app.tsx. */
interface AppHarness {
  appHarness: { draw(): void; workers(): number };
}

const TEXT = {
  'en-US': {
    title: "This browser can't edit video",
    missing: 'Missing:',
    decode: 'playing video',
    encode: 'creating video files',
    effects: 'drawing effects',
    hint: 'Open Clip Maker in an up-to-date desktop or phone browser.',
    slow: 'This device may play the preview unevenly. Exports are not affected.',
    addMedia: 'Add media',
    close: 'Close',
  },
  'vi-VN': {
    title: 'Trình duyệt này không chỉnh sửa video được',
    missing: 'Thiếu:',
    decode: 'phát video',
    encode: 'tạo tệp video',
    effects: 'vẽ hiệu ứng',
    hint: 'Hãy mở Clip Maker bằng trình duyệt mới trên máy tính hoặc điện thoại.',
    slow: 'Thiết bị này có thể phát xem trước không mượt. Tệp xuất không bị ảnh hưởng.',
    addMedia: 'Thêm tệp',
    close: 'Đóng',
  },
} as const;

/** Records every request and worker; requests to another origin are aborted (never sent). */
function watch(page: Page, origin: string) {
  const requests: string[] = [];
  const workers: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('worker', (w) => workers.push(w.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  void page.route(
    (url) => url.origin !== origin && url.protocol !== 'data:',
    (route) => route.abort(),
  );
  return { requests, workers, errors, foreign: () => requests.filter((u) => new URL(u).origin !== origin) };
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

/** The interfaces removed or refused before the page's own scripts run. */
const DEVICES = {
  noDecoder: () => {
    delete (globalThis as Record<string, unknown>)['VideoDecoder'];
  },
  noVideoEncoder: () => {
    const VE = (globalThis as unknown as { VideoEncoder: { isConfigSupported: unknown } }).VideoEncoder;
    VE.isConfigSupported = async (config: unknown) => ({ supported: false, config });
  },
  noSoundEncoder: () => {
    const AE = (globalThis as unknown as { AudioEncoder: { isConfigSupported: unknown } }).AudioEncoder;
    AE.isConfigSupported = async (config: unknown) => ({ supported: false, config });
  },
  noWebgl2: () => {
    for (const C of [HTMLCanvasElement, OffscreenCanvas]) {
      const get = C.prototype.getContext as (this: unknown, id: string, ...rest: unknown[]) => unknown;
      (C.prototype as { getContext: unknown }).getContext = function (this: unknown, id: string, ...rest: unknown[]) {
        return id === 'webgl2' ? null : get.call(this, id, ...rest);
      };
    }
  },
  /** The Gecko Android browser: no codec interfaces at all (architecture.md). */
  geckoAndroid: () => {
    for (const name of ['VideoDecoder', 'VideoEncoder', 'AudioDecoder', 'AudioEncoder', 'VideoFrame']) {
      delete (globalThis as Record<string, unknown>)[name];
    }
  },
} as const;

async function expectUnsupported(page: Page, lang: keyof typeof TEXT, missing: ('decode' | 'encode' | 'effects')[]) {
  const t = TEXT[lang];
  const screen = page.locator('[data-screen="SCR-Unsupported"]');
  await expect(screen).toBeVisible();
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.title);
  await expect(screen.getByText(t.missing, { exact: true })).toBeVisible();
  await expect(screen.getByRole('listitem')).toHaveText(missing.map((m) => t[m]));
  await expect(screen.getByText(t.hint, { exact: true })).toBeVisible();
  // No media can be added: no Add media control, no file input, no drop target.
  await expect(page.getByRole('button', { name: t.addMedia })).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.locator('[data-action="add-media"]')).toHaveCount(0);
}

test.describe('F-023 SCR-Unsupported (production build)', () => {
  for (const [lang, theme] of [
    ['en-US', 'dark'],
    ['vi-VN', 'light'],
  ] as const) {
    test(`F-023.AC1 a browser that can't decode video shows SCR-Unsupported with COPY-unsupported.missing_decode; no media can be added (${lang}, ${theme})`, async ({
      page,
      baseURL,
    }) => {
      const origin = new URL(baseURL ?? '').origin;
      const w = watch(page, origin);
      await page.addInitScript(DEVICES.noDecoder);
      await page.goto(`/?theme=${theme}&lang=${lang}`);
      await expectUnsupported(page, lang, ['decode']);
      // SCR-Unsupported: the heading is focused on load (standalone).
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
      await expect(page.locator('footer')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(w.workers).toEqual([]);
      expect(w.foreign()).toEqual([]);
      expect(w.errors).toEqual([]);
      await axe(page);
    });
  }

  test('F-023.AC5 a browser that decodes but can encode no video output format lists COPY-unsupported.missing_encode', async ({
    page,
    baseURL,
  }) => {
    const w = watch(page, new URL(baseURL ?? '').origin);
    await page.addInitScript(DEVICES.noVideoEncoder);
    await page.goto('/?lang=en-US');
    await expectUnsupported(page, 'en-US', ['encode']);
    expect(w.workers).toEqual([]);
  });

  test('RULE-22 a device without WebGL2 lists COPY-unsupported.missing_effects', async ({ page }) => {
    await page.addInitScript(DEVICES.noWebgl2);
    await page.goto('/?lang=vi-VN');
    await expectUnsupported(page, 'vi-VN', ['effects']);
  });

  test.describe('the Gecko Android browser', () => {
    test.use({
      userAgent: 'Mozilla/5.0 (Android 15; Mobile; rv:146.0) Gecko/146.0 Firefox/146.0',
      viewport: { width: 390, height: 844 },
    });
    test('RULE-22 a phone browser without the codec interfaces always gets SCR-Unsupported (decode and encode)', async ({
      page,
    }) => {
      await page.addInitScript(DEVICES.geckoAndroid);
      await page.goto('/?lang=en-US');
      await expectUnsupported(page, 'en-US', ['decode', 'encode']);
      await axe(page);
    });
  });

  test('F-023.AC8 a browser that encodes video but no sound format opens the editor without COPY-unsupported.missing_encode', async ({
    page,
  }) => {
    await page.addInitScript(DEVICES.noSoundEncoder);
    await page.goto('/?lang=en-US');
    const editor = page.locator('[data-screen="SCR-Editor"]');
    await expect(editor).toBeVisible();
    await expect(page.locator('[data-screen="SCR-Unsupported"]')).toHaveCount(0);
    await expect(page.getByText(TEXT['en-US'].encode)).toHaveCount(0);
    // The codec part passed: the editor is open and the engine's effects check runs (it can take many
    // seconds with Playwright Chromium's software WebGL under load, so it is not awaited here).
    await expect(editor).toHaveAttribute('data-device', /^(drawing-check|supported)$/);
  });
});

/** Software WebGL (SwiftShader, llvmpipe) is slow by the rule and is not a reference device (ADR-0016). */
async function softwareWebgl(page: Page): Promise<boolean> {
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  });
  test.info().annotations.push({ type: 'renderer', description: renderer || '(not exposed)' });
  return /swiftshader|llvmpipe|software/i.test(renderer);
}

test.describe('F-023 start-up check timing', () => {
  test(
    'F-023.AC4 the check is done within NFR-02 on this device and the network log shows no request',
    {
      tag: '@realtime',
    },
    async ({ page, baseURL }) => {
      const origin = new URL(baseURL ?? '').origin;
      const w = watch(page, origin);
      await page.goto('/');
      test.skip(await softwareWebgl(page), 'software WebGL is not a reference device (ADR-0016)');
      const editor = page.locator('[data-screen="SCR-Editor"]');
      await expect(editor).toHaveAttribute('data-device', 'supported');
      const timing = await page.evaluate(() => {
        const [start] = performance.getEntriesByName('tk-device-check-start');
        const [done] = performance.getEntriesByName('tk-device-checked');
        const during = performance
          .getEntriesByType('resource')
          .filter((e) => start && done && e.startTime >= start.startTime && e.startTime <= done.startTime)
          .map((e) => ({ name: e.name, initiator: (e as PerformanceResourceTiming).initiatorType }));
        return { start: start?.startTime ?? NaN, done: done?.startTime ?? NaN, during };
      });
      test.info().annotations.push({ type: 'device-check', description: JSON.stringify(timing) });
      // NFR-02: usable within 2 s on the reference laptop, from navigation start.
      expect(timing.done).toBeLessThanOrEqual(2000);
      // The check asks no network resource: only the app's own worker and code files load meanwhile.
      expect(timing.during.filter((e) => ['fetch', 'xmlhttprequest', 'beacon'].includes(e.initiator))).toEqual([]);
      expect(timing.during.every((e) => new URL(e.name).origin === origin)).toBe(true);
      await page.waitForLoadState('networkidle');
      expect(w.foreign()).toEqual([]);
    },
  );
});

const addMedia = (page: Page, lang: keyof typeof TEXT) =>
  page.getByRole('main').getByRole('button', { name: TEXT[lang].addMedia });

test.describe('F-023 effects check (app harness)', () => {
  for (const [lang, theme] of [
    ['en-US', 'light'],
    ['vi-VN', 'dark'],
  ] as const) {
    test(`F-023.AC6 effects below the speed threshold open the editor with COPY-notice.slow_device; media can be added (${lang}, ${theme})`, async ({
      page,
    }) => {
      const t = TEXT[lang];
      await page.goto(`${APP_HARNESS}?effects=slow&lang=${lang}&theme=${theme}`);
      const editor = page.locator('[data-screen="SCR-Editor"]');
      await expect(editor).toHaveAttribute('data-device', 'supported');
      const notice = page.locator('[data-notice="slow_device"]');
      await expect(notice).toHaveText(t.slow);
      await expect(page.getByRole('status').filter({ has: notice })).toHaveAttribute('aria-live', 'polite');
      await expect(addMedia(page, lang)).not.toHaveAttribute('aria-disabled', 'true');
      await axe(page);
      // Closing it with focus inside moves focus to Add media, not to the page.
      await notice.getByRole('button', { name: t.close }).focus();
      await page.keyboard.press('Enter');
      await expect(notice).toHaveCount(0);
      await expect(addMedia(page, lang)).toBeFocused();
    });
  }

  test('F-023.R1 RULE-22 while the effect chain has not drawn, media waits and Add media stays usable (build-spec-questions 59)', async ({
    page,
  }) => {
    await page.goto(`${APP_HARNESS}?effects=pending&lang=en-US`);
    const editor = page.locator('[data-screen="SCR-Editor"]');
    await expect(editor).toHaveAttribute('data-device', 'drawing-check');
    // Files picked now are queued until the check lets media in (F-001), so Add media is not
    // announced as unavailable.
    await expect(addMedia(page, 'en-US')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('toolbar').getByRole('button', { name: TEXT['en-US'].addMedia })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.evaluate(() => (window as unknown as AppHarness).appHarness.draw());
    await expect(editor).toHaveAttribute('data-device', 'supported');
  });

  test('RULE-22 an effect chain the device cannot draw turns the opening screen into SCR-Unsupported, with no workers', async ({
    page,
  }) => {
    await page.goto(`${APP_HARNESS}?effects=fail&lang=en-US`);
    await expectUnsupported(page, 'en-US', ['effects']);
    expect(await page.evaluate(() => (window as unknown as AppHarness).appHarness.workers())).toBe(0);
    // The scratch session lock taken at start-up is given back.
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            ((await navigator.locks.query()).held ?? []).filter((l) => l.name?.startsWith('clipmaker-scratch:')).length,
        ),
      )
      .toBe(0);
  });

  test('RULE-22 a device that draws effects fast enough opens the editor without the notice', async ({ page }) => {
    await page.goto(`${APP_HARNESS}?lang=en-US`);
    test.skip(await softwareWebgl(page), 'software WebGL is slow by the rule');
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'supported');
    await expect
      .poll(() => page.evaluate(() => performance.getEntriesByName('tk-effects-timed').length), { timeout: 15_000 })
      .toBe(1);
    await expect(page.locator('[data-notice="slow_device"]')).toHaveCount(0);
  });
});
