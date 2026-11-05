// MOD-Codec decoder setup (MOD-Codec "createVideoDecoder" with the hardware/software retry), as the
// engine's preview decoders and the export's sequential reader use it.
import { describe, expect, it } from 'vitest';
import { resolveVideoDecoderConfig } from '../../src/codec';

const fake = (ok: (c: VideoDecoderConfig) => boolean) => {
  const asked: VideoDecoderConfig[] = [];
  return {
    asked,
    api: {
      VideoDecoder: {
        isConfigSupported: async (c: VideoDecoderConfig) => {
          asked.push(c);
          return { supported: ok(c) };
        },
      },
    },
  };
};

describe('MOD-Codec video decoder configuration', () => {
  it('MOD-Codec a supported config is used as given, without the container rotation', async () => {
    const f = fake(() => true);
    const c = await resolveVideoDecoderConfig({ codec: 'avc1.42001e', rotation: 90 } as VideoDecoderConfig, f.api);
    expect(c).toEqual({ codec: 'avc1.42001e' });
  });

  it('MOD-Codec when the default is refused, software decoding is tried', async () => {
    const f = fake((c) => c.hardwareAcceleration === 'prefer-software');
    const c = await resolveVideoDecoderConfig({ codec: 'hvc1.1.6.L93.B0' }, f.api);
    expect(c).toEqual({ codec: 'hvc1.1.6.L93.B0', hardwareAcceleration: 'prefer-software' });
    expect(f.asked).toHaveLength(2);
  });

  it('RULE-22 a source no decoder supports gets no config (that source alone is refused)', async () => {
    expect(await resolveVideoDecoderConfig({ codec: 'x' }, fake(() => false).api)).toBeNull();
  });
});
