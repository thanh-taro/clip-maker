// MOD-App — the GIF and Audio only kinds of CMP-ExportPanel (F-016): RULE-16's GIF range, size and rate, the
// audio formats offered (F-023.R5), what makes Export available, the format line, and the run with MOD-Export
// replaced by a fake (`setExportDeps`), including RULE-19 / D-019 (a GIF never clears unexported changes).
// The pipeline itself is tested in export.*.test.ts and tests/e2e/export.spec.ts; the panel through the real
// UI in tests/e2e/export-kinds.spec.ts.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Capabilities, VideoFormat } from '../../src/codec';
import type { ExportSettings } from '../../src/core';
import type { ExportCaps, ExportContext, ExportHandle, ExportResult, ProgressView } from '../../src/export';
import { edit, newProject, playhead, project, setAdjustments, unexported } from '../../src/project';
import { capabilities } from '../../src/app/device';
import {
  audioOffers,
  cancelExport,
  canExport,
  capsSound,
  chooseAudio,
  chooseGifFrom,
  chooseGifRate,
  chooseGifTo,
  chooseGifSize,
  chooseKind,
  chosenAudio,
  clampGifRange,
  closePanel,
  closeRun,
  DEFAULT_GIF,
  defaultGifRange,
  estimateView,
  exportBlock,
  exportKind,
  exportSettings,
  formatGifTime,
  gifChoice,
  gifRange,
  gifRangeFixed,
  mimeOf,
  openPanel,
  panelOpen,
  parseGifTime,
  resetExportSession,
  run,
  sessionCaps,
  setExportDeps,
  setGifFrom,
  setGifTo,
  startExport,
} from '../../src/app/export';
import { audioFormatLine, gifFormatLine } from '../../src/app/export-format';
import { editorLocked } from '../../src/app/lock';
import { S, photo, proj, video } from '../support/project';

const MP4: VideoFormat = { id: 'mp4-h264-aac', container: 'mp4', video: 'h264', audio: 'aac', fallback: false };
const CAPS: ExportCaps = {
  videoFormat: MP4,
  audioFormat: { id: 'm4a-aac', fallback: false },
  video: { latencyMode: 'quality', acceleration: 'no-preference', bitrateModes: ['variable', 'constant'] },
  audio: { aac: { encoderDelay: 2112, deliveredKbps: 128 } },
};
const PROBE = {
  decode: ['h264'],
  encode: { h264: true, vp9: true, vp8: true },
  audioEncode: { aac: true, opus: true },
  effects: { ok: true, msPerFrame: 5 },
  slowDevice: false,
  ms: 10,
} as unknown as Capabilities;

const tick = () => new Promise((r) => setTimeout(r, 0));
/** Opens the panel; the capability record for the project's sound is worked out as it opens. */
async function open(): Promise<void> {
  openPanel();
  await tick();
  await tick();
}

// ── RULE-16 GIF range (pure) ──────────────────────────────────────────────────────────────────────

describe('RULE-16 the GIF range', () => {
  it('F-016.AC1 RULE-16 a 40 s project with the playhead at 10 s defaults to 10–25 s', () => {
    expect(defaultGifRange(40 * S, 10 * S, 30)).toEqual({ from: 10 * S, to: 25 * S });
  });

  it('RULE-16 with fewer than 15 s after the playhead the default is the last 15 s', () => {
    expect(defaultGifRange(40 * S, 30 * S, 30)).toEqual({ from: 25 * S, to: 40 * S });
    expect(defaultGifRange(40 * S, 40 * S, 30)).toEqual({ from: 25 * S, to: 40 * S });
  });

  it('RULE-16 the default starts at the frame the playhead is in', () => {
    // 10.01 s at 30 fps is inside frame 300 (10.000 s – 10.033 s).
    expect(defaultGifRange(40 * S, 10.01 * S, 30)).toEqual({ from: 10 * S, to: 25 * S });
  });

  it('RULE-16 a project of 15 s or less is exported whole, wherever the playhead is', () => {
    expect(defaultGifRange(12 * S, 5 * S, 30)).toEqual({ from: 0, to: 12 * S });
    expect(defaultGifRange(15 * S, 5 * S, 30)).toEqual({ from: 0, to: 15 * S });
    expect(clampGifRange({ from: 3 * S, to: 4 * S }, 12 * S, 30)).toEqual({ from: 0, to: 12 * S });
  });

  it('F-016.AC1 RULE-16 the range is adjustable to at most 15 s and stays inside the project', () => {
    const r = { from: 10 * S, to: 25 * S };
    // A later end pulls the start along so the range stays 15 s.
    expect(setGifTo(r, 30 * S, 40 * S, 30)).toEqual({ from: 15 * S, to: 30 * S });
    // An earlier start pulls the end along.
    expect(setGifFrom(r, 5 * S, 40 * S, 30)).toEqual({ from: 5 * S, to: 20 * S });
    // A shorter range is kept as it is.
    expect(setGifTo(r, 12 * S, 40 * S, 30)).toEqual({ from: 10 * S, to: 12 * S });
    expect(setGifFrom(r, 20 * S, 40 * S, 30)).toEqual({ from: 20 * S, to: 25 * S });
    // Past the project's end: clamped to it.
    expect(setGifTo(r, 50 * S, 40 * S, 30)).toEqual({ from: 25 * S, to: 40 * S });
    // An end at or before the start pushes the start back; the range keeps RULE-05's minimum length.
    expect(setGifTo(r, 8 * S, 40 * S, 30)).toEqual({ from: 7.9 * S, to: 8 * S });
    expect(setGifFrom(r, 40 * S, 40 * S, 30).to - setGifFrom(r, 40 * S, 40 * S, 30).from).toBeGreaterThan(0);
  });

  it('CMP-ExportPanel From/To accept m:ss with optional frames', () => {
    expect(parseGifTime('0:10', 30)).toBe(10 * S);
    expect(parseGifTime(' 1:05 ', 30)).toBe(65 * S);
    expect(parseGifTime('25', 30)).toBe(25 * S);
    // Frames after the seconds: "·", "." or ":" (the transport shows "0:10 ·15").
    expect(parseGifTime('0:10·15', 30)).toBe(10.5 * S);
    expect(parseGifTime('0:10 ·15', 30)).toBe(10.5 * S);
    expect(parseGifTime('0:10.15', 30)).toBe(10.5 * S);
    expect(parseGifTime('0:10:15', 30)).toBe(10.5 * S);
    for (const bad of ['', 'abc', '0:60', '0:10·30', '1:2:3:4', '-0:05', '0:1x'])
      expect(parseGifTime(bad, 30), bad).toBeNull();
  });

  it('CMP-ExportPanel a time shows as m:ss, with the frame as a suffix when it isn’t on a whole second', () => {
    expect(formatGifTime(10 * S, 30, 'en-US')).toBe('0:10');
    expect(formatGifTime(10.5 * S, 30, 'en-US')).toBe('0:10·15');
    expect(formatGifTime(65 * S, 30, 'vi-VN')).toBe('1:05');
    expect(parseGifTime(formatGifTime(10.5 * S, 30, 'en-US'), 30)).toBe(10.5 * S);
  });
});

// ── The panel's state per kind ─────────────────────────────────────────────────────────────────────

describe('F-016 CMP-ExportPanel kinds', () => {
  beforeEach(() => {
    newProject();
    resetExportSession();
    capabilities.value = PROBE;
    sessionCaps.value = CAPS;
    capsSound.value = true;
    setExportDeps({
      caps: async () => CAPS,
      grid: async () => null,
      estimate: async () => ({ bytes: 1, reachable: true }),
    });
  });
  afterEach(() => {
    resetExportSession();
    capabilities.value = null;
  });

  const forty = () => edit(() => ({ project: proj({ clips: [photo('A', 40)] }), notices: [], changed: [] }));

  it('F-016.AC1 RULE-16 picking GIF with the playhead at 10 s of a 40 s project gives 10–25 s at 480 and 15 fps', async () => {
    forty();
    playhead.value = 10 * S;
    await open();
    expect(exportKind.value).toBe('video');
    chooseKind('gif');
    expect(gifChoice.value).toEqual(DEFAULT_GIF);
    expect(DEFAULT_GIF).toEqual({ size: 480, rate: 15 });
    expect(gifRange.value).toEqual({ from: 10 * S, to: 25 * S });
    expect(gifRangeFixed.value).toBe(false);
    await tick();
    expect(canExport.value).toBe(true);
    expect(exportSettings.value).toEqual({ kind: 'gif', size: 480, rate: 15, from: 10 * S, to: 25 * S });
    chooseGifSize(320);
    chooseGifRate(10);
    expect(exportSettings.value).toMatchObject({ size: 320, rate: 10 });
    // The playhead moving afterwards doesn't move the range picked for this opening.
    playhead.value = 2 * S;
    expect(gifRange.value).toEqual({ from: 10 * S, to: 25 * S });
  });

  it('RULE-16 RULE-23 the kind, GIF size and rate and audio format are kept; the range is worked out again on each opening', async () => {
    forty();
    playhead.value = 10 * S;
    await open();
    chooseKind('gif');
    chooseGifSize(640);
    closePanel(false);
    playhead.value = 20 * S;
    await open();
    expect(exportKind.value).toBe('gif');
    expect(gifChoice.value.size).toBe(640);
    expect(gifRange.value).toEqual({ from: 20 * S, to: 35 * S });
    newProject();
    expect(gifChoice.value.size).toBe(640);
  });

  it('RULE-16 a 12 s project: the GIF range is the whole project and can’t be changed', async () => {
    edit(() => ({ project: proj({ clips: [photo('A', 12)] }), notices: [], changed: [] }));
    playhead.value = 5 * S;
    await open();
    chooseKind('gif');
    expect(gifRange.value).toEqual({ from: 0, to: 12 * S });
    expect(gifRangeFixed.value).toBe(true);
  });

  it('RULE-16 CMP-ExportPanel a project made shorter with the panel open keeps the range’s length and slides it to fit', async () => {
    forty();
    playhead.value = 20 * S;
    await open();
    chooseKind('gif');
    expect(gifRange.value).toEqual({ from: 20 * S, to: 35 * S });
    // The photo shortened to 30 s: still 15 s long, now 15–30 s (not cut to a sliver at the end).
    edit(() => ({ project: proj({ clips: [photo('A', 30)] }), notices: [], changed: [] }));
    expect(gifRange.value).toEqual({ from: 15 * S, to: 30 * S });
    // A shorter range keeps its own length.
    chooseGifTo(18 * S);
    chooseGifFrom(16 * S);
    expect(gifRange.value).toEqual({ from: 16 * S, to: 18 * S });
    edit(() => ({ project: proj({ clips: [photo('A', 17)] }), notices: [], changed: [] }));
    expect(gifRange.value).toEqual({ from: 15 * S, to: 17 * S });
    expect(clampGifRange({ from: 20 * S, to: 35 * S }, 30 * S, 30)).toEqual({ from: 15 * S, to: 30 * S });
  });

  it('RULE-16 a range taken on a project of 15 s or less makes way for the default from the playhead once the project grows past 15 s', async () => {
    edit(() => ({ project: proj({ clips: [photo('A', 12)] }), notices: [], changed: [] }));
    playhead.value = 5 * S;
    await open();
    chooseKind('gif');
    expect(gifRange.value).toEqual({ from: 0, to: 12 * S });
    edit(() => ({ project: proj({ clips: [photo('A', 40)] }), notices: [], changed: [] }));
    expect(gifRangeFixed.value).toBe(false);
    expect(gifRange.value).toEqual({ from: 5 * S, to: 20 * S });
  });

  it('RULE-16 F-016.R2 audio only offers the compressed format the device can encode (default) and WAV', async () => {
    edit(() => ({ project: proj({ clips: [video('A', 4)] }), notices: [], changed: [] }));
    await open();
    chooseKind('audio');
    expect(audioOffers.value.map((f) => f.id)).toEqual(['m4a-aac', 'wav']);
    expect(chosenAudio.value).toBe('compressed');
    expect(exportSettings.value).toEqual({ kind: 'audio', format: 'compressed' });
    chooseAudio('wav');
    expect(exportSettings.value).toEqual({ kind: 'audio', format: 'wav' });
    expect(canExport.value).toBe(true);
    expect(exportBlock.value).toBeNull();
  });

  it('F-023.AC8 F-023.R5 RULE-16 without a sound encoder audio only offers WAV only, and WAV is chosen', async () => {
    edit(() => ({ project: proj({ clips: [video('A', 4)] }), notices: [], changed: [] }));
    const noSoundEncoder: ExportCaps = { ...CAPS, audioFormat: { id: 'wav', fallback: true }, audio: {} };
    setExportDeps({ caps: async () => noSoundEncoder });
    await open();
    chooseKind('audio');
    expect(audioOffers.value.map((f) => f.id)).toEqual(['wav']);
    expect(chosenAudio.value).toBe('wav');
    expect(exportSettings.value).toEqual({ kind: 'audio', format: 'wav' });
  });

  it('F-023.R5 RULE-16 with sound and no sound encoder, video export is unavailable but GIF and WAV stay', async () => {
    edit(() => ({ project: proj({ clips: [video('A', 4)] }), notices: [], changed: [] }));
    const noVideo: ExportCaps = { ...CAPS, videoFormat: null, audioFormat: { id: 'wav', fallback: true }, audio: {} };
    setExportDeps({ caps: async () => noVideo });
    await open();
    expect(canExport.value).toBe(false);
    chooseKind('gif');
    expect(canExport.value).toBe(true);
    chooseKind('audio');
    expect(exportSettings.value).toEqual({ kind: 'audio', format: 'wav' });
    expect(canExport.value).toBe(true);
  });

  it('F-016 edge case RULE-16 a project with no unmuted sound: audio only is unavailable with COPY-notice.no_sound_to_export', async () => {
    edit(() => ({ project: proj({ clips: [video('A', 4, { muted: true })] }), notices: [], changed: [] }));
    capsSound.value = false;
    await open();
    chooseKind('audio');
    expect(exportBlock.value).toBe('no_sound');
    expect(canExport.value).toBe(false);
    // The format choices stay offered (CMP-ExportPanel "no sound").
    expect(audioOffers.value.length).toBeGreaterThan(0);
    // A photo project has no sound either.
    edit(() => ({ project: proj({ clips: [photo('P', 4)] }), notices: [], changed: [] }));
    expect(exportBlock.value).toBe('no_sound');
  });

  it('F-016 edge case RULE-03 CMP-ExportPanel "needs clip" an empty main track blocks every kind with COPY-notice.needs_clip', async () => {
    newProject();
    await open();
    for (const k of ['video', 'gif', 'audio'] as const) {
      chooseKind(k);
      expect(exportBlock.value).toBe('needs_clip');
      expect(canExport.value).toBe(false);
    }
  });

  it('F-016 CMP-ExportPanel the estimate is worked out for the chosen kind', async () => {
    const asked: ExportSettings[] = [];
    setExportDeps({
      texts: async () => ({}),
      context: async (_p, caps) => ({ caps }) as unknown as ExportContext,
      estimate: async (_p, s) => {
        asked.push(s);
        return { bytes: 2_400_000, reachable: true };
      },
    });
    edit(() => ({ project: proj({ clips: [video('A', 40)] }), notices: [], changed: [] }));
    playhead.value = 10 * S;
    await open();
    chooseKind('gif');
    await new Promise((r) => setTimeout(r, 300));
    expect(asked.at(-1)).toEqual({ kind: 'gif', size: 480, rate: 15, from: 10 * S, to: 25 * S });
    expect(estimateView.value).toEqual({ status: 'ready', result: { bytes: 2_400_000, reachable: true } });
    chooseKind('audio');
    await new Promise((r) => setTimeout(r, 300));
    expect(asked.at(-1)).toEqual({ kind: 'audio', format: 'compressed' });
  });
});

describe('F-016 format lines and file types', () => {
  it('F-016 CMP-ExportPanel "gif" the footer says Saves as GIF', () => {
    expect(gifFormatLine('en-US')).toEqual({ text: 'Saves as GIF', fallback: false });
    expect(gifFormatLine('vi-VN')).toEqual({ text: 'Lưu dạng GIF', fallback: false });
  });

  it('RULE-16 Q60 the audio line names M4A or WAV, and the Ogg fallback in COPY-export.format_note (WAV has no note)', () => {
    expect(audioFormatLine({ id: 'm4a-aac', fallback: false }, 'compressed', 'en-US')).toEqual({
      text: 'Saves as M4A',
      fallback: false,
    });
    expect(audioFormatLine({ id: 'm4a-aac', fallback: false }, 'wav', 'en-US')).toEqual({
      text: 'Saves as WAV',
      fallback: false,
    });
    expect(audioFormatLine({ id: 'ogg-opus', fallback: true }, 'compressed', 'en-US')).toEqual({
      text: "Saves as Ogg. This browser can't make M4A.",
      fallback: true,
    });
    expect(audioFormatLine({ id: 'wav', fallback: true }, 'wav', 'en-US')).toEqual({
      text: 'Saves as WAV',
      fallback: false,
    });
  });

  it('F-015.R9 RULE-16 the shared file has its format’s type', () => {
    expect(mimeOf('clip-20261103-140509.gif')).toBe('image/gif');
    expect(mimeOf('clip-20261103-140509.m4a')).toBe('audio/mp4');
    expect(mimeOf('clip-20261103-140509.ogg')).toBe('audio/ogg');
    expect(mimeOf('clip-20261103-140509.wav')).toBe('audio/wav');
  });
});

// ── The run, with MOD-Export faked ─────────────────────────────────────────────────────────────────

interface FakeRun {
  readonly settings: ExportSettings;
  readonly texts: [number, number] | null;
  progress(v: ProgressView): void;
  end(r: ExportResult): void;
  readonly cancelled: () => number;
}

function fakeExport(): { runs: FakeRun[] } {
  const runs: FakeRun[] = [];
  let texts: [number, number] | null = null;
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
      const finish = (r: ExportResult): void => {
        if (r.ok) ctx.save?.(new Blob([new Uint8Array(8)]), r.fileName);
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
      texts = null;
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

const ok = (fileName: string, fullProject: boolean): ExportResult => ({
  ok: true,
  fileName,
  bytes: 1000,
  stats: {} as never,
  trim: null,
  fullProject,
});

describe('F-016 the run (CMP-ExportProgress, F-016.R3)', () => {
  let fake: { runs: FakeRun[] };
  beforeEach(() => {
    newProject();
    resetExportSession();
    capabilities.value = PROBE;
    sessionCaps.value = CAPS;
    capsSound.value = true;
    fake = fakeExport();
    // A 40 s 16:9 project with sound: an edit, so there are unexported changes (RULE-19).
    edit(() => ({ project: proj({ clips: [video('A', 40)] }), notices: [], changed: [] }));
    playhead.value = 10 * S;
  });
  afterEach(() => {
    resetExportSession();
    capabilities.value = null;
  });

  it('F-016.R1 a GIF export starts with the panel’s settings and its text layers at the GIF size (480 of 16:9: 480 × 270)', async () => {
    await open();
    chooseKind('gif');
    const started = startExport();
    await tick();
    expect(panelOpen.value).toBe(false);
    expect(fake.runs[0]?.settings).toEqual({ kind: 'gif', size: 480, rate: 15, from: 10 * S, to: 25 * S });
    expect(fake.runs[0]?.texts).toEqual([480, 270]);
    expect(editorLocked.value).toBe(true);
    fake.runs[0]!.end(ok('clip-20261103-140509.gif', false));
    await started;
    expect(run.value).toEqual({ phase: 'done', fileName: 'clip-20261103-140509.gif', share: null });
    expect(editorLocked.value).toBe(false);
  });

  it('F-016.AC4 F-016.R4 RULE-19 D-019 a GIF export doesn’t clear unexported changes', async () => {
    expect(unexported.value).toBe(true);
    await open();
    chooseKind('gif');
    const started = startExport();
    await tick();
    fake.runs[0]!.end(ok('clip-20261103-140509.gif', false));
    await started;
    expect(run.value?.phase).toBe('done');
    expect(unexported.value).toBe(true);
  });

  it('F-016.AC6 F-016.R4 RULE-19 a successful audio export clears unexported changes', async () => {
    edit((p) => setAdjustments(p, 'A', { brightness: 10 }));
    expect(unexported.value).toBe(true);
    await open();
    chooseKind('audio');
    chooseAudio('wav');
    const started = startExport();
    await tick();
    expect(fake.runs[0]?.settings).toEqual({ kind: 'audio', format: 'wav' });
    // Sound only: no text layers are drawn.
    expect(fake.runs[0]?.texts).toBeNull();
    fake.runs[0]!.end(ok('clip-20261103-140509.wav', true));
    await started;
    expect(run.value).toEqual({ phase: 'done', fileName: 'clip-20261103-140509.wav', share: null });
    expect(unexported.value).toBe(false);
  });

  it('F-016.AC3 F-016.R3 NFR-11 Cancel stops a GIF export, saves nothing and leaves the project and its changes as they were', async () => {
    const before = project.value;
    await open();
    chooseKind('gif');
    const started = startExport();
    await tick();
    fake.runs[0]!.progress({ fraction: 0.3, remainingMs: 4000 });
    cancelExport();
    expect(fake.runs[0]!.cancelled()).toBe(1);
    await started;
    expect(run.value).toBeNull();
    expect(editorLocked.value).toBe(false);
    expect(project.value).toBe(before);
    expect(unexported.value).toBe(true);
  });

  it('F-016.R3 F-015.R6 a failed audio export shows the failed state and keeps the unexported changes', async () => {
    await open();
    chooseKind('audio');
    const started = startExport();
    await tick();
    fake.runs[0]!.end({ ok: false, error: 'error.export_failed', detail: 'EncodingError: x' });
    await started;
    expect(run.value).toEqual({ phase: 'failed' });
    expect(unexported.value).toBe(true);
    closeRun();
  });

  it('F-016 edge case an audio export of a project without sound doesn’t start', async () => {
    edit(() => ({ project: proj({ clips: [video('A', 40, { muted: true })] }), notices: [], changed: [] }));
    await open();
    chooseKind('audio');
    await startExport();
    expect(fake.runs).toHaveLength(0);
    expect(run.value).toBeNull();
  });
});
