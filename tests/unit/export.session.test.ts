// MOD-Export main-thread session with fake workers, storage, visibility and clock: sink choice and
// COPY-error.no_space, the hand-over and file name, error vs interruption, cancel, the shared gain.
import { describe, expect, it } from 'vitest';
import type { FromExport, ToExport, ToExportAudio } from '../../src/core';
import { hasSound, planOutput, start } from '../../src/export';
import { balanced, CAPS, harness, lastPair } from '../support/export-session';
import { proj, video } from '../support/project';

describe('MOD-Export session', () => {
  it('F-019.R7 F-015 edge case an export that fits neither scratch nor memory is refused before it starts with COPY-error.no_space', async () => {
    const h = harness({ storage: false, seconds: 600 });
    const r = await (await start(h.project, { kind: 'video', resolution: 1080, quality: 'best' }, h.ctx)).result;
    expect(r).toEqual({ ok: false, error: 'error.no_space' });
    expect(lastPair(h).video.posted).toEqual([]); // nothing started
  });

  it('F-015.R5 F-015.AC5 RULE-19 on success the file is handed over as clip-<date>.mp4 and the export counts', async () => {
    const h = harness({ storage: false });
    const handle = await start(h.project, balanced, h.ctx);
    const pair = lastPair(h);
    const job = (pair.video.posted[0] as Extract<ToExport, { type: 'export:start' }>).job;
    expect(job.sink).toEqual({ kind: 'memory' });
    expect(job.output.kind === 'video' && job.output.video).toMatchObject({
      width: 1280,
      height: 720,
      bitrate: 3_000_000,
      bitrateMode: 'variable',
    });
    const audioStart = pair.audio.posted[0] as Extract<ToExportAudio, { type: 'exportAudio:start' }>;
    expect(audioStart).toMatchObject({ codec: 'aac', bitrate: 128_000, encoderDelay: 2112, gainDb: null });
    // The trim result travels with the file (over the port), not in a separate cross-worker message.
    pair.video.emit({
      type: 'export:done',
      bytes: 5,
      blob: new Blob([new Uint8Array(5)]),
      stats: {},
      trim: { gainDb: -2.1, peakDb: -1.3, passes: 2, fallback: false },
    } as unknown as FromExport);
    const r = await handle.result;
    expect(r).toMatchObject({ ok: true, fileName: 'clip-20261103-140509.mp4', bytes: 5, fullProject: true });
    expect(h.saved).toEqual([{ name: 'clip-20261103-140509.mp4', size: 5 }]);
    await handle.cleaned;
    expect(pair.video.terminated && pair.audio.terminated).toBe(true);
    // ADR-0008 outcome item 2: the next export of the same mix (here audio-only) reuses the final gain.
    await start(h.project, { kind: 'audio', format: 'compressed' }, h.ctx);
    const next = h.pairs[1]!.audio.posted[0] as Extract<ToExportAudio, { type: 'exportAudio:start' }>;
    expect(next.gainDb).toBe(-2.1);
  });

  it('F-015.R6 an encoder error without a hide is COPY-error.export_failed; after a hide it is COPY-error.export_interrupted', async () => {
    const h = harness();
    const a = await start(h.project, balanced, h.ctx);
    lastPair(h).video.emit({ type: 'export:failed', error: { kind: 'encoder', message: 'EncodingError: x' } });
    expect(await a.result).toMatchObject({ ok: false, error: 'error.export_failed', detail: 'EncodingError: x' });
    const h2 = harness();
    const b = await start(h2.project, balanced, h2.ctx);
    h2.hide(true);
    h2.hide(false);
    lastPair(h2).video.emit({ type: 'export:failed', error: { kind: 'webgl', message: 'ContextLostError: lost' } });
    expect(await b.result).toMatchObject({ ok: false, error: 'error.export_interrupted' });
  });

  it('F-015 edge case ADR-0010 outcome item 10 a hidden page without progress for 5 s interrupts the export; the scratch clean-up runs behind the message', async () => {
    const h = harness();
    const handle = await start(h.project, balanced, h.ctx);
    const pair = lastPair(h);
    pair.video.emit({ type: 'export:progress', done: 10, total: 60 });
    h.hide(true);
    h.clock.t += 4999;
    h.tick();
    h.clock.t += 1;
    h.tick();
    expect(await handle.result).toEqual({ ok: false, error: 'error.export_interrupted' });
    expect(pair.video.posted.at(-1)).toEqual({ type: 'export:abort' });
    pair.video.emit({ type: 'export:aborted' });
    await handle.cleaned;
    expect(pair.video.terminated).toBe(true);
  });

  it('F-015.AC3 NFR-11 cancel reports at once, asks the worker to drop its scratch, then terminates both workers', async () => {
    const h = harness();
    const handle = await start(h.project, balanced, h.ctx);
    const pair = lastPair(h);
    await handle.cancel();
    expect(await handle.result).toEqual({ ok: false, error: 'cancelled' });
    expect(pair.video.terminated).toBe(false); // waiting for the abort answer (≤ 1.5 s)
    pair.video.emit({ type: 'export:aborted' });
    await handle.cleaned;
    expect(pair.video.terminated && pair.audio.terminated).toBe(true);
    // A fresh idle pair is ready for the next export (ADR-0003 §5).
    expect(h.pairs).toHaveLength(2);
  });

  it('F-015.AC12 progress events are monotone fractions with time remaining from 10 %', async () => {
    const h = harness();
    const handle = await start(h.project, balanced, h.ctx);
    const seen: number[] = [];
    handle.onProgress((v) => seen.push(v.fraction));
    for (const done of [5, 30, 20, 60]) {
      h.clock.t += 500;
      lastPair(h).video.emit({ type: 'export:progress', done, total: 60 });
    }
    expect(seen).toEqual([...seen].sort((x, y) => x - y));
    await handle.cancel();
  });
});

describe('MOD-Export output planning', () => {
  it('RULE-15 a size target uses constant bitrate where the encoder has it and the target-derived rate', () => {
    const project = proj({ clips: [video('a', 60)] });
    const p = planOutput(project, { kind: 'video', resolution: 480, quality: 'balanced', targetMB: 4 }, CAPS, true);
    expect(p.output.kind === 'video' && p.output.video.bitrateMode).toBe('constant');
    expect(p.output.kind === 'video' && p.output.targetBytes).toBe(4_000_000);
    expect(p.ext).toBe('mp4');
  });

  it('RULE-15 sound is included only when an unmuted voice has sound', () => {
    const muted = proj({ clips: [video('a', 2, { muted: true })] });
    const loud = proj({ clips: [video('a', 2)] });
    expect(hasSound(muted)).toBe(false);
    expect(hasSound(loud)).toBe(true);
  });

  it('RULE-16 audio-only is AAC in M4A at 192 kbps, or WAV; a GIF covers at most 15 s at its own size', () => {
    const project = proj({ clips: [video('a', 40)] });
    expect(planOutput(project, { kind: 'audio', format: 'compressed' }, CAPS, true).output).toMatchObject({
      kind: 'audio',
      container: 'm4a',
      audio: { codec: 'aac', bitrate: 192_000 },
    });
    expect(planOutput(project, { kind: 'audio', format: 'wav' }, CAPS, true).ext).toBe('wav');
    const gif = planOutput(project, { kind: 'gif', size: 480, rate: 15, from: 30_000_000 }, CAPS, false);
    expect(gif.output).toMatchObject({ kind: 'gif', frames: 150, from: 30_000_000 }); // 10 s left
    const full = planOutput(project, { kind: 'gif', size: 480, rate: 10, from: 0 }, CAPS, false);
    expect(full.output).toMatchObject({ frames: 150 }); // 15 s × 10
  });
});
