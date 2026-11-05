// MOD-Audio WAV writer: RULE-16 audio-only WAV is 16-bit, 48 kHz, stereo.
import { describe, expect, it } from 'vitest';
import { encodeWav, pcm16, WAV_HEADER_BYTES, wavData, wavHeader } from '../../src/audio';

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

describe('MOD-Audio WAV', () => {
  it('RULE-16 the WAV header declares PCM, 16-bit, 48 kHz, stereo and the data size', () => {
    const h = wavHeader(48_000);
    const v = new DataView(h.buffer);
    expect(h.length).toBe(WAV_HEADER_BYTES);
    expect(ascii(h, 0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(36 + 48_000 * 4);
    expect(ascii(h, 8, 8)).toBe('WAVEfmt ');
    expect(v.getUint32(16, true)).toBe(16);
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(2); // stereo
    expect(v.getUint32(24, true)).toBe(48_000);
    expect(v.getUint32(28, true)).toBe(192_000); // byte rate
    expect(v.getUint16(32, true)).toBe(4); // block align
    expect(v.getUint16(34, true)).toBe(16);
    expect(ascii(h, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(192_000);
  });

  it('RULE-16 samples are interleaved little-endian 16-bit, rounded and limited to the 16-bit range', () => {
    const L = Float32Array.from([0, 1, -1, 0.5, 2]);
    const R = Float32Array.from([0.25, -0.5, 1e-6, -2, -0.000_02]);
    const b = encodeWav(L, R);
    expect(b.length).toBe(WAV_HEADER_BYTES + 5 * 4);
    const v = new DataView(b.buffer, WAV_HEADER_BYTES);
    const got = Array.from({ length: 10 }, (_, i) => v.getInt16(i * 2, true));
    expect(got).toEqual([0, 8192, 32767, -16383, -32767, 0, 16384, -32768, 32767, -1]);
    expect(pcm16(0.25)).toBe(Math.round(0.25 * 32767));
    expect(Array.from(wavData(L, R))).toEqual(Array.from(b.subarray(WAV_HEADER_BYTES)));
  });
});
