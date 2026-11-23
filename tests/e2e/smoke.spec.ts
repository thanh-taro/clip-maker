// E2E smoke for the SCR-Editor empty-state shell (phase 3.3 scaffold, adapters/tests.md), on
// `pnpm preview` of dist/ with the generated headers: the shell renders in en-US and vi-VN with
// COPY-privacy.badge, the theme tokens apply, every worker answers its handshake, no request leaves
// the tool's origin (NFR-01) and a cross-origin fetch is refused by the CSP, and axe finds nothing.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const BADGE = {
  'en-US': 'Your media never leaves this device',
  'vi-VN': 'Tệp của bạn không bao giờ rời khỏi máy này',
} as const;
const EMPTY_TITLE = {
  'en-US': 'Add videos, photos or music to start. They stay on your device.',
  'vi-VN': 'Thêm video, ảnh hoặc nhạc để bắt đầu. Tất cả vẫn nằm trên máy bạn.',
} as const;
const TIMELINE = { 'en-US': 'Timeline', 'vi-VN': 'Dòng thời gian' } as const;
const EDITOR = { 'en-US': 'Editor', 'vi-VN': 'Trình chỉnh sửa' } as const;

/** Records every request and console error; any request to another origin is aborted (never sent). */
function watch(page: Page, origin: string) {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  void page.route(
    (url) => url.origin !== origin && url.protocol !== 'data:',
    (route) => route.abort(),
  );
  return { requests, errors };
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

for (const [lang, theme] of [
  ['en-US', 'dark'],
  ['vi-VN', 'light'],
] as const) {
  test(`smoke: SCR-Editor empty shell shows COPY-privacy.badge in ${lang} (${theme})`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? '').origin;
    const { requests, errors } = watch(page, origin);

    await page.goto(`/?theme=${theme}&lang=${lang}`);
    const editor = page.locator('[data-screen="SCR-Editor"]');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('data-state', 'empty');
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page).toHaveTitle('Clip Maker');

    // Regions in reading order: toolbar, preview (empty state), timeline, status bar.
    await expect(page.getByRole('toolbar', { name: EDITOR[lang] })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(EMPTY_TITLE[lang]);
    await expect(page.getByRole('region', { name: TIMELINE[lang] })).toBeAttached();
    await expect(page.locator('footer').getByText(BADGE[lang], { exact: true })).toBeVisible();

    // Tokens applied: the work area uses the theme's workArea colour (tokens.json).
    const workArea = await page.locator('.tk-preview-area').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(workArea).toBe(theme === 'dark' ? 'rgb(11, 8, 18)' : 'rgb(236, 232, 244)');

    // Every dedicated worker of ADR-0003 loaded under the CSP and answered the handshake.
    await expect(editor).toHaveAttribute('data-workers', '5');
    await page.waitForLoadState('networkidle');

    expect(requests.filter((u) => new URL(u).origin !== origin && !u.startsWith('data:'))).toEqual([]);
    expect(errors).toEqual([]);
    await axe(page);
  });
}

test('NFR-01 the CSP refuses a fetch to another origin; the tool requests only its own files', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? '').origin;
  const { requests } = watch(page, origin);
  await page.goto('/');
  await expect(page.locator('[data-screen="SCR-Editor"]')).toBeVisible();
  const csp = (await page.request.get('/')).headers()['content-security-policy'] ?? '';
  expect(csp).toContain("connect-src 'self'");

  const refused = await page.evaluate(async () => {
    const violation = new Promise<string>((resolve) =>
      document.addEventListener('securitypolicyviolation', (e) => resolve(e.effectiveDirective), { once: true }),
    );
    try {
      // The deliberate probe of ADR-0014: the page CSP must refuse it before any request is made.
      await fetch('https://example.com/');
      return 'fetched';
    } catch {
      return await violation;
    }
  });
  expect(refused).toBe('connect-src');
  await page.waitForLoadState('networkidle');
  expect(requests.filter((u) => new URL(u).origin !== origin)).toEqual([]);
});

test('NFR-09 QA-3 Trusted Types: the workers start through the tool’s policy; an HTML sink, another policy or a data: worker is refused', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const editor = page.locator('[data-screen="SCR-Editor"]');
  await expect(editor).toBeVisible();
  // Every dedicated worker was created from a trusted script URL and answered its handshake.
  await expect(editor).toHaveAttribute('data-workers', '5');
  const csp = (await page.request.get('/')).headers()['content-security-policy'] ?? '';
  expect(csp).toContain("require-trusted-types-for 'script'");
  expect(csp).toContain('trusted-types clip-maker');
  const probe = await page.evaluate(() => {
    const out: Record<string, string> = {};
    const tt = (window as unknown as { trustedTypes?: { createPolicy(n: string, r: object): unknown } }).trustedTypes;
    out['supported'] = tt ? 'yes' : 'no';
    const attempt = (name: string, fn: () => void) => {
      try {
        fn();
        out[name] = 'allowed';
      } catch (e) {
        out[name] = (e as Error).name;
      }
    };
    attempt('innerHTML', () => {
      document.createElement('div').innerHTML = '<b>x</b>';
    });
    attempt('policy', () => tt?.createPolicy('another', { createHTML: (s: string) => s }));
    attempt('worker', () => new Worker('data:text/javascript,0'));
    return out;
  });
  // The audio worklet module (a plain string URL; Worklet.addModule is not a Trusted Types sink) loads.
  const worklet = await page.evaluate(async () => {
    const href = (document.querySelector('link[rel="modulepreload"][href*="playback.worklet"]') as HTMLLinkElement)
      .href;
    const ctx = new AudioContext();
    try {
      await ctx.audioWorklet.addModule(href);
      return 'loaded';
    } catch (e) {
      return `${(e as Error).name}: ${(e as Error).message}`;
    } finally {
      void ctx.close();
    }
  });
  expect(worklet).toBe('loaded');
  if (probe['supported'] === 'yes') {
    expect(probe).toEqual({ supported: 'yes', innerHTML: 'TypeError', policy: 'TypeError', worker: 'TypeError' });
  }
  expect(errors).toEqual([]);
});
