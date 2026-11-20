// F-019 the tool embedded in the host portal with every M-1 feature built: the theme switching during playback
// of an edited project (AC2), a walk through the main features observed at the host (AC6: the only message is
// the ready signal), and the long 1080 export from the frame (AC9). On the multi-origin host harness
// (tests/e2e/support/host-harness.mjs): the stub portal page with the portal's sandbox and allow attributes,
// the production build allow-listing it, with its real CSP. Everything is done through the tool's own UI
// (no test hooks in the production build); media comes from tests/fixtures/media and a generated PNG.
// (The 3.5 GB 4K add of F-001 on the reference phone, Q75, is a manual QA check on the device: see add-media.spec.ts.)
import { expect, test, type Frame, type FrameLocator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, type MessageId } from '../../src/copy/messages.gen';
import type { ExportRead } from '../harness/app';
import { HOST_ALLOWED, TOOL_ALLOWED, hostPageUrl } from './support/host-urls';
import { MEDIA_HARNESS_PORT } from './support/ports';

const SHELL = '[data-screen="SCR-Editor"]';
// A stuck step fails within 20 s instead of using up the whole test's time.
test.use({ actionTimeout: 20_000 });
const DARK_WORK_AREA = 'rgb(11, 8, 18)';
const LIGHT_WORK_AREA = 'rgb(236, 232, 244)';
const APP = `http://localhost:${MEDIA_HARNESS_PORT}/app.html`;
const en = (id: MessageId): string => CATALOG['en-US'][id] as string;
const CLIP = readFileSync(fileURLToPath(new URL('../fixtures/media/mp4-faststart.mp4', import.meta.url)));

type HostWindow = Window & {
  __all: { origin: string; data: unknown }[];
  __sendTheme: (v: unknown) => void;
};
type ToolWindow = Window & { __mark?: number; __run?: string[] };

interface Payload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Uint8Array;
}
const video = (name: string): Payload => ({ name, mimeType: 'video/mp4', buffer: CLIP });

const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: readonly number[]): number => {
  let c = 0xffffffff;
  for (const x of bytes) c = CRC_TABLE[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
/** A zlib stream of `raw` in stored (uncompressed) deflate blocks. */
function zlibStored(raw: readonly number[]): number[] {
  const out = [0x78, 0x01];
  for (let i = 0; i < raw.length || i === 0; i += 65535) {
    const block = raw.slice(i, i + 65535);
    const last = i + 65535 >= raw.length ? 1 : 0;
    out.push(last, block.length & 0xff, block.length >>> 8, ~block.length & 0xff, (~block.length >>> 8) & 0xff);
    for (const x of block) out.push(x);
  }
  let a = 1;
  let b = 0;
  for (const x of raw) {
    a = (a + x) % 65521;
    b = (b + a) % 65521;
  }
  return [...out, ...be32(((b << 16) | a) >>> 0)];
}

/** A W × H PNG of one flat colour, made here (no fixture in git). */
function png(name: string, w: number, h: number, [r, g, b]: readonly [number, number, number]): Payload {
  const chunk = (type: string, data: readonly number[]): number[] => {
    const td = [...Array.from(type, (c) => c.charCodeAt(0)), ...data];
    return [...be32(data.length), ...td, ...be32(crc32(td))];
  };
  const row = [0, ...Array.from({ length: w }, () => [r, g, b]).flat()];
  const raw = Array.from({ length: h }, () => row).flat();
  const ihdr = [...be32(w), ...be32(h), 8, 2, 0, 0, 0]; // 8-bit RGB
  // Buffer.from: Playwright sends a file's contents as a Node Buffer.
  const buffer = Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', zlibStored(raw)),
    ...chunk('IEND', []),
  ]);
  return { name, mimeType: 'image/png', buffer };
}

/**
 * Opens the stub portal embedding the tool. The host page records every message its window receives, from any
 * origin or window (F-019.R5 / INV-08), from before the tool loads.
 */
async function openHost(page: Page, theme: 'light' | 'dark' = 'dark'): Promise<FrameLocator> {
  await page.addInitScript((host) => {
    if (location.origin !== host) return;
    const all: { origin: string; data: unknown }[] = [];
    (window as unknown as HostWindow).__all = all;
    window.addEventListener('message', (e) => all.push({ origin: e.origin, data: e.data }), true);
  }, HOST_ALLOWED);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(hostPageUrl(HOST_ALLOWED, TOOL_ALLOWED, { theme, lang: 'en-US' }));
  const tool = page.frameLocator('#tool');
  await expect(tool.locator(SHELL)).toHaveAttribute('data-device', 'supported');
  return tool;
}

function toolFrame(page: Page): Frame {
  const frame = page.frames().find((f) => f.url().startsWith(TOOL_ALLOWED));
  if (!frame) throw new Error('tool frame not found');
  return frame;
}

const allReceived = (page: Page) => page.evaluate(() => (window as unknown as HostWindow).__all);

/** Adds `files` through COPY-action.add_media of the empty state and closes the media panel and notices. */
async function addMedia(page: Page, tool: FrameLocator, files: Payload[], clips: number): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await tool
    .locator('.tk-empty')
    .getByRole('button', { name: en('action.add_media') })
    .click();
  await (await chooser).setFiles(files);
  await expect(tool.locator('.tk-timeline .tk-clip')).toHaveCount(clips, { timeout: 30_000 });
  const media = tool.locator('.tk-media');
  await media.getByRole('button', { name: en('action.close') }).click();
  await expect(media).toHaveCount(0);
  await closeNotices(tool);
}

async function closeNotices(tool: FrameLocator): Promise<void> {
  const close = tool.locator('.tk-notice__close').first();
  for (let i = 0; i < 5 && (await close.count()) > 0; i++) await close.click({ timeout: 2000 }).catch(() => undefined);
}

const editorBar = (tool: FrameLocator) => tool.getByRole('toolbar', { name: en('toolbar.label') });
const timelineBar = (tool: FrameLocator) =>
  tool.getByRole('region', { name: en('timeline.label') }).getByRole('toolbar', { name: en('timeline.actions') });
const clips = (tool: FrameLocator) => tool.locator('.tk-timeline .tk-clip');
const inspector = (tool: FrameLocator) => tool.getByRole('complementary', { name: en('inspector.label') });
const frameInspector = (tool: FrameLocator) => tool.getByRole('complementary', { name: en('inspector.frame') });
/** The time shown under the preview, in seconds (COPY-time.position's current time, m:ss·ff at 30 fps). */
async function shownTime(tool: FrameLocator): Promise<number> {
  const label = (await tool.getByRole('img', { name: /^Preview at / }).getAttribute('aria-label')) ?? '';
  const m = /(\d+):(\d\d)(?:·(\d\d))?/.exec(label);
  if (!m) throw new Error(`no time in ${label}`);
  return Number(m[1]) * 60 + Number(m[2]) + Number(m[3] ?? 0) / 30;
}

type Scope = ReturnType<FrameLocator['locator']>;

/** Chooses an option of an inspector option group (role="radio" buttons). */
async function choose(scope: Scope, name: string): Promise<void> {
  const radio = scope.getByRole('radio', { name, exact: true });
  await radio.click();
  await expect(radio).toBeChecked();
}

/** Chooses an option of the export panel as a user does: a click on its label (the native radio is hidden). */
async function pick(panel: Scope, name: string): Promise<void> {
  const radio = panel.getByRole('radio', { name, exact: true });
  await panel
    .locator('label')
    .filter({ hasText: new RegExp(`^\\s*${name.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}\\s*$`) })
    .first()
    .click();
  await expect(radio).toBeChecked();
}

test('F-019.AC2 F-019.R1 embedded, edited and playing: the host switches the theme; the tool switches without reloading, the project, history and playback unchanged', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const tool = await openHost(page, 'light');
  const frame = toolFrame(page);
  await addMedia(page, tool, [video('a.mp4'), video('b.mp4'), video('c.mp4')], 3);
  // An edit: the middle clip at 2× speed.
  await clips(tool).nth(1).click();
  await choose(inspector(tool).getByRole('radiogroup', { name: en('inspector.speed') }), '2×');
  const names = await clips(tool).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent));
  await expect(editorBar(tool).getByRole('button', { name: en('action.undo'), exact: true })).toBeEnabled();
  await frame.evaluate(() => ((window as ToolWindow).__mark = 42));
  expect(await tool.locator('.tk-preview-area').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    LIGHT_WORK_AREA,
  );

  await tool.getByRole('button', { name: en('action.go_start') }).click();
  await tool.getByRole('button', { name: en('action.play'), exact: true }).click();
  const pause = tool.getByRole('button', { name: en('action.pause'), exact: true });
  await expect(pause).toBeVisible();
  await expect.poll(() => shownTime(tool)).toBeGreaterThan(0.2);
  const before = await shownTime(tool);

  await page.evaluate(() => (window as unknown as HostWindow).__sendTheme('dark'));
  await expect(tool.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await tool.locator('.tk-preview-area').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    DARK_WORK_AREA,
  );
  // Playback goes on: still playing, and the time moves on past where it was at the switch.
  await expect(pause).toBeVisible();
  await expect.poll(() => shownTime(tool), { timeout: 5000 }).toBeGreaterThan(before + 0.2);
  // Nothing reloaded or lost: the same window, the same clips with the edit, the history.
  expect(await frame.evaluate(() => (window as ToolWindow).__mark)).toBe(42);
  expect(await clips(tool).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent))).toEqual(
    names,
  );
  await pause.click();
  await expect(tool.getByRole('button', { name: en('action.play'), exact: true })).toBeVisible();
  // The selection is kept too, with its edit.
  await expect(clips(tool).nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(
    inspector(tool)
      .getByRole('radiogroup', { name: en('inspector.speed') })
      .getByRole('radio', { name: '2×' }),
  ).toBeChecked();
  await editorBar(tool)
    .getByRole('button', { name: en('action.undo'), exact: true })
    .click();
  await expect(
    inspector(tool)
      .getByRole('radiogroup', { name: en('inspector.speed') })
      .getByRole('radio', { name: '1×' }),
  ).toBeChecked();
});

const exportPanel = (tool: FrameLocator) =>
  tool.getByRole('dialog', { name: en('export.title') }).and(tool.locator('.tk-export'));
const runDialog = (tool: FrameLocator) => tool.locator('dialog.tk-run');

/** Opens CMP-ExportPanel on `kind`, applies `choices` (option labels), exports and returns the saved file. */
async function exportKind(
  page: Page,
  tool: FrameLocator,
  kind: MessageId,
  choices: string[],
): Promise<{ name: string; bytes: Uint8Array }> {
  await editorBar(tool)
    .getByRole('button', { name: en('action.export'), exact: true })
    .click();
  const panel = exportPanel(tool);
  await expect(panel).toBeVisible();
  await panel.getByRole('tab', { name: en(kind) }).click();
  for (const c of choices) await pick(panel, c);
  const go = panel.getByRole('button', { name: en('action.export'), exact: true });
  await expect(go).toBeEnabled({ timeout: 30_000 });
  const download = page.waitForEvent('download', { timeout: 90_000 });
  await go.click();
  const d = await download;
  await expect(runDialog(tool)).toHaveAttribute('data-phase', 'done');
  await runDialog(tool)
    .getByRole('button', { name: en('action.close') })
    .click();
  await expect(runDialog(tool)).toHaveCount(0);
  return { name: d.suggestedFilename(), bytes: readFileSync(await d.path()) };
}

const ascii = (b: Uint8Array): string => String.fromCharCode(...b);

/** Moves the playhead `frames` frames on with COPY-action.next_frame. */
async function stepFrames(tool: FrameLocator, frames: number): Promise<void> {
  const next = tool.getByRole('button', { name: en('action.next_frame') });
  for (let i = 0; i < frames; i++) await next.click();
}

test('F-019.AC6 F-019.R5 INV-08 embedded use of every M-1 feature: the only message the host receives is one ready signal', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const tool = await openHost(page);
  await expect.poll(() => allReceived(page)).toHaveLength(1);

  // F-001 add media: two clips and a photo.
  await addMedia(page, tool, [video('a.mp4'), video('b.mp4'), png('p.png', 320, 240, [200, 80, 60])], 3);
  const track = clips(tool);
  const tbar = timelineBar(tool);

  // F-003 arrange: a moves one place later.
  await track.nth(0).click();
  await tbar.getByRole('button', { name: en('action.move_right') }).click();
  await expect(track.nth(0)).toHaveAccessibleName(/^b\.mp4 /);
  await expect(track.nth(1)).toHaveAccessibleName(/^a\.mp4 /);

  // F-004 trim and split: b starts 10 frames in, then splits 15 frames further on.
  await track.nth(0).click();
  await expect(track.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await tool.getByRole('button', { name: en('action.go_start') }).click();
  await stepFrames(tool, 10);
  await tbar.getByRole('button', { name: en('action.set_in') }).click();
  await stepFrames(tool, 15);
  await tbar.getByRole('button', { name: en('action.split') }).click();
  await expect(track).toHaveCount(4);

  // F-005 speed, F-006 placement, F-009 fades (Edit tab of the selected clip).
  await track.nth(1).click();
  const panel = inspector(tool);
  await panel.getByRole('tab', { name: en('inspector.edit') }).click();
  await choose(panel.getByRole('radiogroup', { name: en('inspector.speed') }), '2×');
  await choose(panel.getByRole('radiogroup', { name: en('placement.mode') }), en('placement.fill'));
  await panel.getByRole('button', { name: en('fades.quick_in') }).click();
  await expect(panel.getByRole('spinbutton', { name: en('fades.in') })).not.toHaveValue('0.0');

  // F-007 adjust and F-008 look.
  await panel.getByRole('tab', { name: en('inspector.adjust') }).click();
  const brightness = panel.getByRole('spinbutton', { name: en('adjust.brightness') });
  await brightness.fill('20');
  await brightness.press('Enter');
  await expect(panel.getByRole('slider', { name: en('adjust.brightness') })).toHaveValue('20');
  await panel.getByRole('tab', { name: en('looks.title') }).click();
  await choose(panel.getByRole('radiogroup', { name: en('looks.title') }), en('look.natural_warm'));

  // F-009 cross-fade at the first join (from the keyboard: at this zoom the short clips' trim handles cover the
  // marker), made a step shorter (these clips are too short for a longer one).
  const join = tool.locator('.tk-timeline .tk-join').first();
  await expect(join).toHaveAccessibleName(en('action.add_crossfade'));
  await join.focus();
  await page.keyboard.press('Enter');
  await expect(join).toHaveAttribute('data-state', 'marker');
  // The marker opens the length popover.
  await page.keyboard.press('Enter');
  const pop = tool.getByRole('dialog', { name: en('crossfade.length') });
  await expect(pop).toBeVisible();
  await pop.getByRole('button', { name: en('crossfade.shorter') }).click();
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);

  // F-010 text.
  await editorBar(tool)
    .getByRole('button', { name: en('action.add_text'), exact: true })
    .click();
  const field = tool.getByRole('textbox', { name: en('text.field') });
  await expect(field).toBeFocused();
  await page.keyboard.type('Hello');
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);

  // F-011 music: a bundled track at the playhead.
  await editorBar(tool)
    .getByRole('button', { name: en('action.music') })
    .click();
  const picker = tool.getByRole('dialog', { name: en('music.title') });
  await picker
    .getByRole('listitem')
    .first()
    .getByRole('button', { name: en('music.add') })
    .click();
  await expect(tool.locator('.tk-aclip')).toHaveCount(1, { timeout: 30_000 });
  if (await picker.isVisible()) await picker.getByRole('button', { name: en('action.close') }).click();
  await closeNotices(tool);

  // F-012 frame: nothing selected, 9:16; F-013 undo (Mod+Z) and redo.
  // Select the first clip, then activate it again: that clears the selection (CMP-Timeline: a toggle).
  await track.nth(0).click();
  await expect(track.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await track.nth(0).click();
  await expect(
    tool.locator(
      '.tk-timeline [aria-pressed="true"].tk-clip, .tk-aclip[aria-pressed="true"], .tk-tclip[aria-pressed="true"]',
    ),
  ).toHaveCount(0);
  const frameSide = frameInspector(tool);
  await expect(frameSide).toBeVisible();
  const aspect = frameSide.getByRole('radiogroup', { name: en('frame.aspect') });
  await choose(aspect, '9:16');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(aspect.getByRole('radio', { name: en('frame.original') })).toBeChecked();
  await editorBar(tool)
    .getByRole('button', { name: en('action.redo'), exact: true })
    .click();
  await expect(aspect.getByRole('radio', { name: '9:16' })).toBeChecked();

  // F-014 timeline zoom (=) and F-017 shortcuts help (?).
  const scale = tbar.getByText(/^1 frame = /);
  const before = await scale.textContent();
  await page.keyboard.press('=');
  await expect(scale).not.toHaveText(before ?? '');
  await page.keyboard.press('?');
  const help = tool.getByRole('dialog', { name: en('help.title') });
  await expect(help).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);

  // F-018 New project asks first; Cancel keeps the project.
  await editorBar(tool)
    .getByRole('button', { name: en('action.new_project'), exact: true })
    .click();
  const confirm = tool.getByRole('alertdialog', { name: en('action.new_project') });
  await expect(confirm).toContainText(en('confirm.new_project'));
  await confirm.getByRole('button', { name: en('action.cancel') }).click();
  await expect(confirm).toHaveCount(0);
  await expect(track).toHaveCount(4);

  // F-015 / F-016 a short export of each kind: video at 480, a 320 GIF at 10 fps, WAV.
  const mp4 = await exportKind(page, tool, 'export.kind_video', ['480', en('export.q_smaller')]);
  expect(mp4.name).toMatch(/^clip-\d{8}-\d{6}\.(mp4|webm)$/);
  expect(mp4.bytes.length).toBeGreaterThan(1000);
  const gif = await exportKind(page, tool, 'export.kind_gif', ['320', '10']);
  expect(gif.name).toMatch(/^clip-\d{8}-\d{6}\.gif$/);
  expect(ascii(gif.bytes.subarray(0, 6))).toBe('GIF89a');
  const wav = await exportKind(page, tool, 'export.kind_audio', [en('export.audio_wav')]);
  expect(wav.name).toMatch(/^clip-\d{8}-\d{6}\.wav$/);
  expect(ascii(wav.bytes.subarray(0, 4))).toBe('RIFF');
  expect(ascii(wav.bytes.subarray(8, 12))).toBe('WAVE');

  // F-018 New project after a further change (an undo): confirmed, the editor is empty again.
  await page.keyboard.press('ControlOrMeta+z');
  await editorBar(tool)
    .getByRole('button', { name: en('action.new_project'), exact: true })
    .click();
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: en('action.new_project') }).click();
  await expect(tool.locator('.tk-empty')).toBeVisible();

  // Throughout, the host window received exactly one message: the tool's ready signal, without content.
  expect(await allReceived(page)).toEqual([{ origin: TOOL_ALLOWED, data: { type: 'taro:ready' } }]);
});

interface ExportHarness {
  appHarness: {
    readExport(
      bytes: number[],
      times: readonly number[],
      points: readonly (readonly [number, number])[],
      windows: readonly number[],
      onsetAmp: number,
      names: readonly string[],
    ): Promise<ExportRead>;
  };
}

test('F-019.AC9 F-019.R7 embedded, a 60 s project exported at 1080 succeeds as standalone, or is refused before starting with COPY-error.no_space', async ({
  page,
  context,
}) => {
  // The NFR-04 fixture lives outside git (ADR-0016 §5). As in the F-015.AC10 test (export-ui.spec.ts), a
  // 60 s project of one photo stands in for it: the same length, exported at 1080, without a large file.
  test.setTimeout(300_000);
  // The run dialog's phases and texts, recorded in the tool's frame from before it loads.
  await page.addInitScript((tool) => {
    if (location.origin !== tool) return;
    const seen: string[] = [];
    (window as unknown as ToolWindow).__run = seen;
    const record = () => {
      const d = document.querySelector('dialog.tk-run');
      if (!d) return;
      const entry = `${d.getAttribute('data-phase')}|${d.querySelector('.tk-run__text')?.textContent ?? ''}`;
      if (seen[seen.length - 1] !== entry) seen.push(entry);
    };
    new MutationObserver(record).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-phase'],
    });
  }, TOOL_ALLOWED);
  const tool = await openHost(page);
  await addMedia(page, tool, [png('p.png', 320, 240, [120, 140, 160])], 1);
  await clips(tool).first().click();
  const duration = inspector(tool).getByRole('spinbutton', { name: en('photo.duration'), exact: true });
  await duration.fill('60');
  await duration.press('Enter');
  await expect(tool.getByRole('main')).toContainText('/ 1:00');

  await editorBar(tool)
    .getByRole('button', { name: en('action.export'), exact: true })
    .click();
  const panel = exportPanel(tool);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('radio', { name: '1080', exact: true })).toBeChecked();
  await expect(panel.getByRole('radio', { name: en('export.q_balanced'), exact: true })).toBeChecked();
  const go = panel.getByRole('button', { name: en('action.export'), exact: true });
  await expect(go).toBeEnabled({ timeout: 30_000 });
  const download = page.waitForEvent('download', { timeout: 240_000 }).catch(() => null);
  await go.click();
  const dialog = runDialog(tool);
  await expect(dialog).toHaveAttribute('data-phase', /^(done|no_space)$/, { timeout: 240_000 });
  const run = await toolFrame(page).evaluate(() => (window as ToolWindow).__run ?? []);

  if ((await dialog.getAttribute('data-phase')) === 'no_space') {
    // Refused before starting: COPY-error.no_space, and no progress was ever shown.
    const alert = tool.getByRole('alertdialog', { name: en('export.no_space_title') });
    await expect(alert).toContainText(en('error.no_space'));
    const percents = run.filter((r) => r.startsWith('running|')).map((r) => Number(/(\d+) %/.exec(r)?.[1] ?? 0));
    expect(Math.max(0, ...percents), run.join('\n')).toBe(0);
    test.info().annotations.push({ type: 'outcome', description: 'refused before starting: no_space' });
    return;
  }

  // Succeeded as standalone: saved under the RULE-15 name, and the file decodes at 1080 for the full 60 s.
  const saved = await download;
  expect(saved).not.toBeNull();
  expect(saved!.suggestedFilename()).toMatch(/^clip-\d{8}-\d{6}\.(mp4|webm)$/);
  await expect(dialog.getByRole('status')).toHaveText(`Saved ${saved!.suggestedFilename()}`);
  const file = await saved!.path();
  const bytes = readFileSync(file);
  // Read back in the app harness (another page; the production build has no test hooks). The bytes reach it
  // through a routed same-origin address rather than as a serialised argument.
  const reader = await context.newPage();
  await reader.route('**/__export.bin', (r) => r.fulfill({ path: file, contentType: 'application/octet-stream' }));
  await reader.goto(`${APP}?effects=fast&lang=en-US`);
  await expect(reader.locator(SHELL)).toHaveAttribute('data-device', 'supported');
  const read = await reader.evaluate(async () => {
    const b = Array.from(new Uint8Array(await (await fetch('/__export.bin')).arrayBuffer()));
    return (window as unknown as ExportHarness).appHarness.readExport(b, [1, 30, 59.5], [[0.5, 0.5]], [], 1, ['p.png']);
  });
  await reader.close();
  expect(Math.min(read.width, read.height)).toBe(1080);
  expect(read.duration).toBeCloseTo(60, 0);
  expect(read.found).toEqual([]);
  test.info().annotations.push({ type: 'outcome', description: `saved, ${bytes.length} bytes, decoded` });
  for (const f of read.frames) {
    expect(Number.isFinite(f.at)).toBe(true);
    // The photo's flat colour (120, 140, 160), within encoding error.
    const [r, g, b] = f.rgb[0]!;
    expect(Math.abs(r! - 120) + Math.abs(g! - 140) + Math.abs(b! - 160), JSON.stringify(f)).toBeLessThan(30);
  }
});
