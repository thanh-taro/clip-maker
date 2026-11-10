// MOD-Export and MOD-Scratch in real engines (ADR-0010 and its outcome, ADR-0016 §4), on the media
// harness (tests/harness/export.ts). The project is a frame-coded clip made in the page with loud
// generated sound; exports run through the two real export workers and are read back with MOD-Container.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, test, type BrowserType, type Page } from '@playwright/test';
import { MEDIA_HARNESS_PORT } from './support/ports';

const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;
const ts = (k: number): number => Math.floor((k * 1_000_000) / 30);

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS);
  await expect(page.locator('#out')).toHaveText('ready');
});

/**
 * A page whose origin has an origin-private file system: Playwright WebKit's default (ephemeral)
 * context has none, so WebKit storage tests run in a persistent context (adapters/tests.md).
 */
async function storagePage(
  browserName: string,
  browserType: BrowserType,
  page: Page,
): Promise<{ page: Page; close: () => Promise<void> }> {
  if (browserName !== 'webkit') return { page, close: async () => undefined };
  const dir = mkdtempSync(`${tmpdir()}/clip-maker-opfs-`);
  const ctx = await browserType.launchPersistentContext(dir);
  const p = ctx.pages()[0] ?? (await ctx.newPage());
  await p.goto(HARNESS);
  await expect(p.locator('#out')).toHaveText('ready');
  return {
    page: p,
    close: async () => {
      await ctx.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const balanced480 = { kind: 'video', resolution: 480, quality: 'balanced' } as const;

async function exportVideo(page: Page, frames: number, sound = true) {
  return page.evaluate(([f, s, settings]) => window.harness.export.run({ frames: f, settings, sound: s }), [
    frames,
    sound,
    balanced480,
  ] as const);
}

test.describe('MOD-Export video export', () => {
  test('F-015.R4 INV-02 NFR-08 an exported MP4 has every frame at its integer-µs time, each frame is the preview’s frame k, colours within ΔE00 mean < 2 / max < 4', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const r = await exportVideo(page, 90);
    expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
    const f = r.file!;
    expect(f.format).toMatch(/MP4/i);
    expect(f.video!.width).toBe(640); // 4:3 source at 480: 640 × 480
    expect(f.video!.height).toBe(480);
    expect(f.video!.packets).toBe(90);
    // Frame k is stamped at frameStart(k) µs; the container's timescale rounds it by at most 1 µs.
    f.video!.timestamps.forEach((t, k) => expect(Math.abs(t - ts(k)), `frame ${k}`).toBeLessThanOrEqual(1));
    expect(f.video!.keys).toBe(2); // a keyframe every 2 s: frames 0 and 60
    for (const c of f.frames) {
      expect(c.code, `frame ${c.k}`).toBe(c.k);
      expect(c.deMean, `frame ${c.k} mean ΔE00`).toBeLessThan(2);
      expect(c.deMax, `frame ${c.k} max ΔE00`).toBeLessThan(4);
    }
    test.info().annotations.push({
      type: 'fidelity',
      description: `ΔE00 mean ${Math.max(...f.frames.map((c) => c.deMean)).toFixed(2)} max ${Math.max(...f.frames.map((c) => c.deMax)).toFixed(2)}`,
    });
  });

  test('RULE-12 ADR-0008 outcome item 2 the exported sound’s decoded true peak is ≤ −1.0 dBTP after verify-and-trim', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const r = await exportVideo(page, 60);
    expect(r.result.ok).toBe(true);
    const a = r.file!.audio!;
    expect(a.truePeakDb).toBeLessThanOrEqual(-1.0);
    const trim = r.result.ok ? r.result.trim : null;
    expect(trim).not.toBeNull();
    test.info().annotations.push({
      type: 'true peak',
      description: `${a.truePeakDb.toFixed(2)} dBTP after ${trim!.passes} pass(es), gain ${trim!.gainDb.toFixed(2)} dB`,
    });
  });

  test('ADR-0010 outcome item 3 the AAC priming is removed by an edit list: the sound starts at 0 and lasts as long as the picture', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const caps = await page.evaluate(() => window.harness.export.caps());
    const r = await exportVideo(page, 60);
    const a = r.file!.audio!;
    // The reader shows the priming the edit list hides as time before 0 (MOD-Container rule).
    expect(Math.abs(a.firstTimestamp + caps.audio.aac!.encoderDelay / 48_000)).toBeLessThan(0.001);
    expect(r.file!.video!.timestamps[0]).toBe(0);
    expect(r.namesAfter).not.toContain(r.spillFile); // the spill file goes once the file is complete
    expect(Math.abs(r.file!.duration - 2)).toBeLessThan(0.05); // the file plays for the project's 2 s
    expect(a.end).toBeGreaterThan(1.97);
  });

  test('ADR-0010 outcome item 1 the writer takes sound after all the video without holding video in memory', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const r = await page.evaluate(() => window.harness.export.lateAudio());
    expect(r.spilled).toBe(r.videoBytes); // every video packet waited in the spill, none in memory
    expect(r.heldMax).toBe(r.maxPacket); // the mux stage held one packet at a time
    expect(r.writtenBeforeSound).toBeLessThan(1000); // only the file's head before the sound came
    // After the replay the sink has the media data: the writer streamed it instead of holding it (it
    // keeps only its current chunk of each track, ≤ 0.5 s, until the index is written).
    expect(r.writtenBeforeFinalize).toBeGreaterThanOrEqual(r.mediaBytesBeforeLastSecond);
    expect(r.read.video).toBe(90);
    expect(r.read.audio).toBeGreaterThan(130);
    expect(Math.abs(r.read.videoEnd - 3)).toBeLessThan(0.01);
    expect(Math.abs(r.read.audioFirst + 2112 / 48_000)).toBeLessThan(0.001);
    expect(r.read.audioEnd).toBeGreaterThan(2.95);
  });

  test('RULE-15 F-015.AC10 a size target is never exceeded', async ({ page }) => {
    test.setTimeout(120_000);
    const r = await page.evaluate(() =>
      window.harness.export.run({
        frames: 90,
        settings: { kind: 'video', resolution: 480, quality: 'balanced', targetMB: 1 },
        sound: true,
      }),
    );
    expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
    expect(r.file!.bytes).toBeLessThanOrEqual(1_000_000);
  });

  test('F-015.AC12 progress never goes down and reaches 100 %', async ({ page }) => {
    test.setTimeout(120_000);
    const r = await exportVideo(page, 90);
    expect(r.progress.length).toBeGreaterThan(1);
    for (let i = 1; i < r.progress.length; i++) expect(r.progress[i]!).toBeGreaterThanOrEqual(r.progress[i - 1]!);
    expect(r.progress.at(-1)).toBe(1);
  });

  test('RULE-15 an export without sound has no audio track', async ({ page }) => {
    test.setTimeout(60_000);
    const r = await exportVideo(page, 30, false);
    expect(r.result.ok).toBe(true);
    expect(r.file!.audio).toBeNull();
    expect(r.file!.video!.packets).toBe(30);
  });
});

test.describe('MOD-Export audio-only exports (RULE-16)', () => {
  test('RULE-16 F-016.R2 a compressed audio-only export is the project’s mix, ≤ −1.0 dBTP, priming removed', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const r = await page.evaluate(() =>
      window.harness.export.run({ frames: 60, settings: { kind: 'audio', format: 'compressed' }, sound: true }),
    );
    expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
    expect(r.result.ok && r.result.fileName).toMatch(/^clip-\d{8}-\d{6}\.(m4a|ogg)$/);
    expect(r.file!.video).toBeNull();
    expect(r.file!.audio!.truePeakDb).toBeLessThanOrEqual(-1.0);
    expect(r.file!.audio!.firstTimestamp).toBeLessThan(0); // priming hidden by the edit list
    expect(r.file!.audio!.end).toBeGreaterThan(1.97);
  });

  test('RULE-16 a WAV export is 16-bit 48 kHz stereo and exactly the project’s length', async ({ page }) => {
    test.setTimeout(60_000);
    const r = await page.evaluate(() =>
      window.harness.export.run({ frames: 60, settings: { kind: 'audio', format: 'wav' }, sound: true }),
    );
    expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
    expect(r.result.ok && r.result.fileName).toMatch(/\.wav$/);
    expect(r.file!.bytes).toBe(44 + 2 * 48_000 * 4);
    const head = await page.evaluate(() => window.harness.export.lastFile());
    expect(String.fromCharCode(...head.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...head.slice(8, 12))).toBe('WAVE');
  });
});

test.describe('MOD-Export GIF (RULE-16)', () => {
  test('F-016.R1 RULE-16 NFR-08 a GIF loops forever at its own size and rate, delays alternate 7, 7, 6 and frame i is the preview’s picture at i ÷ 15 s', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const r = await page.evaluate(() =>
      window.harness.export.run({ frames: 60, settings: { kind: 'gif', size: 320, rate: 15, from: 0 }, sound: true }),
    );
    expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
    expect(r.result.ok && r.result.fileName).toMatch(/^clip-\d{8}-\d{6}\.gif$/);
    expect(r.result.ok && r.result.fullProject).toBe(false); // RULE-19 / D-019
    const g = r.gif!;
    expect(g.header).toBe('GIF89a');
    expect(g.loop).toBe(0);
    expect([g.width, g.height]).toEqual([320, 240]);
    expect(g.images).toBe(30);
    expect(g.delays.slice(0, 6)).toEqual([7, 7, 6, 7, 7, 6]);
    expect(g.delays.reduce((s, d) => s + d, 0)).toBe(200);
    if (g.codes) expect(g.codes).toEqual(Array.from({ length: 30 }, (_, i) => 2 * i));
  });
});

test.describe('MOD-Export outputs carry no extra metadata (F-015.AC4, RULE-15 Contents)', () => {
  const formats = [
    { name: 'MP4 H.264 + AAC', settings: balanced480, caps: {} },
    {
      name: 'WebM VP9 + Opus',
      settings: balanced480,
      caps: {
        videoFormat: { id: 'webm-vp9-opus', container: 'webm', video: 'vp9', audio: 'opus', fallback: true },
      },
    },
    { name: 'M4A AAC', settings: { kind: 'audio', format: 'compressed' }, caps: {} },
    {
      name: 'Ogg Opus',
      settings: { kind: 'audio', format: 'compressed' },
      caps: { audioFormat: { id: 'ogg-opus', fallback: true } },
    },
    { name: 'WAV', settings: { kind: 'audio', format: 'wav' }, caps: {} },
    { name: 'GIF', settings: { kind: 'gif', size: 320, rate: 15, from: 0 }, caps: {} },
  ] as const;
  for (const f of formats) {
    test(`F-015.AC4 F-015.R4 ${f.name}: zero creation/modification times, no tags, no library or source names`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const ok = await page.evaluate(async (c) => {
        const caps = await window.harness.export.caps();
        const v = (c as { videoFormat?: { video: string } }).videoFormat;
        if (v && v.video === 'vp9')
          return (
            (await VideoEncoder.isConfigSupported({ codec: 'vp09.00.30.08', width: 640, height: 480 })).supported ===
              true && !!caps.audio.opus
          );
        if ((c as { audioFormat?: unknown }).audioFormat) return !!caps.audio.opus;
        return true;
      }, f.caps);
      test.skip(!ok, `${f.name} cannot be encoded by this engine`);
      const r = await page.evaluate(
        ([settings, caps]) => window.harness.export.run({ frames: 30, settings, sound: true, caps }),
        [f.settings, f.caps] as const,
      );
      expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
      expect(r.metadata).toEqual({ library: false, sourceName: false, times: [], tags: [] });
    });
  }
});

test.describe('MOD-Export review fixes (E5)', () => {
  test('F-015.AC11 the panel’s estimate is within ±25 % of the exported file', async ({ page }) => {
    test.setTimeout(120_000);
    const r = await page.evaluate(
      (settings) => window.harness.export.run({ frames: 240, settings, sound: true, dense: true, estimate: true }),
      balanced480,
    );
    expect(r.result.ok).toBe(true);
    const ratio = r.estimated!.bytes / r.file!.bytes;
    test.info().annotations.push({ type: 'estimate', description: `estimate ÷ file = ${ratio.toFixed(3)}` });
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(1.25);
  });

  test('F-016.AC3 a running GIF export cancels within 1 s and nothing is saved', async ({ page }) => {
    test.setTimeout(60_000);
    const r = await page.evaluate(() =>
      window.harness.export.run({
        frames: 300,
        settings: { kind: 'gif', size: 640, rate: 15, from: 0 },
        sound: false,
        cancelAt: 0.1,
      }),
    );
    expect(r.result).toEqual({ ok: false, error: 'cancelled' });
    expect(r.cancelMs!).toBeLessThan(1000);
    expect(r.gif).toBeNull();
  });

  test('F-016.AC2 a WAV export of clip sound and music holds exactly the RULE-12 mix, 16-bit 48 kHz stereo', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const r = await page.evaluate(() =>
      window.harness.export.run({ frames: 60, settings: { kind: 'audio', format: 'wav' }, sound: true, music: true }),
    );
    expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
    expect(r.wavMatchesMix).toBe(true);
  });
});

test.describe('MOD-Scratch and cancel', () => {
  // WebKit's persistent contexts share one website data store: storage tests run one at a time.
  test.describe.configure({ mode: 'serial' });

  test('F-015.AC3 NFR-11 F-015.AC7 a cancelled export stops within 1 s and leaves no scratch data', async ({
    page: first,
    browserName,
    playwright,
  }) => {
    test.setTimeout(120_000);
    const { page, close } = await storagePage(browserName, playwright.webkit, first);
    const r = await page.evaluate(() =>
      window.harness.export.run({
        frames: 300,
        settings: { kind: 'video', resolution: 720, quality: 'balanced' },
        sound: true,
        cancelAt: 0.2,
      }),
    );
    expect(r.result).toEqual({ ok: false, error: 'cancelled' });
    expect(r.cancelMs!).toBeLessThan(1000);
    expect(r.file).toBeNull();
    expect(r.scratchFile).not.toBeNull();
    expect(r.namesAfter.filter((n) => n === r.scratchFile || n === r.spillFile)).toEqual([]);
    await close();
  });

  // Wall-clock (8 s / 10.8 s windows): it flaked under parallel load, so it runs in check:realtime.
  test(
    'F-015.AC7 ADR-0010 outcome item 6 after a successful export the scratch file is kept 10 s after the hand-over, then deleted',
    { tag: '@realtime' },
    async ({ page: first, browserName, playwright }) => {
      test.setTimeout(120_000);
      const { page, close } = await storagePage(browserName, playwright.webkit, first);
      const r = await exportVideo(page, 30, false);
      expect(r.result.ok).toBe(true);
      const sink = r.result.ok ? r.result.stats.sink : null;
      if (sink !== 'scratch') {
        await close();
        test.skip(
          true,
          'no synchronous access handle in this Playwright engine (memory fallback, ADR-0010 outcome item 5)',
        );
      }
      expect(r.namesAfter).toContain(r.scratchFile);
      await page.waitForTimeout(8_000);
      expect(await page.evaluate(() => window.harness.export.scratchNames())).toContain(r.scratchFile);
      await page.waitForTimeout(2_800);
      expect(await page.evaluate(() => window.harness.export.scratchNames())).not.toContain(r.scratchFile);
      expect(await page.evaluate(() => window.harness.export.pending())).toEqual([]);
      await close();
    },
  );

  test('F-015.AC14 the start-up sweep removes an abandoned session’s files and keeps a live tab’s', async ({
    page: first,
    browserName,
    playwright,
  }) => {
    test.setTimeout(30_000);
    const { page, close } = await storagePage(browserName, playwright.webkit, first);
    const r = await page.evaluate(() => window.harness.export.sweep());
    await close();
    expect(r.supported).toBe(true);
    expect(r.deleted.sort()).toEqual(['export-deadsess1-aaa.part', 'export-deadsess1-bbb.part']);
    expect(r.kept).toContain('export-livesess2-ccc.part');
  });
});

test.describe('MOD-Export speed', () => {
  // Playwright's Chromium draws WebGL in software, so wrapping the canvas dominates there; the ≥ 1× laptop
  // bar of NFR-04 is measured in branded Chrome (E2E_CHROME=1). Here the phone bar (0.5×) must hold.
  test(
    'NFR-04 a 1080p30 export runs at least at half real time in this engine',
    { tag: '@realtime' },
    async ({ page }) => {
      test.setTimeout(240_000);
      await page.evaluate(() => window.harness.export.caps());
      const r = await page.evaluate(() =>
        window.harness.export.run({
          frames: 300,
          settings: { kind: 'video', resolution: 1080, quality: 'balanced' },
          sound: true,
        }),
      );
      expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
      const speed = 10_000 / r.ms;
      const stats = r.result.ok ? r.result.stats : null;
      test.info().annotations.push({
        type: 'speed',
        description: `${speed.toFixed(2)}× real time (${Math.round(r.ms)} ms for 10 s at 1440 × 1080); wrap ${Math.round(stats!.wrapMs)} ms, paint ${Math.round(stats!.paintMs)} ms, decode ${Math.round(stats!.decodeMs)} ms, encoder wait ${Math.round(stats!.encodeWaitMs)} ms, longest output gap ${Math.round(stats!.longestOutputGapMs)} ms, spilled ${stats!.spilledBytes} B, sink ${stats!.sink}`,
      });
      expect(speed).toBeGreaterThan(0.5);
    },
  );
});
