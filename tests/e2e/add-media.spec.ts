// F-001 adding media through the real UI (MOD-App + MOD-Media's analysis worker, real decoders):
// - on the app harness (tests/harness/app.html: the real `main()` under the dev server), which also
//   reads the session's project (the timeline view is F-003) and takes an undo step (the Undo button is
//   F-014), and can hold probe requests (?gate=N) so a file stays "being checked";
// - on the production build (`pnpm preview` of dist/ with the real CSP) for the request log (NFR-01).
// Drops and pastes are dispatched with a real DataTransfer holding real files (a test cannot reach the
// OS clipboard or drag from the desktop).
// F-001's ninth acceptance criterion (a 3.5 GB 4K video on the reference phone within NFR-05) has no
// automated test: it is a manual QA check on the device with the large fixture kept outside git (ADR-0016 §5;
// "Manual device checks (QA)" in .build-my-app/reports/build-spec-questions.md, Q75). Its ID is not written
// here, so `spec_lint --coverage` keeps listing it.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type Language } from '../../src/copy/messages.gen';
import type { ProjectSummary } from '../harness/app';
import { MEDIA_HARNESS_PORT } from './support/ports';

const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const text = (lang: Language, id: keyof (typeof CATALOG)['en-US']): string => CATALOG[lang][id] as string;

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}
const fx = (name: string, as = name): Payload => ({
  name: as,
  mimeType: 'application/octet-stream',
  buffer: readFileSync(fileURLToPath(new URL(`../fixtures/media/${name}`, import.meta.url))),
});
const bytes = (...parts: (string | number[])[]) =>
  Buffer.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const HEIC: Payload = {
  name: 'IMG_0001.HEIC',
  mimeType: 'image/heic',
  buffer: bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0], 'mif1heic'),
};
const PDF_AS_MP4: Payload = {
  name: 'notes.mp4',
  mimeType: 'video/mp4',
  buffer: bytes('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'),
};
const VIDEO = (as = 'phone.mp4') => fx('mp4-faststart.mp4', as);
const PNG: Payload = {
  name: 'dot.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
};

interface Harness {
  appHarness: {
    project(): ProjectSummary;
    undo(): void;
    setPlayhead(s: number): void;
    release(): void;
    draw(): void;
    queued(): number;
  };
}
const projectOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).appHarness.project());

async function open(page: Page, query = 'effects=fast&lang=en-US'): Promise<void> {
  await page.goto(`${APP}?${query}`);
  await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', /supported|drawing-check/);
}

/** Picks files through Add media and the system file picker. */
async function pick(page: Page, files: Payload[], from: 'empty' | 'toolbar' = 'empty'): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  const button =
    from === 'empty'
      ? page.getByRole('main').getByRole('button', { name: text('en-US', 'action.add_media') })
      : page.getByRole('toolbar').getByRole('button', { name: text('en-US', 'action.add_media') });
  await button.click();
  await (await chooser).setFiles(files);
}

/** Dispatches a drag of these files over the tool and drops them (DataTransfer with real File objects). */
async function drop(page: Page, files: Payload[], { release = true } = {}): Promise<void> {
  const data = files.map((f) => ({ name: f.name, type: f.mimeType, bytes: [...f.buffer] }));
  await page.evaluate(
    ({ data, release }) => {
      const dt = new DataTransfer();
      for (const f of data) dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.type }));
      const target = document.querySelector('.tk-preview-area')!;
      const fire = (type: string) =>
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      fire('dragenter');
      fire('dragover');
      if (release) fire('drop');
    },
    { data, release },
  );
}

/**
 * Dispatches a `paste` whose clipboard holds these files, or only text and a link. True when the tool
 * took it (the event's default was prevented).
 */
async function paste(page: Page, files: Payload[], strings: Record<string, string> = {}): Promise<boolean> {
  const data = files.map((f) => ({ name: f.name, type: f.mimeType, bytes: [...f.buffer] }));
  return page.evaluate(
    ({ data, strings }) => {
      const dt = new DataTransfer();
      for (const f of data) dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.type }));
      for (const [type, value] of Object.entries(strings)) dt.setData(type, value);
      const e = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(e, 'clipboardData', { value: dt });
      return !(document.activeElement ?? document.body).dispatchEvent(e);
    },
    { data, strings },
  );
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

const panel = (page: Page) => page.getByRole('complementary', { name: text('en-US', 'media.title') });
const notice = (page: Page, tag: string) => page.locator(`[data-notice="${tag}"]`);
/**
 * WebKit reports the page's own reads of a picked file (`blob:` URLs of the tool's origin) as requests;
 * they never leave the device, so on WebKit the network log leaves exactly those out.
 */
const network = (url: string, browserName: string, origin: string) =>
  !(browserName === 'webkit' && url.startsWith(`blob:${origin}/`));
const MP3 = () => fx('silent-1s.mp3', 'song.mp3');

test.describe('F-001 add media (app harness)', () => {
  test('F-001.AC1 a picked phone video appears in the media panel and is the only clip on the main track, at 0', async ({
    page,
  }) => {
    await open(page);
    await pick(page, [VIDEO()]);
    const row = panel(page).getByRole('listitem').filter({ hasText: 'phone.mp4' });
    await expect(row).toBeVisible();
    await expect(row).toContainText(`${text('en-US', 'media.kind_video')} · 0:02`);
    await expect(notice(page, 'added')).toHaveText('Added 1 file');
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-state', 'default');
    expect(await projectOf(page)).toMatchObject({
      sources: [{ name: 'phone.mp4', kind: 'video' }],
      clips: [{ source: 'phone.mp4', start: 0 }],
      steps: 1,
    });
    await axe(page);
  });

  test('F-001.AC2 two videos, a photo and an MP3 dropped at once: in order on the main track, the MP3 on the audio track at the playhead', async ({
    page,
  }) => {
    await open(page);
    await drop(page, [VIDEO('first.mp4')]);
    await expect.poll(async () => (await projectOf(page)).clips.length).toBe(1);
    await page.evaluate(() => (window as unknown as Harness).appHarness.setPlayhead(1));
    await drop(page, [VIDEO('a.mp4'), fx('mp4-rot90.mp4', 'b.mp4'), PNG, MP3()]);
    await expect.poll(async () => (await projectOf(page)).clips.length).toBe(4);
    const p = await projectOf(page);
    expect(p.clips.map((c) => c.source)).toEqual(['first.mp4', 'a.mp4', 'b.mp4', 'dot.png']);
    expect(p.audio).toEqual([expect.objectContaining({ source: 'song.mp3', start: 1 })]);
    expect(p.steps).toBe(2);
  });

  test('F-001.AC3 a HEIC photo and a PDF renamed .mp4 are named in COPY-error.refused_list; the valid video is added', async ({
    page,
  }) => {
    await open(page);
    await pick(page, [HEIC, PDF_AS_MP4, VIDEO()]);
    const error = notice(page, 'refused_list');
    await expect(error).toBeVisible();
    await expect(error.locator('.tk-notice__title')).toHaveText("Couldn't add:");
    await expect(error.getByRole('listitem')).toHaveText([
      `IMG_0001.HEIC: ${text('en-US', 'reason.unsupported')}`,
      `notes.mp4: ${text('en-US', 'reason.unsupported')}`,
    ]);
    await expect(page.getByRole('alert')).toContainText('IMG_0001.HEIC');
    // The media panel lists the refused files until dismissed.
    const refused = panel(page).getByRole('region', { name: text('en-US', 'media.refused') });
    await expect(refused.getByRole('listitem')).toHaveCount(2);
    await refused
      .getByRole('button', { name: text('en-US', 'action.dismiss') })
      .first()
      .click();
    await expect(refused.getByRole('listitem')).toHaveCount(1);
    expect((await projectOf(page)).sources.map((s) => s.name)).toEqual(['phone.mp4']);
    await axe(page);
  });

  test('F-001.AC6 F-001.AC14 from the media panel a source is placed again, then removed with both clips; one undo restores both', async ({
    page,
  }) => {
    await open(page);
    await pick(page, [VIDEO('a.mp4'), fx('mp4-rot90.mp4', 'b.mp4')]);
    const rowA = panel(page).getByRole('listitem').filter({ hasText: 'a.mp4' });
    await rowA.getByRole('button', { name: text('en-US', 'media.place_again') }).click();
    let p = await projectOf(page);
    expect(p.clips.map((c) => c.source)).toEqual(['a.mp4', 'b.mp4', 'a.mp4']);
    expect(p.steps).toBe(2);
    await expect(rowA.getByRole('button', { name: text('en-US', 'media.place_again') })).toHaveAccessibleDescription(
      'a.mp4',
    );
    await rowA.getByRole('button', { name: text('en-US', 'action.delete') }).click();
    p = await projectOf(page);
    expect(p.sources.map((s) => s.name)).toEqual(['b.mp4']);
    expect(p.clips).toEqual([{ source: 'b.mp4', start: 0 }]);
    await page.evaluate(() => (window as unknown as Harness).appHarness.undo());
    p = await projectOf(page);
    expect(p.clips.map((c) => c.source)).toEqual(['a.mp4', 'b.mp4', 'a.mp4']);
    await expect(panel(page).getByRole('listitem').filter({ hasText: 'a.mp4' })).toBeVisible();
  });

  test('F-001.AC8 while the second of five files is checked progress shows and the editor stays usable; cancel keeps the first; one undo removes it', async ({
    page,
  }) => {
    await open(page, 'effects=fast&lang=en-US&gate=1');
    const five = ['1.mp4', '2.mp4', '3.mp4', '4.mp4', '5.mp4'].map((n) => VIDEO(n));
    await pick(page, five);
    const progress = notice(page, 'adding');
    await expect(progress).toContainText('Adding 2 of 5…');
    await expect(progress).toContainText('Checking 2.mp4…');
    await expect(page.getByRole('status').filter({ has: progress })).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-state', 'adding');
    const checking = panel(page).locator('[data-checking]');
    await expect(checking).toContainText('2 of 5');
    // The editor stays usable while checking: the status bar's privacy details open and close.
    await page
      .locator('footer')
      .getByRole('button', { name: text('en-US', 'privacy.badge') })
      .click();
    await expect(page.getByRole('dialog').or(page.locator('.tk-privacy-details'))).toBeVisible();
    await page.keyboard.press('Escape');
    await progress.getByRole('button', { name: text('en-US', 'action.cancel') }).click();
    await expect(progress).toHaveCount(0);
    await page.evaluate(() => (window as unknown as Harness).appHarness.release());
    expect(await projectOf(page)).toMatchObject({ sources: [{ name: '1.mp4' }], steps: 1 });
    await page.evaluate(() => (window as unknown as Harness).appHarness.undo());
    expect(await projectOf(page)).toMatchObject({ sources: [], clips: [], steps: 0 });
  });

  test('F-001.AC10 a pasted video file is added; a clipboard with only text or a link adds and fetches nothing', async ({
    page,
    browserName,
  }) => {
    const origin = `http://localhost:${MEDIA_HARNESS_PORT}`;
    const requests: string[] = [];
    await open(page);
    page.on('request', (r) => {
      if (network(r.url(), browserName, origin)) requests.push(r.url());
    });
    // The text-and-link paste is left to the page (not taken by the tool) …
    const taken = await paste(page, [], {
      'text/plain': 'https://example.com/clip.mp4',
      'text/uri-list': 'https://example.com/clip.mp4',
    });
    expect(taken).toBe(false);
    // … and batches run in order, so once the file pasted after it is in, nothing else came before it.
    expect(await paste(page, [VIDEO('copied.mp4')])).toBe(true);
    await expect.poll(async () => (await projectOf(page)).sources.map((s) => s.name)).toEqual(['copied.mp4']);
    expect((await projectOf(page)).steps).toBe(1);
    expect(requests.filter((u) => !u.startsWith(`${origin}/`))).toEqual([]);
  });

  test('F-001.AC11 an audio file in an empty project goes on the audio track from 0; Export stays unavailable with COPY-notice.needs_clip', async ({
    page,
  }) => {
    await open(page);
    await expect(notice(page, 'needs_clip').first()).toHaveText(text('en-US', 'notice.needs_clip'));
    await pick(page, [MP3()]);
    await expect.poll(async () => (await projectOf(page)).audio.length).toBe(1);
    const p = await projectOf(page);
    expect(p.clips).toEqual([]);
    expect(p.audio[0]).toMatchObject({ source: 'song.mp3', start: 0 });
    expect(p.audio[0]!.end).toBeGreaterThan(1);
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-state', 'default');
    await expect(page.getByRole('button', { name: text('en-US', 'action.export') })).toBeDisabled();
    await expect(notice(page, 'needs_clip').first()).toBeVisible();
  });

  test('CMP-DropOverlay files dragged over the tool show COPY-drop.hint; Esc hides it; dropping adds the files', async ({
    page,
  }) => {
    await open(page);
    await drop(page, [VIDEO('dragged.mp4')], { release: false });
    const overlay = page.locator('.tk-drop');
    await expect(overlay).toContainText(text('en-US', 'drop.hint'));
    await expect(overlay).toContainText(text('en-US', 'drop.kinds'));
    await expect(overlay).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-state', 'dragging-file');
    await page.keyboard.press('Escape');
    await expect(overlay).not.toContainText(text('en-US', 'drop.hint'));
    await drop(page, [VIDEO('dragged.mp4')]);
    await expect.poll(async () => (await projectOf(page)).sources.map((s) => s.name)).toEqual(['dragged.mp4']);
    await expect(overlay).not.toContainText(text('en-US', 'drop.hint'));
  });

  test('F-023.R1 build-spec-questions 59: files picked before the effect chain has drawn are queued, then added', async ({
    page,
  }) => {
    await open(page, 'effects=pending&lang=en-US');
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-device', 'drawing-check');
    await page.setInputFiles('.tk-file-input', [VIDEO('early.mp4')]);
    await expect.poll(() => page.evaluate(() => (window as unknown as Harness).appHarness.queued())).toBe(1);
    expect((await projectOf(page)).sources).toEqual([]);
    // Add media works during the check (the files wait), so it is not announced as unavailable.
    await expect(
      page.getByRole('main').getByRole('button', { name: text('en-US', 'action.add_media') }),
    ).not.toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => (window as unknown as Harness).appHarness.draw());
    await expect.poll(async () => (await projectOf(page)).sources.map((s) => s.name)).toEqual(['early.mp4']);
  });

  test('F-001 the media panel and its notices in Vietnamese (vi-VN)', async ({ page }) => {
    await open(page, 'effects=fast&lang=vi-VN');
    const chooser = page.waitForEvent('filechooser');
    await page
      .getByRole('main')
      .getByRole('button', { name: text('vi-VN', 'action.add_media') })
      .click();
    await (await chooser).setFiles([VIDEO('pho.mp4'), HEIC]);
    const media = page.getByRole('complementary', { name: text('vi-VN', 'media.title') });
    await expect(media.getByRole('listitem').filter({ hasText: 'pho.mp4' })).toContainText(
      `${text('vi-VN', 'media.kind_video')} · 0:02`,
    );
    await expect(notice(page, 'refused_list').locator('.tk-notice__title')).toHaveText('Không thêm được:');
    await expect(notice(page, 'added')).toHaveText('Đã thêm 1 tệp');
    await axe(page);
  });
});

test.describe('F-001 add media — focus and the narrow sheet (app harness)', () => {
  test("CMP-MediaPanel after Delete focus moves to the next row's Delete, else the previous row's, else the heading", async ({
    page,
  }) => {
    await open(page);
    await pick(page, [VIDEO('a.mp4'), VIDEO('b.mp4'), VIDEO('c.mp4')]);
    const del = (name: string) =>
      panel(page)
        .getByRole('listitem')
        .filter({ hasText: name })
        .getByRole('button', { name: text('en-US', 'action.delete') });
    await del('b.mp4').click();
    await expect(del('c.mp4')).toBeFocused();
    await del('c.mp4').click();
    await expect(del('a.mp4')).toBeFocused();
    await del('a.mp4').click();
    await expect(panel(page).getByRole('heading', { name: text('en-US', 'media.title') })).toBeFocused();
  });

  test('F-001.R6 Cancel in the progress notice keeps focus in the tool (Add media of the empty state)', async ({
    page,
  }) => {
    await open(page, 'effects=fast&lang=en-US&gate=0');
    await pick(page, [VIDEO('1.mp4'), VIDEO('2.mp4')]);
    const cancel = notice(page, 'adding').getByRole('button', { name: text('en-US', 'action.cancel') });
    await cancel.focus();
    await page.keyboard.press('Enter');
    await expect(notice(page, 'adding')).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('button', { name: text('en-US', 'action.add_media') })).toBeFocused();
  });

  test("F-001.R6 Cancel in the media panel's checking row moves focus to the panel", async ({ page }) => {
    await open(page, 'effects=fast&lang=en-US&gate=1');
    await pick(page, [VIDEO('1.mp4'), VIDEO('2.mp4')]);
    const row = panel(page).locator('[data-checking]');
    await expect(row).toContainText('2 of 2');
    await row.getByRole('button', { name: text('en-US', 'action.cancel') }).click();
    await expect(row).toHaveCount(0);
    await expect(panel(page).getByRole('button', { name: text('en-US', 'action.add_media') })).toBeFocused();
    await expect.poll(async () => (await projectOf(page)).sources.map((s) => s.name)).toEqual(['1.mp4']);
  });

  test('F-001.R6 Cancel while another batch is queued drops the queued batch too', async ({ page }) => {
    await open(page, 'effects=fast&lang=en-US&gate=1');
    await pick(page, [VIDEO('1.mp4'), VIDEO('2.mp4')]);
    await expect(notice(page, 'adding')).toContainText('Adding 2 of 2…');
    await drop(page, [VIDEO('queued.mp4')]);
    await expect.poll(() => page.evaluate(() => (window as unknown as Harness).appHarness.queued())).toBe(1);
    await notice(page, 'adding')
      .getByRole('button', { name: text('en-US', 'action.cancel') })
      .click();
    await expect.poll(() => page.evaluate(() => (window as unknown as Harness).appHarness.queued())).toBe(0);
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-state', 'default');
    expect((await projectOf(page)).sources.map((s) => s.name)).toEqual(['1.mp4']);
  });

  test('CMP-MediaPanel narrow: a modal sheet that takes focus, keeps Tab inside, closes on Esc and returns focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const opener = page.getByRole('main').getByRole('button', { name: text('en-US', 'action.add_media') });
    const chooser = page.waitForEvent('filechooser');
    await opener.click();
    await (await chooser).setFiles([]);
    const sheet = page.getByRole('dialog', { name: text('en-US', 'media.title') });
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(sheet.getByRole('heading', { name: text('en-US', 'media.title') })).toBeFocused();
    await axe(page);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('CMP-MediaPanel narrow with sources and refusals passes axe (vi-VN)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, 'effects=fast&lang=vi-VN');
    const chooser = page.waitForEvent('filechooser');
    await page
      .getByRole('main')
      .getByRole('button', { name: text('vi-VN', 'action.add_media') })
      .click();
    await (await chooser).setFiles([VIDEO('pho.mp4'), HEIC]);
    const sheet = page.getByRole('dialog', { name: text('vi-VN', 'media.title') });
    await expect(sheet.getByRole('listitem').filter({ hasText: 'pho.mp4' })).toBeVisible();
    await expect(sheet.getByRole('heading', { name: text('vi-VN', 'media.title') })).toBeFocused();
    await axe(page);
  });
});

test.describe('F-001 add media (production build)', () => {
  test("F-001.AC7 a session of picking, dropping and pasting media requests only the tool's own files, none carrying content", async ({
    page,
    baseURL,
    browserName,
  }) => {
    const origin = new URL(baseURL!).origin;
    const requests: { url: string; method: string; body: boolean }[] = [];
    page.on('request', (r) => {
      if (network(r.url(), browserName, origin))
        requests.push({ url: r.url(), method: r.method(), body: r.postDataBuffer() !== null });
    });
    await page.route(
      (url) => url.origin !== origin && url.protocol !== 'data:',
      (route) => route.abort(),
    );
    await page.goto('/?lang=en-US');
    const editor = page.locator('[data-screen="SCR-Editor"]');
    await expect(editor).toHaveAttribute('data-device', 'supported', { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    const before = requests.length;
    await pick(page, [VIDEO('picked.mp4'), HEIC]);
    await expect(panel(page).getByRole('listitem').filter({ hasText: 'picked.mp4' })).toBeVisible();
    await drop(page, [fx('mp4-rot90.mp4', 'dropped.mp4')]);
    await expect(panel(page).getByRole('listitem').filter({ hasText: 'dropped.mp4' })).toBeVisible();
    await paste(page, [fx('mp4-elst-trim.mp4', 'pasted.mp4')]);
    await expect(panel(page).getByRole('listitem').filter({ hasText: 'pasted.mp4' })).toBeVisible();
    await expect(editor).toHaveAttribute('data-state', 'default');
    // Adding media makes no request at all; the whole session requests only the tool's own files.
    expect(requests.slice(before)).toEqual([]);
    expect(requests.filter((r) => new URL(r.url).origin !== origin)).toEqual([]);
    expect(requests.filter((r) => r.method !== 'GET' || r.body)).toEqual([]);
  });
});

test.describe('F-001 drops never navigate (production build)', () => {
  test('F-001.R5 a file dropped on SCR-Unsupported is kept from the browser, so the page never navigates', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      delete (globalThis as { VideoDecoder?: unknown }).VideoDecoder;
    });
    await page.goto('/?lang=en-US');
    await expect(page.locator('[data-screen="SCR-Unsupported"]')).toBeVisible();
    const url = page.url();
    const prevented = await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(4)], 'clip.mp4', { type: 'video/mp4' }));
      const target = document.querySelector('[data-screen="SCR-Unsupported"]')!;
      const fire = (type: string) =>
        !target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      return { over: fire('dragover'), drop: fire('drop') };
    });
    expect(prevented).toEqual({ over: true, drop: true });
    expect(page.url()).toBe(url);
  });
});
