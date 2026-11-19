// F-022 Use the portal's language (RULE-18, MOD-Copy, MOD-Host): the language from the address, the
// browser, or later host messages; the page marked with it; no English shown first; a live switch that
// keeps everything; Vietnamese at 320 px; Vietnamese diacritics drawn with the bundled typefaces.
// Standalone on `pnpm preview` of dist/; embedded on the multi-origin host harness (F-019).
// Not covered yet (need later features):
// AC6 for panels that don't exist yet (pickers: re-run as they land). AC8's running export and text being
// edited run embedded below (F-015, F-010). The unit side is tests/unit/copy.*.
import { expect, test, type Frame, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language, type MessageId } from '../../src/copy/messages.gen';
import { HOST_ALLOWED, TOOL_ALLOWED, hostPageUrl } from './support/host-urls';

const SHELL = '[data-screen="SCR-Editor"]';
const text = (lang: Language, id: MessageId): string => CATALOG[lang][id] as string;

/** Plain catalog texts that differ between the languages: seeing one proves which language shows. */
function onlyIn(lang: Language): Set<string> {
  const other: Language = lang === 'en-US' ? 'vi-VN' : 'en-US';
  const out = new Set<string>();
  for (const id of Object.keys(CATALOG[lang]) as MessageId[]) {
    const mine = CATALOG[lang][id];
    const theirs = CATALOG[other][id];
    if (typeof mine !== 'string' || mine === theirs || /\{/.test(mine)) continue;
    out.add(mine.trim());
  }
  return out;
}

type Recorder = Window & { __texts: string[] };

/**
 * Records every text the page ever shows or announces (text nodes, labels, titles), from before the
 * first script runs, so a string shown for a moment and replaced is still caught.
 */
async function recordTexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen = new Set<string>();
    (window as unknown as Recorder).__texts = [];
    const add = (s: string | null | undefined) => {
      const v = s?.trim();
      if (!v || seen.has(v)) return;
      seen.add(v);
      (window as unknown as Recorder).__texts.push(v);
    };
    const scan = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.parentElement?.closest('script, style')) return;
        add(node.textContent);
      } else if (node instanceof Element) {
        for (const a of ['aria-label', 'title', 'alt', 'placeholder']) add(node.getAttribute(a));
        node.childNodes.forEach(scan);
      }
    };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'childList') r.addedNodes.forEach(scan);
        else if (r.type === 'characterData') add(r.target.textContent);
        else if (r.target instanceof Element && r.attributeName) add(r.target.getAttribute(r.attributeName));
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'alt', 'placeholder'],
    });
  });
}

/** Overrides the browser's preferred languages before any page script (RULE-18's browser step). */
async function preferLanguages(page: Page, languages: readonly string[]): Promise<void> {
  await page.addInitScript((langs) => {
    Object.defineProperty(Navigator.prototype, 'languages', { get: () => langs, configurable: true });
    Object.defineProperty(Navigator.prototype, 'language', { get: () => langs[0], configurable: true });
  }, languages);
}

const badge = (root: Page | Frame, lang: Language) =>
  root.locator('footer').getByRole('button', { name: text(lang, 'privacy.badge') });

test.describe('standalone', () => {
  test('F-022.AC1 with vi-VN in the address every string is vi-VN from first display, never English first', async ({
    page,
  }) => {
    await preferLanguages(page, ['en-US']);
    await recordTexts(page);
    await page.goto('/?lang=vi-VN');
    await expect(page.locator(SHELL)).toBeVisible();
    await expect(badge(page, 'vi-VN')).toBeVisible();
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'vi-VN');
    await expect(html).toHaveAttribute('dir', 'ltr');
    expect(await page.title()).toBe('Clip Maker');

    // Open the privacy details and the notices too, so their strings are recorded.
    await badge(page, 'vi-VN').click();
    await page.getByRole('button', { name: text('vi-VN', 'privacy.notices') }).click();
    await expect(page.getByRole('dialog', { name: text('vi-VN', 'privacy.notices_title') })).toBeVisible();

    const texts = await page.evaluate(() => (window as unknown as Recorder).__texts);
    const english = onlyIn('en-US');
    expect(texts.filter((s) => english.has(s))).toEqual([]);
    const vietnamese = onlyIn('vi-VN');
    for (const id of ['empty.title', 'action.add_media', 'privacy.badge', 'privacy.details'] as const)
      expect(vietnamese.has(text('vi-VN', id)) && texts.includes(text('vi-VN', id))).toBe(true);
  });

  test('F-022.AC3 with no language and browser preferences [fr-FR, vi] it opens in vi-VN', async ({ page }) => {
    await preferLanguages(page, ['fr-FR', 'vi']);
    await page.goto('/');
    await expect(badge(page, 'vi-VN')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi-VN');
  });

  test('F-022.R3 the language is chosen per RULE-18: address, then browser, then en-US', async ({ page }) => {
    await preferLanguages(page, ['vi-VN']);
    // Edge cases: `vi-vn` → vi-VN; `en-GB` → en-US (the address wins over the browser).
    await page.goto('/?lang=vi-vn');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi-VN');
    await page.goto('/?lang=en-GB');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(badge(page, 'en-US')).toBeVisible();
    // An unsupported address value falls through to the browser preference.
    await page.goto('/?lang=fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi-VN');

    const other = await page.context().newPage();
    await preferLanguages(other, ['fr-FR', 'de']);
    await other.goto('/');
    await expect(other.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(badge(other, 'en-US')).toBeVisible();
    await other.close();
  });

  test('F-022.AC6 in vi-VN at 320 px every shown panel fits: no clipped label, no horizontal scrolling', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/?lang=vi-VN');
    await expect(page.locator(SHELL)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    /** Elements whose own text overflows their box, or that stick out of the viewport. */
    const clipped = () =>
      page.evaluate(() => {
        const out: string[] = [];
        const vw = document.documentElement.clientWidth;
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
          const own = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
          if (!own || !el.getClientRects().length) continue;
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden') continue;
          // Visually hidden on purpose (the accessible name of an icon-only control).
          const box = el.getBoundingClientRect();
          if (box.width <= 1 && box.height <= 1 && style.clipPath !== 'none') continue;
          const name = `${el.tagName.toLowerCase()}.${el.className} "${el.textContent?.trim().slice(0, 30)}"`;
          if (style.display !== 'inline' && el.scrollWidth > el.clientWidth + 1) out.push(`overflows: ${name}`);
          const r = el.getBoundingClientRect();
          if (r.left < -0.5 || r.right > vw + 0.5) out.push(`outside the viewport: ${name}`);
        }
        return out;
      });
    const scrolls = () =>
      page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

    expect(await clipped()).toEqual([]);
    expect(await scrolls()).toBe(false);

    await badge(page, 'vi-VN').click();
    await expect(page.getByRole('dialog', { name: text('vi-VN', 'privacy.badge') })).toBeVisible();
    expect(await clipped()).toEqual([]);
    expect(await scrolls()).toBe(false);

    await page.getByRole('button', { name: text('vi-VN', 'privacy.notices') }).click();
    await expect(page.getByRole('dialog', { name: text('vi-VN', 'privacy.notices_title') })).toBeVisible();
    expect(await clipped()).toEqual([]);
    expect(await scrolls()).toBe(false);
  });

  test('F-022.R1 Vietnamese diacritics are drawn with the bundled typefaces', async ({ page }) => {
    await page.goto('/?lang=vi-VN');
    await expect(badge(page, 'vi-VN')).toBeVisible();
    await page.waitForFunction(() => document.readyState === 'complete');
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      const sample = 'Tệp của bạn không bao giờ rời khỏi máy này. Thêm chữ, Huỷ, Đặt lại, Ưu';
      const faces = Array.from(document.fonts as unknown as Iterable<FontFace>);
      // The faces whose range covers Vietnamese letters (ơ U+01A1, ư U+01B0, ệ U+1EC7).
      const vietnamese = faces.filter((f) => /U\+1EA0-1EF9|U\+01AF-01B0/i.test(f.unicodeRange));
      const body = getComputedStyle(document.body).fontFamily;
      return {
        body,
        families: [...new Set(vietnamese.map((f) => f.family.replace(/["']/g, '')))].sort(),
        unloaded: vietnamese.filter((f) => f.status !== 'loaded').map((f) => `${f.family} ${f.status}`),
        manrope: document.fonts.check('16px Manrope', sample),
        mono: document.fonts.check('16px "JetBrains Mono"', sample),
      };
    });
    expect(fonts.body.replace(/["']/g, '').split(',')[0]?.trim()).toBe('Manrope');
    expect(fonts.families).toEqual(['Anton', 'JetBrains Mono', 'Manrope', 'Nunito', 'Playfair Display']);
    expect(fonts.unloaded).toEqual([]);
    expect(fonts.manrope).toBe(true);
    expect(fonts.mono).toBe(true);
  });
});

test.describe('embedded', () => {
  type HostWindow = Window & { __sendLanguage: (v: unknown) => void; __received: { data: unknown }[] };
  const sendLanguage = (page: Page, v: unknown) =>
    page.evaluate((value) => (window as unknown as HostWindow).__sendLanguage(value), v);

  async function toolFrame(page: Page): Promise<Frame> {
    await expect(page.frameLocator('#tool').locator(SHELL)).toBeVisible();
    const frame = page.frames().find((f) => f.url().startsWith(TOOL_ALLOWED));
    if (!frame) throw new Error('tool frame not found');
    return frame;
  }

  test('F-022.AC1 embedded with vi-VN from the host, every string is vi-VN from first display', async ({ page }) => {
    await preferLanguages(page, ['en-US']);
    await recordTexts(page);
    await page.goto(hostPageUrl(HOST_ALLOWED, TOOL_ALLOWED, { theme: 'dark', lang: 'vi-VN' }));
    const frame = await toolFrame(page);
    await expect(badge(frame, 'vi-VN')).toBeVisible();
    await expect(frame.locator('html')).toHaveAttribute('lang', 'vi-VN');
    const texts = await frame.evaluate(() => (window as unknown as Recorder).__texts);
    const english = onlyIn('en-US');
    expect(texts.filter((s) => english.has(s))).toEqual([]);
  });

  test('F-022.R2 host language messages switch the tool live, keeping the session, an open dialog and focus', async ({
    page,
  }) => {
    await page.goto(hostPageUrl(HOST_ALLOWED, TOOL_ALLOWED, { theme: 'dark', lang: 'vi-VN' }));
    const frame = await toolFrame(page);
    const editor = frame.locator(SHELL);
    await expect(editor).toHaveAttribute('data-workers', '5');
    await frame.evaluate(() => ((window as unknown as { __mark: number }).__mark = 42));

    // An open dialog with focus inside it.
    await badge(frame, 'vi-VN').click();
    const details = frame.locator('.tk-privacy-details');
    await expect(details).toBeVisible();
    await expect(details).toBeFocused();
    await expect(details).toContainText(text('vi-VN', 'privacy.details'));

    await sendLanguage(page, 'en-US');
    const html = frame.locator('html');
    await expect(html).toHaveAttribute('lang', 'en-US');
    await expect(html).toHaveAttribute('dir', 'ltr');
    await expect(details).toContainText(text('en-US', 'privacy.details'));
    await expect(frame.getByRole('button', { name: text('en-US', 'action.add_media') }).first()).toBeVisible();
    await expect(details).toBeFocused();
    await expect(badge(frame, 'en-US')).toHaveAttribute('aria-expanded', 'true');

    // An unsupported value is ignored; `vi` matches vi-VN (RULE-18).
    await sendLanguage(page, 'fr-FR');
    await sendLanguage(page, 'vi');
    await expect(html).toHaveAttribute('lang', 'vi-VN');
    await expect(details).toContainText(text('vi-VN', 'privacy.details'));
    await expect(details).toBeFocused();

    // Nothing reloaded: same window, workers still running, the details still open.
    expect(await frame.evaluate(() => (window as unknown as { __mark?: number }).__mark)).toBe(42);
    await expect(editor).toHaveAttribute('data-workers', '5');
    await expect(details).toBeVisible();
    // The only message to the host is still the single ready signal (INV-08).
    const received = await page.evaluate(() => (window as unknown as HostWindow).__received.map((m) => m.data));
    expect(received).toEqual([{ type: 'taro:ready' }]);
  });

  test('F-022.AC2 an edited project in vi-VN keeps its clips and its playback running when the host sends en-US', async ({
    page,
  }) => {
    await page.goto(hostPageUrl(HOST_ALLOWED, TOOL_ALLOWED, { theme: 'dark', lang: 'vi-VN' }));
    const frame = await toolFrame(page);
    await expect(frame.locator(SHELL)).toHaveAttribute('data-device', 'supported');
    const clip = readFileSync(fileURLToPath(new URL('../fixtures/media/mp4-faststart.mp4', import.meta.url)));
    const chooser = page.waitForEvent('filechooser');
    await frame
      .getByRole('main')
      .getByRole('button', { name: text('vi-VN', 'action.add_media') })
      .click();
    await (
      await chooser
    ).setFiles(['a.mp4', 'b.mp4', 'c.mp4'].map((name) => ({ name, mimeType: 'video/mp4', buffer: clip })));
    const transport = frame.locator('.tk-transport');
    await expect(transport).toContainText('/ 0:06');
    await transport.getByRole('button', { name: text('vi-VN', 'action.play'), exact: true }).click();
    await expect(transport.getByRole('button', { name: text('vi-VN', 'action.pause'), exact: true })).toBeVisible();
    await expect(frame.locator(SHELL)).toHaveAttribute('data-state', 'playing');

    await sendLanguage(page, 'en-US');
    await expect(frame.locator('html')).toHaveAttribute('lang', 'en-US');
    // Playback runs on (now labelled in English), the project keeps its three clips and its length.
    await expect(transport.getByRole('button', { name: text('en-US', 'action.pause'), exact: true })).toBeVisible();
    await expect(frame.locator(SHELL)).toHaveAttribute('data-state', 'playing');
    await expect(transport).toContainText('/ 0:06');
    for (const name of ['a.mp4', 'b.mp4', 'c.mp4'])
      await expect(frame.getByRole('complementary').getByRole('listitem').filter({ hasText: name })).toBeVisible();
    await transport.getByRole('button', { name: text('en-US', 'action.pause'), exact: true }).click();
  });

  test('F-022.AC2 F-014.R1 an edited project in vi-VN keeps its history when the host sends en-US: Undo and Redo go on', async ({
    page,
  }) => {
    await page.goto(hostPageUrl(HOST_ALLOWED, TOOL_ALLOWED, { theme: 'dark', lang: 'vi-VN' }));
    const frame = await toolFrame(page);
    await expect(frame.locator(SHELL)).toHaveAttribute('data-device', 'supported');
    const clip = readFileSync(fileURLToPath(new URL('../fixtures/media/mp4-faststart.mp4', import.meta.url)));
    const chooser = page.waitForEvent('filechooser');
    await frame
      .getByRole('main')
      .getByRole('button', { name: text('vi-VN', 'action.add_media') })
      .click();
    await (await chooser).setFiles(['a.mp4', 'b.mp4'].map((name) => ({ name, mimeType: 'video/mp4', buffer: clip })));
    const clips = frame.locator('.tk-timeline .tk-clip');
    await expect(clips).toHaveCount(2);
    // Two steps in vi-VN: the batch, then deleting b.mp4 with the timeline's Delete.
    const media = frame.locator('.tk-media');
    await media.getByRole('button', { name: text('vi-VN', 'action.close') }).click();
    await clips.nth(1).click();
    await frame
      .locator('.tk-tl-toolbar')
      .getByRole('button', { name: text('vi-VN', 'action.delete') })
      .click();
    await expect(clips).toHaveCount(1);

    await sendLanguage(page, 'en-US');
    await expect(frame.locator('html')).toHaveAttribute('lang', 'en-US');
    const bar = frame.getByRole('toolbar', { name: text('en-US', 'toolbar.label') });
    const undo = bar.getByRole('button', { name: text('en-US', 'action.undo'), exact: true });
    const redo = bar.getByRole('button', { name: text('en-US', 'action.redo'), exact: true });
    // Both steps made before the switch are still there.
    await undo.click();
    await expect(clips).toHaveCount(2);
    await undo.click();
    await expect(clips).toHaveCount(0);
    await expect(undo).toHaveAttribute('aria-disabled', 'true');
    await redo.click();
    await redo.click();
    await expect(clips).toHaveCount(1);
    await expect(redo).toHaveAttribute('aria-disabled', 'true');
  });

  test('F-022.AC8 a running export continues when the host switches language; only its progress text changes; a text being edited keeps its state', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto(hostPageUrl(HOST_ALLOWED, TOOL_ALLOWED, { theme: 'dark', lang: 'vi-VN' }));
    const frame = await toolFrame(page);
    await expect(frame.locator(SHELL)).toHaveAttribute('data-device', 'supported');
    const clip = readFileSync(fileURLToPath(new URL('../fixtures/media/mp4-faststart.mp4', import.meta.url)));
    const chooser = page.waitForEvent('filechooser');
    await frame
      .getByRole('main')
      .getByRole('button', { name: text('vi-VN', 'action.add_media') })
      .click();
    const names = Array.from({ length: 12 }, (_, i) => `c${i}.mp4`);
    await (await chooser).setFiles(names.map((name) => ({ name, mimeType: 'video/mp4', buffer: clip })));
    await expect(frame.locator('.tk-timeline .tk-clip')).toHaveCount(names.length, { timeout: 30_000 });
    const bar = frame.getByRole('toolbar', { name: text('vi-VN', 'toolbar.label') });
    await bar.getByRole('button', { name: text('vi-VN', 'action.export'), exact: true }).click();
    const panel = frame.locator('.tk-export');
    await panel.getByRole('radio', { name: text('vi-VN', 'export.q_best') }).check({ force: true });
    const download = page.waitForEvent('download', { timeout: 150_000 });
    await panel.getByRole('button', { name: text('vi-VN', 'action.export'), exact: true }).click();
    const dialog = frame.locator('dialog.tk-run');
    await expect(dialog).toHaveAttribute('data-phase', 'running');
    const line = dialog.locator('.tk-run__text');
    await expect(line).toHaveText(/^Đang xuất… /);
    const cancel = dialog.getByRole('button', { name: text('vi-VN', 'action.cancel') });
    await expect(cancel).toBeFocused();

    await sendLanguage(page, 'en-US');
    await expect(frame.locator('html')).toHaveAttribute('lang', 'en-US');
    // Only the texts change: the same run goes on (still running or already done), focus stays on Cancel.
    await expect(line).toHaveText(/^(Exporting… |Saved clip-)/);
    if ((await dialog.getAttribute('data-phase')) === 'running')
      await expect(dialog.getByRole('button', { name: text('en-US', 'action.cancel') })).toBeFocused();
    const saved = await download;
    await expect(dialog).toHaveAttribute('data-phase', 'done');
    await expect(dialog.getByRole('status')).toHaveText(`Saved ${saved.suggestedFilename()}`);
    await expect(frame.locator('.tk-timeline .tk-clip')).toHaveCount(names.length);
    await dialog.getByRole('button', { name: text('en-US', 'action.close') }).click();

    // A text being edited keeps its state across a switch (F-022.R2): the editor stays open with what was typed.
    await frame
      .getByRole('toolbar', { name: text('en-US', 'toolbar.label') })
      .getByRole('button', { name: text('en-US', 'action.add_text'), exact: true })
      .click();
    const field = frame.getByRole('textbox', { name: text('en-US', 'text.field') });
    await expect(field).toBeFocused();
    await page.keyboard.type('Đà Lạt');
    await sendLanguage(page, 'vi-VN');
    await expect(frame.locator('html')).toHaveAttribute('lang', 'vi-VN');
    const fieldVi = frame.getByRole('textbox', { name: text('vi-VN', 'text.field') });
    await expect(fieldVi).toBeFocused();
    await expect(fieldVi).toHaveValue('Đà Lạt');
  });
});
