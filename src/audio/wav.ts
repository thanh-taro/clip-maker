// MOD-Audio — our own WAV writer (platform-mapping "Audio-only fallback": WAV always, own writer).
// Implements: RULE-16 Audio only — WAV, 16-bit, 48 kHz, stereo. Streaming-friendly: MOD-Export writes
// the header, then each block's bytes, so a 10-minute mix is never held as one buffer.
import { SAMPLE_RATE } from '../plan';

export const WAV_HEADER_BYTES = 44;
const CHANNELS = 2;
const BITS = 16;

/** The 44-byte RIFF/WAVE header for `frames` stereo 16-bit 48 kHz sample frames. */
export function wavHeader(frames: number): Uint8Array {
  const dataBytes = frames * CHANNELS * (BITS / 8);
  const b = new Uint8Array(WAV_HEADER_BYTES);
  const v = new DataView(b.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) b[at + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, CHANNELS, true);
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * CHANNELS * (BITS / 8), true); // byte rate
  v.setUint16(32, CHANNELS * (BITS / 8), true); // block align
  v.setUint16(34, BITS, true);
  ascii(36, 'data');
  v.setUint32(40, dataBytes, true);
  return b;
}

/** One float sample as a signed 16-bit value: round(x × 32767), limited to the 16-bit range. */
export const pcm16 = (x: number): number => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));

/** Interleaved little-endian 16-bit bytes of a stereo block. */
export function wavData(L: Float32Array, R: Float32Array): Uint8Array {
  const n = Math.min(L.length, R.length);
  const b = new Uint8Array(n * 4);
  const v = new DataView(b.buffer);
  for (let i = 0; i < n; i++) {
    v.setInt16(i * 4, pcm16(L[i]!), true);
    v.setInt16(i * 4 + 2, pcm16(R[i]!), true);
  }
  return b;
}

/** A whole WAV file (header + data) for a stereo mix. */
export function encodeWav(L: Float32Array, R: Float32Array): Uint8Array {
  const data = wavData(L, R);
  const out = new Uint8Array(WAV_HEADER_BYTES + data.length);
  out.set(wavHeader(data.length / 4), 0);
  out.set(data, WAV_HEADER_BYTES);
  return out;
}
