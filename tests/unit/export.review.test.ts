// MOD-Export / MOD-Scratch / MOD-Container fixes from the E5 code review and security audit: GIF
// progress, liveness while waiting for the sound, cancel during the hand-over, dead workers, the abort
// gate and discard retry, calibration ids, size-target pre-checks, quota, Web Locks, the encoder restart
// after a stall, the shared gain, missing sound, library names in outputs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endSampleOf, pcmSource, type SoundSource } from '../../src/audio';
import { NeutralSink, oggCrc } from '../../src/container';
import type { Calibration, FromExport, ToExport, ToExportAudio } from '../../src/core';
import {
  estimate,
  lossyAudio,
  mixKey,
  planOutput,
  start,
  wavAudio,
  type AudioCodecs,
  type EncodedOut,
} from '../../src/export';
import { AUDIO_STALL_MS, drain } from '../../src/export/audio-pass';
import { AbortGate, encodeFrames, runTargetPasses, sinkError, type EncoderLike } from '../../src/export/control';
import { StallError, type EncodedVideo } from '../../src/export/encoder';
import { soundFrom, SOUND_STALL_MS } from '../../src/export/pipeline';
import { voices } from '../../src/plan';
import { initScratch, openScratchSink, Scratch, type ScratchEnv, type StorageLike } from '../../src/scratch';
import { balanced, CAPS, FakeLocks, harness, lastPair } from '../support/export-session';
import { proj, video } from '../support/project';

const gif = { kind: 'gif', size: 320, rate: 15, from: 0 } as const;

describe('MOD-Export session — review fixes (E5)', () => {
  it('F-015.AC12 RULE-16 GIF progress reaches the panel and counts as liveness (no false interruption)', async () => {
    const h = harness();
    const handle = await start(h.project, gif, h.ctx);
    const seen: number[] = [];
    handle.onProgress((v) => seen.push(v.fraction));
    h.hide(true);
    for (let i = 1; i <= 12; i++) {
      h.clock.t += 1000;
      lastPair(h).video.emit({ type: 'export:progress', done: i, total: 30 });
      h.tick();
    }
    expect(seen.length).toBe(12);
    expect(seen.at(-1)!).toBeGreaterThan(0.3);
    let settled = false;
    void handle.result.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await handle.cancel();
  });

  it('ADR-0010 outcome item 10 hide and return while the video worker waits for the sound does not interrupt (liveness beats)', async () => {
    const h = harness();
    const handle = await start(h.project, balanced, h.ctx);
    const pair = lastPair(h);
    pair.video.emit({ type: 'export:progress', done: 60, total: 60 }); // all frames done; waiting for the sound
    h.hide(true);
    for (let i = 0; i < 8; i++) {
      h.clock.t += 1000;
      pair.video.emit({ type: 'export:alive' });
      pair.audio.emit({ type: 'exportAudio:alive' });
      h.tick();
    }
    h.hide(false);
    for (let i = 0; i < 4; i++) {
      h.clock.t += 1000;
      pair.audio.emit({ type: 'exportAudio:progress', done: i, total: 10 });
      h.tick();
    }
    let settled = false;
    void handle.result.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await handle.cancel();
  });

  it('NFR-11 a cancel while the finished file is being opened wins: nothing is saved', async () => {
    let open: () => void = () => undefined;
    const fileGate = new Promise<void>((r) => (open = r));
    const h = harness({ storage: true, locks: true, fileGate });
    const handle = await start(h.project, balanced, h.ctx);
    expect(handle.scratchFile).not.toBeNull();
    lastPair(h).video.emit({
      type: 'export:done',
      bytes: 5,
      blob: null,
      stats: {},
      trim: null,
    } as unknown as FromExport);
    await handle.cancel();
    open();
    await new Promise((r) => setTimeout(r, 0));
    expect(await handle.result).toEqual({ ok: false, error: 'cancelled' });
    expect(h.saved).toEqual([]);
  });

  it('F-015.R6 a worker that dies (error event) fails the export with COPY-error.export_failed', async () => {
    const h = harness();
    const handle = await start(h.project, balanced, h.ctx);
    lastPair(h).audio.dispatchEvent(new Event('error'));
    expect(await handle.result).toMatchObject({ ok: false, error: 'error.export_failed' });
  });

  it('F-015.R6 an export worker that never answers fails after 30 s while visible', async () => {
    const h = harness();
    const handle = await start(h.project, balanced, h.ctx);
    h.clock.t += 29_999;
    h.tick();
    h.clock.t += 1;
    h.tick();
    expect(await handle.result).toMatchObject({ ok: false, error: 'error.export_failed' });
  });

  it('NFR-11 INV-01 a cancelled export’s files are deleted again after a short delay when the first delete failed', async () => {
    const h = harness({ storage: true, locks: true, failFirstRemove: true });
    const handle = await start(h.project, balanced, h.ctx);
    const f = handle.scratchFile!;
    h.files.set(f.name, new Uint8Array(4));
    h.files.set(f.spill, new Uint8Array(4));
    await handle.cancel();
    lastPair(h).video.emit({ type: 'export:aborted' });
    await handle.cleaned;
    expect([...h.files.keys()]).toEqual([]);
  });

  it('F-019.R7 build-spec Q32 the room check counts the spill file; a quota error from the sink is COPY-error.no_space', async () => {
    const h = harness({ storage: true, locks: true });
    const asked: number[] = [];
    const real = h.ctx.scratch.hasRoom.bind(h.ctx.scratch);
    h.ctx.scratch.hasRoom = (b: number) => (asked.push(b), real(b));
    const handle = await start(h.project, balanced, h.ctx);
    const job = (lastPair(h).video.posted[0] as Extract<ToExport, { type: 'export:start' }>).job;
    const out = job.output.kind === 'video' ? job.output : null;
    const nominal = planOutput(h.project, balanced, CAPS, true).nominalBytes;
    expect(asked[0]).toBeCloseTo(nominal * 1.3 + (out!.video.bitrate * 2) / 8, 0);
    expect(sinkError(new DOMException('full', 'QuotaExceededError')).kind).toBe('no_space');
    expect(sinkError(new Error('x')).kind).toBe('sink');
    lastPair(h).video.emit({ type: 'export:failed', error: { kind: 'no_space', message: 'QuotaExceededError: full' } });
    expect(await handle.result).toMatchObject({ ok: false, error: 'error.no_space' });
  });

  it('INV-01 without Web Locks no scratch file is used (the memory sink): no lock could protect it from a sweep', async () => {
    const h = harness({ storage: true, locks: false });
    const handle = await start(h.project, balanced, h.ctx);
    expect(handle.scratchFile).toBeNull();
    const job = (lastPair(h).video.posted[0] as Extract<ToExport, { type: 'export:start' }>).job;
    expect(job.sink).toEqual({ kind: 'memory' });
    await handle.cancel();
  });

  it('ADR-0010 outcome item 10 rule (c) a sound encoder error after a hide is COPY-error.export_interrupted', async () => {
    const h = harness();
    const handle = await start(h.project, balanced, h.ctx);
    h.hide(true);
    h.hide(false);
    lastPair(h).audio.emit({ type: 'exportAudio:failed', kind: 'encoder', message: 'EncodingError: x' });
    expect(await handle.result).toMatchObject({ ok: false, error: 'error.export_interrupted' });
  });

  it('ADR-0008 outcome item 2 a WAV export takes the mix’s shared final gain', async () => {
    const h = harness();
    h.ctx.gains.set(mixKey(h.project), -2.5);
    await start(h.project, { kind: 'audio', format: 'wav' }, h.ctx);
    const a = lastPair(h).audio.posted[0] as Extract<ToExportAudio, { type: 'exportAudio:start' }>;
    expect(a).toMatchObject({ codec: 'pcm16', gainDb: -2.5 });
  });

  it('ADR-0008 §6 a sounding source given no PCM is decoded: the export-audio worker gets the sound feed from the export worker', async () => {
    const h = harness();
    await start(h.project, balanced, { ...h.ctx, pcm: [] });
    const a = lastPair(h).audio.posted[0] as Extract<ToExportAudio, { type: 'exportAudio:start' }>;
    const v = lastPair(h).video.posted[0] as Extract<ToExport, { type: 'export:start' }>;
    expect(a.pcm).toEqual([]);
    expect(a.feed).toBeTruthy();
    expect(v.job.soundFeed).toBeTruthy();
  });
});

describe('MOD-Export calibrations and the size target (ADR-0010 outcome items 7–8)', () => {
  /** A 2 s calibration (one GOP) delivering `kbps`. */
  const cal = (kbps: number): Calibration => {
    const bytes = (kbps * 1000 * 2) / 8;
    return { keyBytes: bytes / 15, keyCount: 1, deltaBytes: bytes - bytes / 15, deltaCount: 59 };
  };
  const calibrateMsg = (h: ReturnType<typeof harness>) =>
    lastPair(h).video.posted.at(-1) as Extract<ToExport, { type: 'export:calibrate' }>;
  const answer = async (h: ReturnType<typeof harness>, kbps: number) => {
    await new Promise((r) => setTimeout(r, 0));
    const m = calibrateMsg(h);
    lastPair(h).video.emit({ type: 'export:calibration', id: m.id, cal: cal(kbps) });
    return m.job.output.kind === 'video' ? m.job.output.video : null;
  };

  it('MOD-Export a stale calibration answer never settles a newer request; taking the workers rejects pending ones', async () => {
    const h = harness();
    const w = h.ctx.workers;
    const job = {
      project: h.project,
      media: [],
      looks: {},
      texts: {},
      output: planOutput(h.project, balanced, CAPS, true).output,
    };
    const a = w.calibrate(job);
    const b = w.calibrate(job);
    await new Promise((r) => setTimeout(r, 0));
    const first = calibrateMsg(h);
    lastPair(h).video.emit({ type: 'export:calibration', id: first.id, cal: cal(100) });
    expect(await a).toEqual(cal(100));
    lastPair(h).video.emit({ type: 'export:calibration', id: first.id, cal: cal(999) }); // a stale repeat
    w.take();
    await expect(b).rejects.toThrow(/cancelled/);
  });

  it('RULE-15 D-020 a lower resolution is offered only after its pre-check passes; the smallest target uses 480’s delivered rate', async () => {
    const h = harness({ seconds: 60 });
    const settings = { kind: 'video', resolution: 720, quality: 'balanced', targetMB: 8 } as const;
    // 8 MB over 60 s ≈ 860 kbps: above 720's 600 kbps floor, but this content needs 1,400 kbps at 720.
    const p = estimate(h.project, settings, h.ctx);
    expect((await answer(h, 1400))!.height).toBe(720);
    expect((await answer(h, 700))!.height).toBe(480);
    expect(await p).toMatchObject({ reachable: false, suggestedResolution: 480 });
    const q = estimate(h.project, { ...settings, targetMB: 6 }, h.ctx);
    await answer(h, 1400); // 720 fails its pre-check
    await answer(h, 900); // 480 too: 900 kbps is 480's effective floor here
    const r = await q;
    expect(r.reachable).toBe(false);
    expect(r.suggestedResolution).toBeUndefined();
    // 900 kbps × 60 s + 128 kbps sound + headroom needs 9 whole MB (D-020).
    expect(r.smallestTargetMB).toBe(9);
  });

  it('F-015.AC10 RULE-15 an overshooting pass gets one corrective pass; a file still over the target is never handed over', async () => {
    const ok = await runTargetPasses({
      bitrate: 1_000_000,
      targetBytes: 1_000_000,
      reset: () => undefined,
      pass: async (b) =>
        b === 1_000_000 ? { bytes: 1_100_000, videoBytes: 1_000_000 } : { bytes: 950_000, videoBytes: 850_000 },
    });
    expect(ok.bitrates).toEqual([1_000_000, Math.floor(((1_000_000 * 900_000) / 1_000_000) * 0.97)]);
    await expect(
      runTargetPasses({
        bitrate: 1_000_000,
        targetBytes: 1_000_000,
        reset: () => undefined,
        pass: async () => ({ bytes: 1_200_000, videoBytes: 1_100_000 }),
      }),
    ).rejects.toMatchObject({ kind: 'over_target' });
  });
});

describe('MOD-Export encoder restart after a stall (ADR-0010 outcome item 2)', () => {
  /** A fake encoder: emits each frame's packet at once; `stallAt` throws a stall before that frame. */
  function fakeEncoders(stallAt: number[]) {
    let made = 0;
    return {
      get made() {
        return made;
      },
      create: (onPacket: (e: EncodedVideo) => void): EncoderLike => {
        const n = made++;
        let first = true;
        let k = 0;
        return {
          async encode(frame: { close(): void; k?: number }, key: boolean) {
            k = (frame as unknown as { k: number }).k;
            if (stallAt[n] !== undefined && k === stallAt[n]) throw new StallError(20_000);
            onPacket({
              packet: { data: new Uint8Array([k]), timestamp: k / 30, duration: 1 / 30, key },
              ...(first ? { config: { codec: `avc-${n}` } } : {}),
            });
            first = false;
          },
          async flush() {},
          close() {},
        };
      },
    };
  }

  it('ADR-0010 outcome item 2 on a stall the encoder is re-created and encoding restarts at the GOP not yet delivered; every frame is in the file once', async () => {
    const enc = fakeEncoders([37]);
    const delivered: EncodedVideo[] = [];
    let rewinds = 0;
    const r = await encodeFrames({
      frames: 90,
      gop: 30,
      render: async (k) => ({ k, close() {} }),
      createEncoder: enc.create,
      frameOf: (e) => Math.round(e.packet.timestamp * 30),
      deliver: (e) => void delivered.push(e),
      rewind: async () => void rewinds++,
    });
    expect(r.restarts).toBe(1);
    expect(rewinds).toBe(1);
    expect(enc.made).toBe(2);
    expect(delivered.map((e) => Math.round(e.packet.timestamp * 30))).toEqual(Array.from({ length: 90 }, (_, k) => k));
    expect(delivered.filter((e) => e.packet.key).map((e) => Math.round(e.packet.timestamp * 30))).toEqual([0, 30, 60]);
    expect(delivered.filter((e) => e.config).map((e) => e.config!.codec)).toEqual(['avc-0']);
  });

  it('ADR-0010 outcome item 2 when the re-created encoders stall too, the export fails', async () => {
    const enc = fakeEncoders([5, 5, 5]);
    await expect(
      encodeFrames({
        frames: 30,
        gop: 30,
        render: async (k) => ({ k, close() {} }),
        createEncoder: enc.create,
        frameOf: (e) => Math.round(e.packet.timestamp * 30),
        deliver: () => undefined,
        rewind: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(StallError);
  });
});

describe('MOD-Export dead or silent workers (fake timers)', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('F-015.R6 a sound codec whose queue never moves fails after 20 s instead of hanging', async () => {
    const target = new EventTarget();
    const p = drain(
      target,
      () => 100,
      () => null,
    );
    const check = expect(p).rejects.toThrow(/AudioStall/);
    await vi.advanceTimersByTimeAsync(AUDIO_STALL_MS + 1000);
    await check;
  });

  it('F-015.R6 the export worker stops waiting for a silent export-audio worker after 30 s', async () => {
    const { port1, port2 } = new MessageChannel();
    const sound = soundFrom(port1);
    const check = expect(sound.watchdog).rejects.toMatchObject({ kind: 'audio' });
    await vi.advanceTimersByTimeAsync(SOUND_STALL_MS + 1000);
    await check;
    sound.stop();
    port1.close();
    port2.close();
  });
});

describe('MOD-Export abort gate (ADR-0010 outcome item 10)', () => {
  it('NFR-11 an abort before the sink opens is remembered: the opener drops the sink', async () => {
    const gate = new AbortGate();
    await gate.abort();
    expect(gate.register(async () => undefined)).toBe(false);
  });

  it('NFR-11 after export:done the finished file is no longer discarded by a late abort', async () => {
    const gate = new AbortGate();
    let dropped = 0;
    gate.register(async () => void dropped++);
    gate.clear();
    await gate.abort();
    expect(dropped).toBe(0);
    const g2 = new AbortGate();
    g2.register(async () => void dropped++);
    await g2.abort();
    expect(dropped).toBe(1);
  });
});

/** A modelled lossy codec: decoded = input × overshoot; counts decodes (measured passes). */
function modelCodec(overshoot: number) {
  const c = {
    encodes: 0,
    decodes: 0,
    async encode(_config: AudioEncoderConfig, blocks: AsyncIterable<[Float32Array, Float32Array]>) {
      c.encodes++;
      const packets: EncodedOut[] = [];
      for await (const [L, R] of blocks)
        packets.push({
          data: new Uint8Array(new Float32Array([...L, ...R]).buffer),
          timestamp: 0,
          duration: 0,
          key: true,
        });
      return { packets, config: { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2 } };
    },
    async decode(_c: AudioDecoderConfig, packets: readonly EncodedOut[], onBlock: (p: Float32Array[]) => void) {
      c.decodes++;
      for (const p of packets) {
        const f = new Float32Array(p.data.slice().buffer);
        const n = f.length / 2;
        onBlock([f.slice(0, n).map((x) => x * overshoot), f.slice(n).map((x) => x * overshoot)]);
      }
    },
  };
  return c as typeof c & AudioCodecs;
}

function loudJob(seconds = 1) {
  const project = proj({ clips: [video('a', seconds)] });
  const n = 48000 * (seconds + 1);
  const L = Float32Array.from({ length: n }, (_, i) => 1.4 * Math.sin((2 * Math.PI * 997 * i) / 48000));
  const sources = new Map<string, SoundSource>([['src-a', pcmSource(L, L.slice())]]);
  return { voices: voices(project), bank: (id: string) => sources.get(id), endSample: endSampleOf(project) };
}

describe('MOD-Export verify-and-trim in the export-audio pass (ADR-0008 outcome item 2)', () => {
  const aac = { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2 };

  it('ADR-0008 outcome item 2 the fallback encode is not measured', async () => {
    const codec = modelCodec(1);
    // A codec that ignores the gain: its decoded peak stays at +6 dBTP, so the fallback is taken.
    codec.decode = async (_c, _p, onBlock) => {
      codec.decodes++;
      onBlock([new Float32Array([2, -2, 2]), new Float32Array([2, -2, 2])]);
    };
    const r = await lossyAudio(loudJob(), aac, 2112, codec, null);
    expect(r.trim.fallback).toBe(true);
    expect(codec.encodes).toBe(4);
    expect(codec.decodes).toBe(3);
  });

  it('ADR-0008 outcome item 2 a reused gain is measured; above −1.0 dBTP the trim runs again and the result replaces the shared gain', async () => {
    const codec = modelCodec(10 ** (4 / 20)); // +4 dB overshoot: a −1 dB shared gain is not enough
    const r = await lossyAudio(loudJob(), aac, 2112, codec, -1);
    expect(r.trim.peakDb!).toBeLessThanOrEqual(-1.0);
    expect(r.trim.gainDb).toBeLessThan(-1);
    expect(r.trim.passes).toBeGreaterThan(1);
  });

  it('F-016.AC2 ADR-0008 outcome item 2 the WAV takes the shared gain (−6.02 dB halves every sample)', async () => {
    const collect = async (gainDb: number) => {
      const parts: Uint8Array[] = [];
      await wavAudio(loudJob(), (b) => void parts.push(b), undefined, gainDb);
      const v = new DataView(parts[0]!.buffer);
      return Array.from({ length: 200 }, (_, i) => v.getInt16(4000 + i * 4, true));
    };
    const full = await collect(0);
    const half = await collect(20 * Math.log10(0.5));
    half.forEach((x, i) => expect(Math.abs(x - full[i]! / 2)).toBeLessThanOrEqual(2));
  });
});

describe('MOD-Scratch review fixes', () => {
  it('ADR-0010 outcome item 6 the scratch directory is tool-specific and only our names are opened', async () => {
    const storage: StorageLike = {
      estimate: async () => ({}),
      getDirectory: async () => {
        throw new Error('must not be reached');
      },
    };
    await expect(openScratchSink('../../evil', storage)).rejects.toThrow(/SecurityError/);
    await expect(openScratchSink('notes.txt', storage)).rejects.toThrow(/SecurityError/);
  });

  it('F-015.AC14 initScratch takes the session lock, then sweeps an abandoned session’s files', async () => {
    const files = new Set(['export-dead1-a.part', 'export-me1-b.part']);
    const locks = new FakeLocks();
    const env: ScratchEnv = {
      storage: {
        estimate: async () => ({}),
        getDirectory: async () => ({
          getDirectoryHandle: async () => ({
            async *entries() {
              for (const n of [...files]) yield [n, { kind: 'file' }] as [string, { kind: string }];
            },
            getFileHandle: async () => {
              throw new Error('unused');
            },
            removeEntry: async (n: string) => void files.delete(n),
          }),
        }),
      },
      locks,
      session: 'me1',
      now: () => 0,
      setTimeout: () => 0,
      clearTimeout: () => undefined,
      revokeObjectURL: () => undefined,
    };
    const { scratch, log } = await initScratch(env);
    expect(scratch).toBeInstanceOf(Scratch);
    expect(log.deleted).toEqual(['export-dead1-a.part']);
    expect(locks.held.has('clipmaker-scratch:me1')).toBe(true);
  });
});

describe('MOD-Container no library names in outputs (F-015.AC4, RULE-15 Contents)', () => {
  const ascii = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
  const collect = () => {
    const file = new Uint8Array(400);
    return {
      file,
      sink: { write: (c: Uint8Array, at: number) => void file.set(c, at), close: () => undefined },
    };
  };
  const has = (b: Uint8Array, s: string) => new TextDecoder('latin1').decode(b).includes(s);

  it('F-015.AC4 the hdlr names and the Pascal compressor name are blanked in place, also across a write boundary', async () => {
    const { file, sink } = collect();
    const n = new NeutralSink(sink);
    const name = 'Mediabunny v1.65.0';
    const comp = new Uint8Array(32);
    comp[0] = name.length;
    comp.set(ascii(name), 1);
    const hdlr = ascii('xxxxhdlr\0\0\0\0MediabunnyVideoHandler\0yy');
    await n.write(hdlr.subarray(0, 18), 0); // "Mediab" ends this write
    await n.write(hdlr.subarray(18), 18);
    await n.write(comp, 100);
    expect(has(file, 'Mediabunny')).toBe(false);
    expect(has(file, 'Handler')).toBe(false);
    expect(file[100]).toBe(0); // the compressor name's length byte
    expect(file.subarray(0, 8)).toEqual(ascii('xxxxhdlr'));
    expect(file[file.length - 1]).toBe(0);
  });

  it('F-015.AC4 the Ogg vendor string is blanked and its page CRC recomputed', async () => {
    const vendor = ascii('Mediabunny v1.65.0');
    const body = new Uint8Array([...ascii('OpusTags'), vendor.length, 0, 0, 0, ...vendor, 0, 0, 0, 0]);
    const header = new Uint8Array(27 + 1);
    header.set(ascii('OggS'));
    header[26] = 1;
    header[27] = body.length;
    const page = new Uint8Array([...header, ...body]);
    const out = new Uint8Array(page.length);
    const n = new NeutralSink({ write: (c, at) => void out.set(c, at), close: () => undefined }, true);
    await n.write(page, 0);
    expect(has(out, 'Mediabunny')).toBe(false);
    const crc = new DataView(out.buffer).getUint32(22, true);
    const zeroed = out.slice();
    zeroed.fill(0, 22, 26);
    expect(crc).toBe(oggCrc(zeroed));
  });
});
