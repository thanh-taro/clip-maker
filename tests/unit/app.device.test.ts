// MOD-App — the RULE-22 start-up device check (F-023) against injected devices: interface presence,
// the MOD-Codec probe and the engine's effects check are fakes (adapters/tests.md "Device support").
// The real engines run in tests/e2e/device-support.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptsMedia,
  CHECK_TIMEOUTS,
  device,
  dismissSlow,
  engineEffects,
  finishCheck,
  openingCheck,
  reportSlow,
  resetDeviceSession,
  slowNotice,
  unsupportedBody,
  type DeviceDeps,
  type EffectsRun,
} from '../../src/app/device';
import { audioFormatNote, videoFormatNote } from '../../src/app/export-format';
import { audioFormatOffers, chooseAudioFormat, chooseVideoFormat, type Capabilities } from '../../src/codec';
import { translate } from '../../src/copy';
import type { FromEngine, ToEngine } from '../../src/core';

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  decode: ['h264', 'vp9'],
  encode: { h264: true, vp9: true, vp8: true },
  audioEncode: { aac: true, opus: true },
  effects: { ok: true, msPerFrame: null },
  slowDevice: false,
  ms: 40,
  ...over,
});

const ALL = { videoDecoder: true, videoEncoder: true, webgl2: true };

const answer = (ok: boolean, slow = false): EffectsRun => ({
  drawn: Promise.resolve(ok),
  timed: Promise.resolve({ slow: ok && slow }),
});

/** A device; counts how often each part of the check was asked. */
function fakeDevice(o: { features?: Partial<typeof ALL>; caps?: Partial<Capabilities>; effects?: () => EffectsRun }) {
  const asked = { codecs: 0, effects: 0 };
  const deps: DeviceDeps = {
    features: () => ({ ...ALL, ...o.features }),
    codecs: async () => {
      asked.codecs++;
      return caps(o.caps);
    },
    effects: () => {
      asked.effects++;
      return (o.effects ?? (() => answer(true)))();
    },
  };
  return { deps, asked };
}

/** The whole start-up check, as `main()` runs it. */
async function open(deps: DeviceDeps) {
  const first = await openingCheck(deps);
  const { status: final, timed } = await finishCheck(deps);
  await timed;
  return { first, final };
}

beforeEach(() => resetDeviceSession());
afterEach(() => vi.useRealTimers());

describe('F-023 start-up check', () => {
  it('F-023.AC1 a browser that cannot decode video gets SCR-Unsupported with COPY-unsupported.missing_decode and accepts no media', async () => {
    const { deps, asked } = fakeDevice({ caps: { decode: [] } });
    const { first, final } = await open(deps);
    expect(first).toEqual({ status: 'unsupported', missing: ['decode'] });
    expect(final).toEqual(first);
    expect(acceptsMedia.value).toBe(false);
    expect(asked.effects).toBe(0);
    const body = unsupportedBody(['decode'], 'en-US');
    expect(body.text).toBe(
      translate('en-US', 'unsupported.body', { missing: translate('en-US', 'unsupported.missing_decode') }),
    );
    expect(body.items).toEqual(['playing video']);
  });

  it('F-023.AC1 RULE-22 without the video decoder interface the probe still runs, so every failure is listed', async () => {
    const { deps, asked } = fakeDevice({
      features: { videoDecoder: false },
      caps: { decode: [], encode: { h264: false, vp9: false, vp8: false } },
    });
    expect(await openingCheck(deps)).toEqual({ status: 'unsupported', missing: ['decode', 'encode'] });
    expect(asked.codecs).toBe(1);
    expect(acceptsMedia.value).toBe(false);
  });

  it('F-023.AC5 a browser that decodes but encodes no video output format lists COPY-unsupported.missing_encode', async () => {
    const { deps } = fakeDevice({ caps: { encode: { h264: false, vp9: false, vp8: false } } });
    const { final } = await open(deps);
    expect(final).toEqual({ status: 'unsupported', missing: ['encode'] });
    expect(unsupportedBody(['encode'], 'vi-VN').items).toEqual([translate('vi-VN', 'unsupported.missing_encode')]);
    expect(acceptsMedia.value).toBe(false);
  });

  it('F-023.AC6 effects drawn below the speed threshold open the editor with COPY-notice.slow_device; media can be added', async () => {
    const { deps } = fakeDevice({ effects: () => answer(true, true) });
    const { first, final } = await open(deps);
    expect(first).toEqual({ status: 'drawing-check' });
    expect(final).toEqual({ status: 'supported' });
    expect(acceptsMedia.value).toBe(true);
    expect(slowNotice.value).toBe(true);
  });

  it('F-023.AC8 a device that encodes video but no sound format opens the editor; audio-only offers WAV only', async () => {
    const noSound = { audioEncode: { aac: false, opus: false } };
    const { deps } = fakeDevice({ caps: noSound });
    const { final } = await open(deps);
    expect(final).toEqual({ status: 'supported' });
    expect(acceptsMedia.value).toBe(true);
    expect(audioFormatOffers(caps(noSound)).map((f) => f.id)).toEqual(['wav']);
    expect(audioFormatOffers(caps()).map((f) => f.id)).toEqual(['m4a-aac', 'wav']);
    // A video export without sound is still offered (no audio track).
    expect(chooseVideoFormat(caps(noSound), false)?.id).toBe('mp4-h264-aac');
  });

  it('RULE-22 media is accepted once the chain has drawn; the timed result only adds the notice later', async () => {
    let drawn: (ok: boolean) => void = () => undefined;
    let timed: (r: { slow: boolean }) => void = () => undefined;
    const run: EffectsRun = { drawn: new Promise((r) => (drawn = r)), timed: new Promise((r) => (timed = r)) };
    const { deps } = fakeDevice({ effects: () => run });
    expect(await openingCheck(deps)).toEqual({ status: 'drawing-check' });
    const finishing = finishCheck(deps);
    expect(acceptsMedia.value).toBe(false);
    drawn(true);
    const { status, timed: done } = await finishing;
    expect(status).toEqual({ status: 'supported' });
    expect(acceptsMedia.value).toBe(true);
    expect(slowNotice.value).toBe(false);
    timed({ slow: true });
    await done;
    expect(slowNotice.value).toBe(true);
    expect(device.value).toEqual({ status: 'supported' });
  });

  it('RULE-22 a device whose effect chain cannot be drawn is unsupported with COPY-unsupported.missing_effects', async () => {
    const { deps } = fakeDevice({ effects: () => answer(false) });
    const { first, final } = await open(deps);
    expect(first.status).toBe('drawing-check');
    expect(final).toEqual({ status: 'unsupported', missing: ['effects'] });
    expect(device.value).toEqual(final);
    expect(acceptsMedia.value).toBe(false);
  });

  it('F-023.R4 RULE-22 an engine that never answers counts as slow, never as unsupported: the editor opens', async () => {
    vi.useFakeTimers();
    const never: EffectsRun = { drawn: new Promise(() => undefined), timed: new Promise(() => undefined) };
    const { deps } = fakeDevice({ effects: () => never });
    await openingCheck(deps);
    const finishing = finishCheck(deps);
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUTS.drawnMs);
    const { status, timed } = await finishing;
    expect(status).toEqual({ status: 'supported' });
    expect(acceptsMedia.value).toBe(true);
    expect(slowNotice.value).toBe(true);
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUTS.timedMs);
    await timed;
  });

  it('F-023.R4 RULE-22 a timed result that never comes shows the slow-device notice after its timeout', async () => {
    vi.useFakeTimers();
    const { deps } = fakeDevice({
      effects: () => ({ drawn: Promise.resolve(true), timed: new Promise(() => undefined) }),
    });
    await openingCheck(deps);
    const { status, timed } = await finishCheck(deps);
    expect(status).toEqual({ status: 'supported' });
    expect(slowNotice.value).toBe(false);
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUTS.timedMs);
    await timed;
    expect(slowNotice.value).toBe(true);
  });

  it('RULE-22 no WebGL2 context is reported with the codec failures, in the order of the rule', async () => {
    const { deps, asked } = fakeDevice({ features: { webgl2: false }, caps: { decode: [] } });
    expect(await openingCheck(deps)).toEqual({ status: 'unsupported', missing: ['decode', 'effects'] });
    expect(asked.effects).toBe(0);
    const only = fakeDevice({ features: { webgl2: false } });
    expect(await openingCheck(only.deps)).toEqual({ status: 'unsupported', missing: ['effects'] });
  });

  it('RULE-22 the Gecko Android browser (no codec interfaces) gets SCR-Unsupported listing decode and encode', async () => {
    const { deps, asked } = fakeDevice({
      features: { videoDecoder: false, videoEncoder: false },
      caps: { decode: [], encode: { h264: false, vp9: false, vp8: false }, audioEncode: { aac: false, opus: false } },
    });
    expect(await openingCheck(deps)).toEqual({ status: 'unsupported', missing: ['decode', 'encode'] });
    expect(asked).toEqual({ codecs: 1, effects: 0 });
    const body = unsupportedBody(['decode', 'encode'], 'en-US');
    expect(body.text).toBe(
      'Missing: playing video and creating video files. Open Clip Maker in an up-to-date desktop or phone browser.',
    );
    expect(body.before).toBe('Missing:');
    expect(body.after).toBe('Open Clip Maker in an up-to-date desktop or phone browser.');
  });

  it('RULE-22 the unsupported text in vi-VN joins the list for the language', () => {
    const body = unsupportedBody(['decode', 'encode', 'effects'], 'vi-VN');
    expect(body.before).toBe('Thiếu:');
    expect(body.items).toEqual(['phát video', 'tạo tệp video', 'vẽ hiệu ứng']);
    expect(body.after).toBe('Hãy mở Clip Maker bằng trình duyệt mới trên máy tính hoặc điện thoại.');
    expect(body.text.startsWith('Thiếu: phát video')).toBe(true);
  });
});

describe('RULE-22 slow-device notice', () => {
  it('RULE-22 COPY-notice.slow_device shows at most once per session', () => {
    reportSlow();
    expect(slowNotice.value).toBe(true);
    dismissSlow();
    reportSlow();
    expect(slowNotice.value).toBe(false);
  });
});

describe('RULE-22 engine effects answer', () => {
  function fakeEngine() {
    const sent: ToEngine[] = [];
    const listeners: { message: ((e: MessageEvent<FromEngine>) => void)[]; error: (() => void)[] } = {
      message: [],
      error: [],
    };
    const port = {
      postMessage: (m: ToEngine) => sent.push(m),
      addEventListener: (type: 'message' | 'error', fn: never) => listeners[type].push(fn),
      removeEventListener: (type: 'message' | 'error', fn: never) => {
        listeners[type] = listeners[type].filter((f) => f !== fn) as never;
      },
    };
    const emit = (m: FromEngine) => listeners.message.forEach((f) => f({ data: m } as MessageEvent<FromEngine>));
    return { port, sent, emit, listeners };
  }

  it('RULE-22 the start-up effects check asks the engine worker: first "drawn", then the timed rate', async () => {
    const e = fakeEngine();
    const run = engineEffects(e.port);
    expect(e.sent).toEqual([{ type: 'engine:effectsCheck' }]);
    e.emit({ type: 'engine:frameShown', t: 0, frameIndex: 0, exact: true });
    e.emit({ type: 'engine:effectsDrawn', ok: true });
    expect(await run.drawn).toBe(true);
    e.emit({ type: 'engine:effects', ok: true, fps: 13.5, slow: true });
    expect(await run.timed).toEqual({ slow: true });
    expect(e.listeners.message).toHaveLength(0);
  });

  it('RULE-22 an engine worker that fails to start cannot draw effects', async () => {
    const e = fakeEngine();
    const run = engineEffects(e.port);
    e.listeners.error.forEach((f) => f());
    expect(await run.drawn).toBe(false);
  });
});

describe('F-023.R3 export format notes', () => {
  it('F-023.AC3 without the preferred sound encoder the export panel names the fallback format', () => {
    const noAac = caps({ audioEncode: { aac: false, opus: true } });
    expect(audioFormatNote(chooseAudioFormat(noAac), 'en-US')).toBe(
      translate('en-US', 'export.format_note', { format: 'Ogg', preferred: 'M4A' }),
    );
    expect(videoFormatNote(chooseVideoFormat(noAac, true), 'en-US')).toBe(
      translate('en-US', 'export.format_note', { format: 'MP4 (H.264 + Opus)', preferred: 'MP4 (H.264 + AAC)' }),
    );
    expect(videoFormatNote(chooseVideoFormat(noAac, true), 'vi-VN')).toBe(
      'Lưu dạng MP4 (H.264 + Opus). Trình duyệt này không tạo được MP4 (H.264 + AAC).',
    );
  });

  it('F-023.R3 a fallback container is named by its container; the preferred format needs no note', () => {
    const noH264 = caps({ encode: { h264: false, vp9: true, vp8: true } });
    expect(videoFormatNote(chooseVideoFormat(noH264, true), 'en-US')).toBe(
      "Saves as WebM. This browser can't make MP4.",
    );
    expect(videoFormatNote(chooseVideoFormat(caps(), true), 'en-US')).toBeNull();
    expect(audioFormatNote(chooseAudioFormat(caps()), 'en-US')).toBeNull();
    // No sound encoder: the compressed choice is left out, WAV is offered as itself (F-023.R5).
    expect(audioFormatNote(chooseAudioFormat(caps({ audioEncode: { aac: false, opus: false } })), 'en-US')).toBeNull();
  });
});
