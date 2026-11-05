// MOD-Media / MOD-Container / MOD-Codec in real engines (ADR-0016 §2–4): files are picked through a
// real file input on the media harness (tests/harness), checked in the real analysis worker with real
// decoders. Fixtures: tests/fixtures/media (SP-license's own generated corpus) plus bytes made here.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MEDIA_HARNESS_PORT } from './support/ports';
import type { IntakeSummary } from '../harness/main';

const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;
/** A fixture as a file payload (Playwright takes paths or payloads, not a mix). */
const fx = (name: string) => ({
  name,
  mimeType: 'application/octet-stream',
  buffer: readFileSync(fileURLToPath(new URL(`../fixtures/media/${name}`, import.meta.url))),
});
const bytes = (...parts: (string | number[])[]) =>
  Buffer.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const HEIC = {
  name: 'IMG_0001.HEIC',
  mimeType: 'image/heic',
  buffer: bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0], 'mif1heic'),
};
const PDF_AS_MP4 = { name: 'holiday.mp4', mimeType: 'video/mp4', buffer: bytes('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n') };
const PNG_1PX = {
  name: 'dot.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
};

async function open(page: Page): Promise<void> {
  await page.goto(HARNESS);
  await expect(page.locator('#out')).toHaveText('ready');
}

async function intake(page: Page, files: Parameters<Page['setInputFiles']>[1], cancelAt?: number) {
  await page.setInputFiles('#files', files);
  return page.evaluate((c) => window.harness.intakePicked(c), cancelAt) as Promise<IntakeSummary>;
}

test.describe('media intake (harness)', () => {
  test.beforeEach(async ({ page }) => open(page));

  test('F-001.AC3 a HEIC photo and a PDF renamed .mp4 are refused as unsupported; the valid video is added', async ({
    page,
  }) => {
    const r = await intake(page, [HEIC, PDF_AS_MP4, fx('mp4-faststart.mp4')]);
    expect(r.accepted.map((a) => [a.name, a.kind])).toEqual([['mp4-faststart.mp4', 'video']]);
    expect(r.refused).toEqual([
      { name: 'IMG_0001.HEIC', reason: 'reason.unsupported' },
      { name: 'holiday.mp4', reason: 'reason.unsupported' },
    ]);
    const v = r.accepted[0]!;
    expect([v.width, v.height, v.hasSound]).toEqual([320, 240, true]);
    expect(v.frameRate).toBeCloseTo(30, 0);
    expect(v.duration).toBeGreaterThan(2_000_000);
  });

  test('RULE-01 a photo is decoded on add and kept with its bitmap', async ({ page }) => {
    const r = await intake(page, [PNG_1PX]);
    expect(r.accepted).toEqual([
      expect.objectContaining({ name: 'dot.png', kind: 'photo', width: 1, height: 1, bitmap: true, scaled: false }),
    ]);
  });

  test('RULE-01 rotation from the container gives the picture size after orientation', async ({ page }) => {
    const r = await intake(page, [fx('mp4-rot90.mp4')]);
    expect(r.accepted[0]).toMatchObject({ width: 240, height: 320, rotation: 90, scaled: false });
  });

  test('MOD-Container an edit-list trim is accepted with a negative first timestamp', async ({ page }) => {
    const r = await intake(page, [fx('mp4-elst-trim.mp4')]);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0]!.firstTimestamp).toBeLessThan(0);
  });

  test('RULE-01 damaged files are refused with a reason, without hanging', async ({ page }) => {
    const r = await intake(page, [fx('dmg-moov-missing.mp4'), fx('dmg-garbage.mp4'), fx('dmg-bad-stsz.mp4')]);
    expect(r.accepted).toEqual([]);
    expect(r.refused).toEqual([
      { name: 'dmg-moov-missing.mp4', reason: 'reason.no_media' },
      { name: 'dmg-garbage.mp4', reason: 'reason.unsupported' },
      { name: 'dmg-bad-stsz.mp4', reason: 'reason.no_media' },
    ]);
  });

  test('RULE-01 WebM, Ogg and FLAC are accepted where this engine decodes them, else refused as codec', async ({
    page,
    browserName,
  }) => {
    const r = await intake(page, [fx('rec-chrome-vp9-opus.webm'), fx('audio-opus.ogg'), fx('os-afconvert.flac')]);
    const outcome = (name: string) =>
      r.accepted.find((a) => a.name === name)?.kind ?? r.refused.find((x) => x.name === name)?.reason;
    for (const name of ['rec-chrome-vp9-opus.webm', 'audio-opus.ogg', 'os-afconvert.flac']) {
      expect(['video', 'audio', 'reason.codec']).toContain(outcome(name));
    }
    if (browserName === 'chromium') {
      expect(outcome('rec-chrome-vp9-opus.webm')).toBe('video');
      expect(outcome('audio-opus.ogg')).toBe('audio');
      expect(outcome('os-afconvert.flac')).toBe('audio');
    }
  });

  test('F-023.AC2 an HEVC video this browser cannot decode is refused as codec; the other file still works', async ({
    page,
  }) => {
    const hevc = await page.evaluate(() => window.harness.supportsDecode('hvc1.1.6.L93.B0'));
    const r = await intake(page, [fx('os-avconvert-hevc.mov'), fx('mp4-faststart.mp4')]);
    expect(r.accepted.map((a) => a.name)).toContain('mp4-faststart.mp4');
    if (hevc) expect(r.accepted.map((a) => a.name)).toContain('os-avconvert-hevc.mov');
    else expect(r.refused).toEqual([{ name: 'os-avconvert-hevc.mov', reason: 'reason.codec' }]);
  });

  test('F-001.AC13 a 5120 × 2880 screen recording is accepted and used scaled to 3840 × 2160', async ({ page }) => {
    test.setTimeout(90_000);
    const made = await page.evaluate(() => window.harness.add5k());
    test.skip(!made, 'this engine has no 5120 × 2880 VP9 encoder to make the fixture');
    const r = await intake(page, []);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0]).toMatchObject({
      name: 'screen-5k.webm',
      width: 3840,
      height: 2160,
      nativeWidth: 5120,
      nativeHeight: 2880,
      scaled: true,
    });
  });

  test('F-001.R6 cancel through the analysis worker keeps the first file and drops the rest', async ({ page }) => {
    const r = await intake(page, [fx('mp4-faststart.mp4'), fx('mp4-rot90.mp4'), fx('mp4-elst-trim.mp4')], 2);
    expect(r.cancelled).toBe(true);
    expect(r.accepted.map((a) => a.name)).toEqual(['mp4-faststart.mp4']);
    expect(r.progress.slice(0, 2)).toEqual(['1/3 mp4-faststart.mp4', '2/3 mp4-rot90.mp4']);
  });
});
