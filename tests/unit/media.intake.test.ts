// MOD-Media — batch intake (order, refusals, too many, too large, folders, progress, cancel) with a
// fake probe, the batch as one undo step through MOD-Project, and the refusal paths of the real
// probe that need no decoder (Node). Decoding paths run in tests/e2e/media-intake.spec.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { FrameRate, Source } from '../../src/core';
import { intakeBatch, SourceRegistry, workerProbe, type IntakeItem, type ProbeOutcome } from '../../src/media';
import { probeFile } from '../../src/media/probe';
import { addMedia, EMPTY_HISTORY, record, undoStep } from '../../src/project';
import { readsOf, virtualNamedFile } from '../support/blobs';
import { proj, video, videoSource } from '../support/project';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../fixtures/media/${name}`, import.meta.url)));
const fileOf = (bytes: Uint8Array | string, name: string): File =>
  new File([(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes) as Uint8Array<ArrayBuffer>], name);
const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};

/** A fake probe: a file named `*.ok` is a 2 s video, `*.bad` is refused as unsupported. */
function fakeProbe(log: string[] = [], gate?: (name: string) => Promise<void>) {
  return async (file: File, _rate: FrameRate, signal: AbortSignal): Promise<ProbeOutcome> => {
    log.push(file.name);
    await gate?.(file.name);
    signal.throwIfAborted();
    if (file.name.endsWith('.bad')) return { ok: false, reason: 'reason.unsupported' };
    const source: Omit<Source, 'id'> = { kind: 'video', name: file.name, bytes: file.size, duration: 2e6 };
    return {
      ok: true,
      probed: { source, details: { format: 'MP4', rotation: 0, scaled: false }, notices: [] },
    };
  };
}

const opts = (over: Partial<Parameters<typeof intakeBatch>[1]> = {}) => ({
  sourceCount: 0,
  rate: 30 as const,
  nextId: counter(),
  probe: fakeProbe(),
  ...over,
});

describe('MOD-Media intake batch', () => {
  it('F-001.R2 each file is checked on its own; accepted ones are kept in order, refused ones named', async () => {
    const files = [fileOf('a', 'one.ok'), fileOf('b', 'two.bad'), fileOf('c', 'three.ok')];
    const r = await intakeBatch(files, opts());
    expect(r.accepted.map((a) => [a.source.id, a.source.name])).toEqual([
      ['id-1', 'one.ok'],
      ['id-2', 'three.ok'],
    ]);
    expect(r.refused).toEqual([{ name: 'two.bad', reason: 'reason.unsupported' }]);
    expect(r.cancelled).toBe(false);
  });

  it('F-001.AC4 a 5 GB file is refused as too large before anything is read; the project is unchanged', async () => {
    const big = virtualNamedFile(fixture('mp4-faststart.mp4'), 5 * 1024 ** 3, 'huge.mp4');
    const log: string[] = [];
    const r = await intakeBatch([big], opts({ probe: fakeProbe(log) }));
    expect(r.refused).toEqual([{ name: 'huge.mp4', reason: 'reason.too_large' }]);
    expect(r.accepted).toEqual([]);
    expect(log).toEqual([]);
    expect(readsOf(big)).toEqual([]);
    // An empty batch result changes nothing: addMedia with no sources is no step.
    const p = proj({ clips: [video('A', 10)] });
    expect(
      addMedia(
        p,
        r.accepted.map((a) => a.source),
        0,
        counter(),
      ).project,
    ).toBe(p);
  });

  it('F-001.AC12 with 100 sources in the project another file is refused as too many', async () => {
    const log: string[] = [];
    const r = await intakeBatch([fileOf('x', 'more.ok')], opts({ sourceCount: 100, probe: fakeProbe(log) }));
    expect(r.refused).toEqual([{ name: 'more.ok', reason: 'reason.too_many' }]);
    expect(log).toEqual([]);
  });

  it('RULE-02 a batch that passes 100 sources keeps the first that fit and refuses the rest', async () => {
    const files = ['a.ok', 'b.ok', 'c.ok'].map((n) => fileOf('x', n));
    const r = await intakeBatch(files, opts({ sourceCount: 98 }));
    expect(r.accepted.map((a) => a.source.name)).toEqual(['a.ok', 'b.ok']);
    expect(r.refused).toEqual([{ name: 'c.ok', reason: 'reason.too_many' }]);
  });

  it('RULE-01 a dropped folder is ignored with the folder reason and never read', async () => {
    const items: IntakeItem[] = [{ folder: true, name: 'Trip' }, fileOf('x', 'a.ok')];
    const r = await intakeBatch(items, opts());
    expect(r.refused).toEqual([{ name: 'Trip', reason: 'reason.folder' }]);
    expect(r.accepted).toHaveLength(1);
  });

  it('F-001.R6 progress names each file and its position in the batch', async () => {
    const seen: string[] = [];
    await intakeBatch([fileOf('x', 'a.ok'), fileOf('y', 'b.ok')], {
      ...opts(),
      onProgress: (p) => seen.push(`${p.position}/${p.total} ${p.name} done ${p.done}`),
    });
    expect(seen).toEqual(['1/2 a.ok done 0', '2/2 b.ok done 1', '2/2  done 2']);
  });

  it('F-001.R6 cancel keeps finished files and drops the one being checked and the rest; one undo removes the batch', async () => {
    const ctl = new AbortController();
    const log: string[] = [];
    const gate = async (name: string) => {
      if (name === 'b.ok') ctl.abort(); // the user cancels while the second file is being checked
    };
    const files = ['a.ok', 'b.ok', 'c.ok', 'd.ok', 'e.ok'].map((n) => fileOf('x', n));
    const pending = intakeBatch(files, { ...opts({ probe: fakeProbe(log, gate) }), signal: ctl.signal });
    const r = await pending;
    expect(r.cancelled).toBe(true);
    expect(r.accepted.map((a) => a.source.name)).toEqual(['a.ok']);
    expect(log).toEqual(['a.ok', 'b.ok']);

    // RULE-13: the batch is applied as one step, and one undo removes it.
    const before = proj();
    const step = addMedia(
      before,
      r.accepted.map((a) => a.source),
      0,
      counter(),
    );
    expect(step.project.sources.map((s) => s.name)).toEqual(['a.ok']);
    const h = record(EMPTY_HISTORY, { before, after: step.project, changed: step.changed, gesture: null });
    expect(h.past).toHaveLength(1);
    expect(undoStep(h)?.step.before).toBe(before);
  });

  it('RULE-13 a batch of several accepted files is one undo step', async () => {
    const r = await intakeBatch(
      ['a.ok', 'b.ok', 'c.ok'].map((n) => fileOf('x', n)),
      opts(),
    );
    const before = proj();
    const step = addMedia(
      before,
      r.accepted.map((a) => a.source),
      0,
      counter(),
    );
    expect(step.project.clips).toHaveLength(3);
    const h = record(EMPTY_HISTORY, { before, after: step.project, changed: step.changed, gesture: null });
    expect(h.past).toHaveLength(1);
    expect(undoStep(h)?.step.before.clips).toHaveLength(0);
  });

  it('F-001 edge case the same file added twice becomes two sources', async () => {
    const f = fileOf('x', 'same.ok');
    const r = await intakeBatch([f, f], opts());
    expect(r.accepted.map((a) => a.source.id)).toEqual(['id-1', 'id-2']);
    expect(r.accepted[0]?.file).toBe(f);
  });
});

describe('MOD-Media probe (refusals without a decoder)', () => {
  it('F-001.AC3 a HEIC photo and a PDF renamed .mp4 are refused as unsupported', async () => {
    const heic = Uint8Array.from([0, 0, 0, 24, ...'ftypheic'.split('').map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
    expect(await probeFile(fileOf(heic, 'IMG_0001.HEIC'), 30)).toEqual({ ok: false, reason: 'reason.unsupported' });
    expect(await probeFile(fileOf('%PDF-1.7\n1 0 obj', 'clip.mp4'), 30)).toEqual({
      ok: false,
      reason: 'reason.unsupported',
    });
  });

  it('RULE-01 random bytes, empty files and subtitles are refused as unsupported', async () => {
    expect(await probeFile(fileOf(fixture('dmg-garbage.mp4'), 'x.mp4'), 30)).toMatchObject({
      reason: 'reason.unsupported',
    });
    expect(await probeFile(fileOf(new Uint8Array(0), 'empty.mov'), 30)).toMatchObject({ reason: 'reason.unsupported' });
    expect(await probeFile(fileOf('1\n00:00:01,000 --> 00:00:02,000\nHi\n', 'a.srt'), 30)).toMatchObject({
      reason: 'reason.unsupported',
    });
  });

  it('RULE-01 an MP4 without tracks or with damaged tables has no usable picture or sound', async () => {
    expect(await probeFile(fileOf(fixture('dmg-moov-missing.mp4'), 'cut.mp4'), 30)).toMatchObject({
      reason: 'reason.no_media',
    });
    expect(await probeFile(fileOf(fixture('dmg-bad-stsz.mp4'), 'bad.mp4'), 30)).toMatchObject({
      reason: 'reason.no_media',
    });
  });

  it('F-023.R2 a video the device cannot decode is refused with the codec reason', async () => {
    // Node has no VideoDecoder: exactly the "can't decode" case.
    expect(await probeFile(fileOf(fixture('mp4-faststart.mp4'), 'v.mp4'), 30)).toEqual({
      ok: false,
      reason: 'reason.codec',
    });
  });

  it('RULE-02 a photo whose header is over the limits is refused before it is decoded', async () => {
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(png.buffer).setUint32(16, 40_000);
    new DataView(png.buffer).setUint32(20, 100);
    expect(await probeFile(fileOf(png, 'wide.png'), 30)).toEqual({ ok: false, reason: 'reason.too_big_picture' });
  });

  it('F-001.R6 a cancelled probe stops with the signal', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(probeFile(fileOf(fixture('mp4-faststart.mp4'), 'v.mp4'), 30, ctl.signal)).rejects.toBeDefined();
  });
});

describe('MOD-Media registry', () => {
  it('INV-01 the registry keeps a reference to the file while it is retained, and forgets it on the last release', () => {
    const reg = new SourceRegistry();
    const file = fileOf('x', 'a.mp4');
    reg.add({
      source: videoSource('s1', 2),
      file,
      details: { format: 'MP4', rotation: 0, scaled: false },
      notices: [],
    });
    expect(reg.get('s1')?.file).toBe(file);
    reg.retain('s1');
    reg.release('s1');
    expect(reg.has('s1')).toBe(true);
    reg.release('s1');
    expect(reg.has('s1')).toBe(false);
  });
});

describe('MOD-Media intake leaks and failures (F-001 review)', () => {
  const bmp = () => ({ close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
  const photoOutcome = (bitmap: ImageBitmap): ProbeOutcome => ({
    ok: true,
    probed: {
      source: { kind: 'photo', name: 'p.png', bytes: 1, width: 1, height: 1 },
      details: { format: 'png', rotation: 0, scaled: false },
      notices: [],
      bitmap,
    },
  });

  it('F-001.R6 a picture decoded for a file that was cancelled meanwhile is freed', async () => {
    const ctl = new AbortController();
    const bitmap = bmp();
    const r = await intakeBatch([fileOf('x', 'p.png')], {
      ...opts(),
      signal: ctl.signal,
      probe: async () => {
        ctl.abort();
        return photoOutcome(bitmap);
      },
    });
    expect(r).toMatchObject({ accepted: [], cancelled: true });
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('F-001.R6 a probe reply that arrives after cancel has its pictures freed', async () => {
    const worker = new EventTarget() as EventTarget & { postMessage: ReturnType<typeof vi.fn> };
    worker.postMessage = vi.fn();
    const ctl = new AbortController();
    const pending = workerProbe(worker as unknown as Worker)(fileOf('x', 'p.png'), 30, ctl.signal);
    const { id } = worker.postMessage.mock.calls[0]![0] as { id: number };
    ctl.abort();
    await expect(pending).rejects.toBeDefined();
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'cancel', id });
    const bitmap = bmp();
    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'probed', id, outcome: photoOutcome(bitmap) } }));
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('F-001.R2 an unexpected failure refuses that file and the rest with a reason; finished files are kept', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await intakeBatch(
      ['a.ok', 'b.ok', 'c.ok'].map((n) => fileOf('x', n)),
      opts({
        probe: async (f, rate, signal) => {
          if (f.name === 'b.ok') throw new Error('worker crashed');
          return fakeProbe()(f, rate, signal);
        },
      }),
    );
    error.mockRestore();
    expect(r.accepted.map((a) => a.source.name)).toEqual(['a.ok']);
    expect(r.refused).toEqual([
      { name: 'b.ok', reason: 'reason.no_media' },
      { name: 'c.ok', reason: 'reason.no_media' },
    ]);
    expect(r.cancelled).toBe(false);
  });

  it('F-001 the no-sound notice carries the id of the source it is about', async () => {
    const r = await intakeBatch([fileOf('x', 'quiet.ok')], {
      ...opts(),
      probe: async (f, rate, signal) => {
        const o = await fakeProbe()(f, rate, signal);
        return o.ok ? { ok: true, probed: { ...o.probed, notices: ['notice.no_sound'] } } : o;
      },
    });
    expect(r.notices).toEqual([{ id: 'notice.no_sound', name: 'quiet.ok', sourceId: r.accepted[0]!.source.id }]);
  });
});
