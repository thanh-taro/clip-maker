// MOD-App — the user-facing video export (F-015): RULE-15's offers and default, the size target's choice and
// advice, the format line, and the run that CMP-ExportProgress shows, with MOD-Export replaced by a fake
// (`setExportDeps`). The export pipeline itself is tested in export.*.test.ts and tests/e2e/export.spec.ts; the
// panel and the dialog through the real UI in tests/e2e/export-ui.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Capabilities, GridCell, VideoFormat } from '../../src/codec';
import { MUSIC_TRACKS, type ExportSettings, type Project } from '../../src/core';
import type { ExportCaps, ExportContext, ExportHandle, ExportResult, ProgressView } from '../../src/export';
import { edit, newProject, project, setAdjustments, unexported } from '../../src/project';
import { capabilities } from '../../src/app/device';
import {
  cancelExport,
  canExport,
  chooseQuality,
  chooseTarget,
  closeRun,
  defaultResolution,
  DEFAULT_CHOICE,
  mimeOf,
  openPanel,
  panelOpen,
  parseTarget,
  resetExportSession,
  resolution,
  resolutionOffers,
  run,
  sessionCaps,
  capsSound,
  mediaOf,
  MusicUnavailable,
  setExportDeps,
  settingsOf,
  shareExport,
  startVideoExport,
  targetAdvice,
  tryAgain,
  videoChoice,
} from '../../src/app/export';
import { videoFormatLine } from '../../src/app/export-format';
import { editorLocked } from '../../src/app/lock';
import { historyAvailable, redoEdit, undoEdit } from '../../src/app/history';
import { focusInfo } from '../../src/app/playback';
import { S, proj, video, videoSource } from '../support/project';
import { addFiles } from '../../src/app/adding';
import { notices } from '../../src/app/notice-stack';

// A bundled track of the shipped pack (read from the generated manifest, not hard-coded).
const PAD = MUSIC_TRACKS[1]!.id;

const grid = (ok: (short: number, rate: number) => boolean): GridCell[] =>
  [480, 720, 1080, 1440, 2160].flatMap((short) =>
    [24, 25, 30, 60].map((rate) => ({ short, rate, supported: ok(short, rate) })),
  );
const MP4: VideoFormat = { id: 'mp4-h264-aac', container: 'mp4', video: 'h264', audio: 'aac', fallback: false };
const CAPS: ExportCaps = {
  videoFormat: MP4,
  audioFormat: { id: 'm4a-aac', fallback: false },
  video: { latencyMode: 'quality', acceleration: 'no-preference', bitrateModes: ['variable', 'constant'] },
  audio: { aac: { encoderDelay: 2112, deliveredKbps: 128 } },
};
const PROBE: Capabilities = {
  decode: ['h264'],
  encode: { h264: true, vp9: true, vp8: true },
  audioEncode: { aac: true, opus: true },
  effects: { ok: true, msPerFrame: 5 },
  slowDevice: false,
  ms: 10,
} as Capabilities;

describe('RULE-15 resolutions offered (F-015.AC1)', () => {
  const p = (w: number, h: number): Pick<Project, 'sources' | 'frame'> =>
    proj({ clips: [video('A', 4)], sources: [videoSource('A', 4, { width: w, height: h })] });

  it('F-015.AC1 only sizes the device can encode are offered and 1080 with Balanced is chosen', () => {
    const offers = resolutionOffers(
      p(3840, 2160),
      true,
      grid((s) => s <= 1440),
    );
    expect(offers.map((o) => [o.resolution, o.state])).toEqual([
      [480, 'ok'],
      [720, 'ok'],
      [1080, 'ok'],
      [1440, 'ok'],
      [2160, 'no_encoder'],
    ]);
    expect(defaultResolution(offers)).toBe(1080);
    expect(DEFAULT_CHOICE).toEqual({ resolution: null, quality: 'balanced', targetMB: null });
  });

  it('F-015.AC1 RULE-15 when 1080 can’t be encoded the default is the largest offered size below it', () => {
    const offers = resolutionOffers(
      p(1920, 1080),
      true,
      grid((s) => s <= 720),
    );
    expect(defaultResolution(offers)).toBe(720);
    expect(offers.find((o) => o.resolution === 1080)?.state).toBe('no_encoder');
  });

  it('RULE-15 above 1080 a size needs a video or photo source whose shorter side is at least that size', () => {
    const all = grid(() => true);
    // A portrait 1440 × 2560 source (after rotation) allows 1440 but not 2160.
    const offers = resolutionOffers(p(1440, 2560), true, all);
    expect(offers.find((o) => o.resolution === 1440)?.state).toBe('ok');
    expect(offers.find((o) => o.resolution === 2160)?.state).toBe('needs_source');
    // A 1080p source: neither.
    expect(resolutionOffers(p(1920, 1080), true, all).filter((o) => o.state === 'needs_source')).toHaveLength(2);
  });

  it('RULE-15 a size is offered at the project’s frame rate only (the grid is size × rate)', () => {
    const at60 = { ...p(1920, 1080), frame: { aspect: 'original', frameRate: 60, background: 'black' } } as const;
    const offers = resolutionOffers(
      at60,
      true,
      grid((s, r) => r !== 60 || s <= 720),
    );
    expect(offers.find((o) => o.resolution === 1080)?.state).toBe('no_encoder');
    expect(defaultResolution(offers)).toBe(720);
  });

  it('RULE-15 until the grid is probed, 480–1080 follow the start-up 1080p30 answer and larger sizes wait', () => {
    expect(resolutionOffers(p(3840, 2160), true, null).map((o) => o.state)).toEqual([
      'ok',
      'ok',
      'ok',
      'no_encoder',
      'no_encoder',
    ]);
  });
});

describe('RULE-15 quality or size target', () => {
  it('RULE-15 a size target is a whole number from 1 to 4000 MB', () => {
    expect(parseTarget('4')).toBe(4);
    expect(parseTarget(' 4000 ')).toBe(4000);
    for (const bad of ['0', '4001', '2.5', '-3', '', 'abc', '1e3']) expect(parseTarget(bad)).toBeNull();
  });

  it('RULE-15 CMP-ExportPanel a size target replaces the quality level, and choosing a quality clears it', () => {
    resetExportSession();
    chooseTarget(8);
    expect(settingsOf(videoChoice.value, 1080)).toEqual({
      kind: 'video',
      resolution: 1080,
      quality: 'balanced',
      targetMB: 8,
    });
    chooseQuality('best');
    expect(videoChoice.value.targetMB).toBeNull();
    expect(settingsOf(videoChoice.value, 720)).toEqual({ kind: 'video', resolution: 720, quality: 'best' });
  });

  it('F-015.AC2 the advice names the largest resolution that meets the target, or the smallest whole-MB target', () => {
    expect(targetAdvice({ bytes: 4e6, reachable: false, suggestedResolution: 480 })).toEqual({
      kind: 'lower_res',
      fit: 480,
    });
    expect(targetAdvice({ bytes: 1e6, reachable: false, smallestTargetMB: 3 })).toEqual({
      kind: 'unreachable',
      min: 3,
    });
    expect(targetAdvice({ bytes: 9e6, reachable: true })).toEqual({ kind: 'none' });
    expect(targetAdvice(null)).toEqual({ kind: 'none' });
  });

  it('F-015.AC9 RULE-15 the format line names the fallback in technical names, the same in both languages', () => {
    expect(videoFormatLine(MP4, 'en-US')).toEqual({ text: 'Saves as MP4', fallback: false });
    const webm: VideoFormat = { id: 'webm-vp9-opus', container: 'webm', video: 'vp9', audio: 'opus', fallback: true };
    expect(videoFormatLine(webm, 'en-US')).toEqual({
      text: "Saves as WebM. This browser can't make MP4.",
      fallback: true,
    });
    expect(videoFormatLine(webm, 'vi-VN').text).toBe('Lưu dạng WebM. Trình duyệt này không tạo được MP4.');
    const opus: VideoFormat = { ...MP4, id: 'mp4-h264-opus', audio: 'opus', fallback: true };
    expect(videoFormatLine(opus, 'en-US').text).toBe(
      "Saves as MP4 (H.264 + Opus). This browser can't make MP4 (H.264 + AAC).",
    );
  });

  it('F-015.R9 the shared file carries its format’s type', () => {
    expect(mimeOf('clip-20261103-140509.mp4')).toBe('video/mp4');
    expect(mimeOf('clip-20261103-140509.webm')).toBe('video/webm');
  });
});

// ── The run, with MOD-Export faked ─────────────────────────────────────────────────────────────────

interface FakeRun {
  readonly settings: ExportSettings;
  readonly texts: [number, number];
  progress(v: ProgressView): void;
  end(r: ExportResult): void;
  readonly cancelled: () => number;
}

function fakeExport(): { runs: FakeRun[] } {
  const runs: FakeRun[] = [];
  let texts: [number, number] = [0, 0];
  setExportDeps({
    texts: async (_p, w, h) => {
      texts = [w, h];
      return {};
    },
    context: async (_p, caps) => ({ caps, save: () => 'blob:test' }) as unknown as ExportContext,
    estimate: async () => ({ bytes: 1e6, reachable: true }),
    caps: async () => CAPS,
    grid: async () => null,
    start: async (_p, settings, ctx): Promise<ExportHandle> => {
      let settle: (r: ExportResult) => void = () => undefined;
      const result = new Promise<ExportResult>((r) => (settle = r));
      // Like MOD-Export: a finished file is handed to the save hook before the result arrives.
      const finish = (r: ExportResult): void => {
        if (r.ok) ctx.save?.(new Blob([new Uint8Array(8)], { type: 'video/mp4' }), r.fileName);
        settle(r);
      };
      const listeners: ((v: ProgressView) => void)[] = [];
      let cancels = 0;
      runs.push({
        settings,
        texts,
        progress: (v) => listeners.forEach((l) => l(v)),
        end: finish,
        cancelled: () => cancels,
      });
      return {
        onProgress: (f) => void listeners.push(f),
        cancel: async () => {
          cancels++;
          finish({ ok: false, error: 'cancelled' });
        },
        result,
        cleaned: Promise.resolve(),
        scratchFile: null,
      };
    },
  });
  return { runs };
}

const ok = (fileName = 'clip-20261103-140509.mp4'): ExportResult => ({
  ok: true,
  fileName,
  bytes: 1000,
  stats: {} as never,
  trim: null,
  fullProject: true,
});
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('F-015 the run (CMP-ExportProgress)', () => {
  let fake: { runs: FakeRun[] };
  beforeEach(() => {
    newProject();
    resetExportSession();
    capabilities.value = PROBE;
    sessionCaps.value = CAPS;
    capsSound.value = true; // worked out for this project, which has sound
    fake = fakeExport();
    // A 16:9 project with one clip: an edit, so there are unexported changes (RULE-19).
    edit(() => ({ project: proj({ clips: [video('A', 4)] }), notices: [], changed: [] }));
  });
  afterEach(() => {
    resetExportSession();
    capabilities.value = null;
  });

  it('F-015.AC1 CMP-ExportPanel Export starts at 1080 Balanced and the panel hands over to the progress dialog', async () => {
    openPanel();
    await tick(); // the capability record for the project's sound is worked out when the panel opens
    await tick();
    expect(resolution.value).toBe(1080);
    expect(canExport.value).toBe(true);
    const started = startVideoExport();
    await tick();
    expect(panelOpen.value).toBe(false);
    expect(fake.runs[0]?.settings).toEqual({ kind: 'video', resolution: 1080, quality: 'balanced' });
    expect(run.value).toEqual({ phase: 'running', fraction: 0, remainingMs: null });
    fake.runs[0]!.end(ok());
    await started;
  });

  it('Q170 the text layers are rasterised at the output size before the start (480 of a 16:9 frame: 848 × 480)', async () => {
    const started = startVideoExport({ kind: 'video', resolution: 480, quality: 'smaller' });
    await tick();
    expect(fake.runs[0]?.texts).toEqual([848, 480]);
    fake.runs[0]!.end(ok());
    await started;
  });

  it('F-015.R3 F-015.AC12 progress is shown as it comes, and time remaining only once estimated', async () => {
    const started = startVideoExport();
    await tick();
    fake.runs[0]!.progress({ fraction: 0.05, remainingMs: null });
    expect(run.value).toEqual({ phase: 'running', fraction: 0.05, remainingMs: null });
    fake.runs[0]!.progress({ fraction: 0.2, remainingMs: 12_000 });
    expect(run.value).toEqual({ phase: 'running', fraction: 0.2, remainingMs: 12_000 });
    fake.runs[0]!.end(ok());
    await started;
  });

  it('SCR-Editor exporting Q96 the editor is locked while the export runs: no undo or redo, keys get a dialog’s scope', async () => {
    edit((p) => setAdjustments(p, 'A', { brightness: 10 }));
    const started = startVideoExport();
    await tick();
    expect(editorLocked.value).toBe(true);
    expect(historyAvailable.value).toEqual({ undo: false, redo: false });
    const before = project.value;
    expect(undoEdit()).toBe(false);
    expect(redoEdit()).toBe(false);
    expect(project.value).toBe(before);
    expect(focusInfo(null)).toMatchObject({ inDialog: true, editable: false });
    fake.runs[0]!.end(ok());
    await started;
    expect(editorLocked.value).toBe(false);
    expect(historyAvailable.value.undo).toBe(true);
  });

  it('F-015.R5 RULE-19 a successful export shows the RULE-15 file name and the project counts as exported', async () => {
    expect(unexported.value).toBe(true);
    const started = startVideoExport();
    await tick();
    fake.runs[0]!.end(ok('clip-20261103-140509.mp4'));
    await started;
    expect(run.value).toEqual({ phase: 'done', fileName: 'clip-20261103-140509.mp4', share: null });
    expect(unexported.value).toBe(false);
    closeRun();
    expect(run.value).toBeNull();
  });

  it('RULE-19 a change landing while the export runs stays unexported after it succeeds', async () => {
    const started = startVideoExport();
    await tick();
    // A media batch that was already being checked lands mid-export (the lock blocks the user's edits).
    edit((p) => setAdjustments(p, 'A', { contrast: 20 }));
    fake.runs[0]!.end(ok());
    await started;
    expect(unexported.value).toBe(true);
  });

  it('F-015.AC3 NFR-11 Cancel stops the export, saves nothing, closes the dialog and leaves the project unchanged', async () => {
    const before = project.value;
    const started = startVideoExport();
    await tick();
    cancelExport();
    expect(fake.runs[0]!.cancelled()).toBe(1);
    await started;
    expect(run.value).toBeNull();
    expect(editorLocked.value).toBe(false);
    expect(project.value).toBe(before);
    expect(unexported.value).toBe(true);
  });

  it('F-015.AC6 a failed export explains it, every edit is still there and unexported changes stay', async () => {
    edit((p) => setAdjustments(p, 'A', { saturation: 30 }));
    const before = project.value;
    const started = startVideoExport();
    await tick();
    fake.runs[0]!.end({
      ok: false,
      error: 'error.export_failed',
      detail: 'RangeError: Array buffer allocation failed',
    });
    await started;
    expect(run.value).toEqual({ phase: 'failed', kind: 'video' });
    expect(project.value).toBe(before);
    expect(unexported.value).toBe(true);
    expect(editorLocked.value).toBe(false);
  });

  it('F-015 edge cases interrupted and no space show their own states; Try again repeats the same settings', async () => {
    chooseTarget(10);
    let started = startVideoExport();
    await tick();
    fake.runs[0]!.end({ ok: false, error: 'error.export_interrupted' });
    await started;
    expect(run.value).toEqual({ phase: 'interrupted' });
    tryAgain();
    await tick();
    await tick();
    expect(fake.runs[1]?.settings).toEqual(fake.runs[0]?.settings);
    fake.runs[1]!.end({ ok: false, error: 'error.no_space' });
    await tick();
    expect(run.value).toEqual({ phase: 'no_space' });
    started = Promise.resolve();
    await started;
  });

  it('F-015.AC13 RULE-19 D-018 a save the browser reports as failed or cancelled does not count: unexported changes stay', async () => {
    const started = startVideoExport();
    await tick();
    // MOD-Export reports a hand-over that did not happen as a failed export (never ok).
    fake.runs[0]!.end({ ok: false, error: 'error.export_failed', detail: 'AbortError: the save was cancelled' });
    await started;
    expect(run.value).toEqual({ phase: 'failed', kind: 'video' });
    expect(unexported.value).toBe(true);
  });

  it('F-015 edge case editing during export: a second start while one runs is ignored', async () => {
    const started = startVideoExport();
    await tick();
    await startVideoExport();
    expect(fake.runs).toHaveLength(1);
    fake.runs[0]!.end(ok());
    await started;
  });

  it('F-015.R9 F-015.AC15 Share is offered with the finished file where the device can share it, never in place of the download', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { share, canShare: () => true });
    try {
      const started = startVideoExport();
      await tick();
      fake.runs[0]!.end(ok('clip-20261103-140509.mp4'));
      await started;
      const done = run.value;
      expect(done).toMatchObject({ phase: 'done', fileName: 'clip-20261103-140509.mp4' });
      const file = done?.phase === 'done' ? done.share : null;
      expect(file?.name).toBe('clip-20261103-140509.mp4');
      expect(file?.type).toBe('video/mp4');
      await shareExport();
      expect(share).toHaveBeenCalledWith({ files: [file] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('F-015.AC15 RULE-17 without the web-share grant (canShare refuses files) Share is not shown', async () => {
    vi.stubGlobal('navigator', { share: () => undefined, canShare: () => false });
    try {
      const started = startVideoExport();
      await tick();
      fake.runs[0]!.end(ok());
      await started;
      expect(run.value).toMatchObject({ phase: 'done', share: null });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('ADR-0004 the export capability record', () => {
  it('RULE-15 F-023.R5 with no sound encoder passing, a project with sound gets no format that needs one; WAV stays', async () => {
    const { exportCaps } = await import('../../src/app/export');
    const noAudio = { ...PROBE, audioEncode: { aac: false, opus: false } } as Capabilities;
    const ec = await exportCaps(noAudio, true);
    expect(ec.videoFormat).toBeNull();
    // F-016 / F-023.R5: the GIF and WAV exports need neither, so the record still exists with WAV.
    expect(ec.audioFormat).toEqual({ id: 'wav', fallback: true });
  });
});

describe('F-015 review fixes', () => {
  beforeEach(() => {
    newProject();
    resetExportSession();
    capabilities.value = PROBE;
    sessionCaps.value = CAPS;
    capsSound.value = true;
    edit(() => ({ project: proj({ clips: [video('A', 4)] }), notices: [], changed: [] }));
  });
  afterEach(() => {
    resetExportSession();
    capabilities.value = null;
  });

  /** A promise and its resolver. */
  function later<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
    let resolve: (v: T) => void = () => undefined;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  }

  for (const step of ['texts', 'context'] as const) {
    it(`F-015.AC3 SCR-Editor exporting Cancel while the ${step} is being prepared ends the run at once: unlocked, no file, no error`, async () => {
      const gate = later<void>();
      const closed: number[] = [];
      let starts = 0;
      const bitmap = { close: () => closed.push(1) } as unknown as ImageBitmap;
      setExportDeps({
        texts: async () => {
          if (step === 'texts') await gate.promise;
          return { t1: { bitmap, s: 480 } };
        },
        context: async (_p, caps) => {
          if (step === 'context') await gate.promise;
          return { caps } as unknown as ExportContext;
        },
        start: async () => {
          starts++;
          throw new Error('never');
        },
      });
      const started = startVideoExport();
      await tick();
      expect(editorLocked.value).toBe(true);
      cancelExport();
      expect(run.value).toBeNull();
      expect(editorLocked.value).toBe(false);
      gate.resolve();
      await started;
      expect(starts).toBe(0);
      expect(run.value).toBeNull();
      expect(editorLocked.value).toBe(false);
      expect(closed).toHaveLength(1); // the stale run's text bitmaps are closed
    });
  }

  it('F-015.AC3 a handle that arrives after Cancel is cancelled and nothing is shown', async () => {
    const gate = later<void>();
    let cancelled = 0;
    setExportDeps({
      texts: async () => ({}),
      context: async (_p, caps) => ({ caps }) as unknown as ExportContext,
      start: async () => {
        await gate.promise;
        return {
          onProgress: () => undefined,
          cancel: async () => void cancelled++,
          result: new Promise<ExportResult>(() => undefined),
          cleaned: Promise.resolve(),
          scratchFile: null,
        };
      },
    });
    const started = startVideoExport();
    await tick();
    cancelExport();
    gate.resolve();
    await started;
    expect(cancelled).toBe(1);
    expect(run.value).toBeNull();
    expect(editorLocked.value).toBe(false);
  });

  it('F-015 review the text bitmaps are closed as soon as MOD-Export has started, not at the end', async () => {
    const closed: number[] = [];
    const bitmap = { close: () => closed.push(1) } as unknown as ImageBitmap;
    const fake = fakeExport();
    setExportDeps({ texts: async () => ({ t1: { bitmap, s: 480 } }) });
    const started = startVideoExport();
    await tick();
    expect(closed).toHaveLength(1);
    fake.runs[0]!.end(ok());
    await started;
  });

  it('F-015.R2 RULE-15 a size-target check that failed or gave no answer advises a retry instead of a silent disabled Export', () => {
    expect(targetAdvice('failed')).toEqual({ kind: 'unknown' });
    expect(targetAdvice({ bytes: 1e6, reachable: false })).toEqual({ kind: 'unknown' });
  });

  it('F-015.R1 RULE-15 sound added while the panel is open: Export waits for the capability record of the new sound', () => {
    capsSound.value = false; // worked out for a silent project
    expect(canExport.value).toBe(false);
    capsSound.value = true;
    expect(canExport.value).toBe(true);
  });

  it('F-011.R7 Q120 a bundled track that can’t be read stops the export: COPY-notice.music_unavailable, never exported without it', async () => {
    setExportDeps({ music: async () => Promise.reject(new Error('NetworkError')) });
    const withMusic = proj({
      clips: [video('A', 4)],
      audioClips: [
        {
          id: 'm1',
          sourceId: PAD,
          start: 0,
          in: 0,
          out: S,
          volume: 100,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        },
      ],
    });
    // The track is not one of the project's sources (ENT-MusicTrack).
    const p = { ...withMusic, sources: withMusic.sources.filter((src) => src.id !== PAD) };
    await expect(mediaOf(p)).rejects.toBeInstanceOf(MusicUnavailable);
    expect(notices.value.some((n) => n.tag === 'music_unavailable')).toBe(true);
    // Through the run: the failed state names the reason.
    fakeExport();
    setExportDeps({ context: async () => Promise.reject(new MusicUnavailable(PAD)) });
    await startVideoExport();
    expect(run.value).toEqual({ phase: 'failed', reason: 'music', kind: 'video' });
  });

  it('SCR-Editor exporting files dropped or pasted during an export are refused with COPY-notice.busy_exporting', async () => {
    const fake = fakeExport();
    const started = startVideoExport();
    await tick();
    await addFiles([]);
    expect(notices.value.some((n) => n.tag === 'busy_exporting')).toBe(true);
    fake.runs[0]!.end(ok());
    await started;
  });
});
