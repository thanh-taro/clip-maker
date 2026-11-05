// MOD-Codec — the start-up probe, the device check, the export grid and the format choice, against
// fake codec interfaces (the real engines run in tests/e2e/media-codec.spec.ts).
import { describe, expect, it } from 'vitest';
import {
  chooseAudioFormat,
  chooseVideoFormat,
  deviceCheck,
  h264Codec,
  normaliseAacDescription,
  pool,
  probeCapabilities,
  probeExportGrid,
  withNormalisedDescription,
  type Capabilities,
  type CodecApi,
  type EffectsCheck,
} from '../../src/codec';

/** A fake codec API: `accept(config)` decides; tracks the most calls in flight at once. */
function fakeApi(accept: (kind: string, config: { codec: string; width?: number }) => boolean) {
  let inFlight = 0;
  let peak = 0;
  let calls = 0;
  const checker = (kind: string) => ({
    async isConfigSupported(config: { codec: string; width?: number }) {
      calls++;
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return { supported: accept(kind, config) };
    },
  });
  const api = {
    VideoDecoder: checker('vdec'),
    VideoEncoder: checker('venc'),
    AudioDecoder: checker('adec'),
    AudioEncoder: checker('aenc'),
  } as unknown as CodecApi;
  return { api, peak: () => peak, calls: () => calls };
}

const effects =
  (ok: boolean, msPerFrame: number | null = null): EffectsCheck =>
  async () => ({ ok, msPerFrame });

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  decode: ['h264'],
  encode: { h264: true, vp9: true, vp8: true },
  audioEncode: { aac: true, opus: true },
  effects: { ok: true, msPerFrame: null },
  slowDevice: false,
  ms: 0,
  ...over,
});

describe('MOD-Codec probe', () => {
  it('ADR-0004 the start-up probe asks at most 4 isConfigSupported calls at once', async () => {
    const fake = fakeApi(() => true);
    await probeCapabilities(fake.api, effects(true));
    expect(fake.calls()).toBe(7 + 3 + 2);
    expect(fake.peak()).toBeLessThanOrEqual(4);
  });

  it('F-023.R1 the probe records decodable families, encoders and sound encoders', async () => {
    const fake = fakeApi((kind, c) => {
      if (kind === 'vdec') return c.codec.startsWith('avc1') || c.codec.startsWith('vp');
      if (kind === 'venc') return c.codec.startsWith('avc1');
      return c.codec === 'opus';
    });
    const r = await probeCapabilities(fake.api, effects(true));
    expect(r.decode).toEqual(['h264', 'vp8', 'vp9']);
    expect(r.encode).toEqual({ h264: true, vp9: false, vp8: false });
    expect(r.audioEncode).toEqual({ aac: false, opus: true });
    expect(r.slowDevice).toBe(false);
  });

  it('RULE-22 effects drawn below 30 fps mark a slow device but do not block', async () => {
    const slow = await probeCapabilities(fakeApi(() => true).api, effects(true, 40));
    expect(slow.slowDevice).toBe(true);
    expect(deviceCheck(slow)).toEqual([]);
    const fine = await probeCapabilities(fakeApi(() => true).api, effects(true, 30));
    expect(fine.slowDevice).toBe(false);
  });

  it('RULE-22 a browser without codec interfaces fails decode and encode, never throws', async () => {
    const r = await probeCapabilities({}, effects(false));
    expect(deviceCheck(r)).toEqual(['decode', 'encode', 'effects']);
  });

  it('RULE-22 a device that decodes but encodes no complete output format lacks encode', () => {
    expect(deviceCheck(caps({ encode: { h264: false, vp9: false, vp8: false } }))).toEqual(['encode']);
    expect(deviceCheck(caps({ audioEncode: { aac: false, opus: false } }))).toEqual(['encode']);
    expect(deviceCheck(caps({ decode: [] }))).toEqual(['decode']);
    expect(deviceCheck(caps())).toEqual([]);
  });
});

describe('MOD-Codec format choice', () => {
  it('RULE-15 MP4 H.264 + AAC is preferred when every encoder passes', () => {
    expect(chooseVideoFormat(caps(), true)).toMatchObject({ id: 'mp4-h264-aac', audio: 'aac', fallback: false });
  });

  it('RULE-15 without AAC (Gecko) the fallback MP4 H.264 + Opus is chosen and named', () => {
    const f = chooseVideoFormat(caps({ audioEncode: { aac: false, opus: true } }), true);
    expect(f).toMatchObject({ id: 'mp4-h264-opus', container: 'mp4', fallback: true });
  });

  it('RULE-15 without H.264 the order goes on to WebM VP9 then VP8', () => {
    expect(chooseVideoFormat(caps({ encode: { h264: false, vp9: true, vp8: true } }), true)?.id).toBe('webm-vp9-opus');
    expect(chooseVideoFormat(caps({ encode: { h264: false, vp9: false, vp8: true } }), true)?.id).toBe('webm-vp8-opus');
  });

  it('RULE-15 a project without sound takes the first video encoder and writes no audio track', () => {
    const f = chooseVideoFormat(caps({ audioEncode: { aac: false, opus: false } }), false);
    expect(f).toMatchObject({ id: 'mp4-h264-aac', audio: null, fallback: false });
  });

  it('RULE-22 a format dropped after a failed trial encode is left out for the session', () => {
    expect(chooseVideoFormat(caps(), true, new Set(['mp4-h264-aac']))?.id).toBe('mp4-h264-opus');
  });

  it('RULE-16 audio-only exports use AAC in M4A, else Opus in Ogg, else WAV', () => {
    expect(chooseAudioFormat(caps())).toEqual({ id: 'm4a-aac', fallback: false });
    expect(chooseAudioFormat(caps({ audioEncode: { aac: false, opus: true } }))).toEqual({
      id: 'ogg-opus',
      fallback: true,
    });
    expect(chooseAudioFormat(caps({ audioEncode: { aac: false, opus: false } }))).toEqual({
      id: 'wav',
      fallback: true,
    });
  });
});

describe('MOD-Codec export grid', () => {
  it('ADR-0004 the size × rate grid is probed for one codec, 20 calls, at most 4 at once', async () => {
    const fake = fakeApi((_k, c) => (c.width ?? 0) <= 1920);
    const grid = await probeExportGrid('h264', fake.api);
    expect(grid).toHaveLength(20);
    expect(fake.calls()).toBe(20);
    expect(fake.peak()).toBeLessThanOrEqual(4);
    expect(grid.filter((c) => c.supported).map((c) => c.short)).toEqual([
      480, 480, 480, 480, 720, 720, 720, 720, 1080, 1080, 1080, 1080,
    ]);
  });

  it('MOD-Codec H.264 levels follow size and rate', () => {
    expect(h264Codec('high', 1920, 1080, 30)).toBe('avc1.640028');
    expect(h264Codec('high', 3840, 2160, 60)).toBe('avc1.640034');
    expect(h264Codec('baseline', 848, 480, 30)).toBe('avc1.42E01F');
  });
});

describe('MOD-Codec helpers', () => {
  it('ADR-0004 pool keeps result order and never exceeds its limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await pool([5, 1, 4, 2, 3, 0, 6], 3, async (x) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, x));
      inFlight--;
      return x * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30, 0, 60]);
    expect(peak).toBe(3);
  });

  it('ADR-0004 an AAC ES_Descriptor description is reduced to its AudioSpecificConfig', () => {
    // WebKit's esds payload: ES_Descriptor(0x03) → DecoderConfigDescriptor(0x04) → DecSpecificInfo(0x05).
    const asc = [0x11, 0x90];
    const dsi = [0x05, 0x80, 0x80, 0x80, asc.length, ...asc];
    const dcd = [0x04, 0x80, 0x80, 0x80, 13 + dsi.length, 0x40, 0x15, 0, 0, 0, 0, 1, 0xf4, 0, 0, 1, 0xf4, 0, ...dsi];
    const sl = [0x06, 0x80, 0x80, 0x80, 1, 2];
    const esd = [0x03, 0x80, 0x80, 0x80, 3 + dcd.length + sl.length, 0, 1, 0, ...dcd, ...sl];
    expect([...(normaliseAacDescription(Uint8Array.from(esd)) ?? [])]).toEqual(asc);
    expect([...(normaliseAacDescription(Uint8Array.from(asc)) ?? [])]).toEqual(asc);
    const cfg = withNormalisedDescription({
      codec: 'mp4a.40.2',
      sampleRate: 48000,
      numberOfChannels: 2,
      description: Uint8Array.from(esd),
    });
    expect([...new Uint8Array(cfg.description as Uint8Array)]).toEqual(asc);
  });
});
