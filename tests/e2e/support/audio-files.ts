// The user's own audio files for the e2e suite (F-011.R1, D-052: the tool ships no music, so every test
// that needs music picks or drops a file of its own). Made here, in the test process, with no encoder and
// no third-party content: silent MP3s of any length (as tests/fixtures/media/make-silent-mp3.mjs makes
// silent-1s.mp3) and WAVs of a steady tone. Never the owner's ~/clip-maker-fixtures.

export interface AudioPayload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ReturnType<typeof Buffer.from>;
}

const S = 1_000_000;
/** Node's `Buffer.from(Uint8Array)` (a copy); the suite's minimal typings declare only the array form. */
const toBuffer = (b: Uint8Array): ReturnType<typeof Buffer.from> =>
  (Buffer.from as unknown as (x: Uint8Array) => ReturnType<typeof Buffer.from>)(b);

/**
 * A silent MP3 exactly `seconds` long (a multiple of 24 ms): MPEG-1 Layer III frames at 128 kbit/s,
 * 48 kHz, mono, no padding (384 bytes and 1152 samples = 24 ms each). Every side-info and main-data byte
 * is zero, which decoders read as silence.
 */
export function silentMp3(name: string, seconds: number): AudioPayload {
  const FRAME = 384;
  const frames = Math.round(seconds / 0.024);
  const out = new Uint8Array(FRAME * frames);
  for (let i = 0; i < frames; i++) out.set([0xff, 0xfb, 0x94, 0xc0], i * FRAME);
  return { name, mimeType: 'audio/mpeg', buffer: toBuffer(out) };
}

/** A 16-bit 48 kHz stereo WAV of a steady `freq` Hz tone at amplitude `amp`, `seconds` long. */
export function wavTone(name: string, seconds: number, freq = 220, amp = 0.25): AudioPayload {
  const n = Math.round(seconds * 48_000);
  const b = new Uint8Array(44 + n * 4);
  const v = new DataView(b.buffer);
  const ascii = (s: string, at: number) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii('RIFF', 0);
  v.setUint32(4, 36 + n * 4, true);
  ascii('WAVEfmt ', 8);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, 48_000, true);
  v.setUint32(28, 48_000 * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  ascii('data', 36);
  v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    const x = Math.round(amp * 32767 * Math.sin((2 * Math.PI * freq * i) / 48_000));
    v.setInt16(44 + i * 4, x, true);
    v.setInt16(46 + i * 4, x, true);
  }
  return { name, mimeType: 'audio/wav', buffer: toBuffer(b) };
}

/**
 * An audio source of the user's (ENT-Source) for projects a test loads whole through `appHarness.load()`,
 * where only the timeline matters: it is listed and bounds its clips, but its file is not in the session
 * (nothing of it is heard).
 */
export function songSource(id = 'song', seconds = 60) {
  return {
    id,
    kind: 'audio' as const,
    name: `${id}.mp3`,
    bytes: 1000,
    duration: Math.round(seconds * S),
    hasSound: true,
  };
}
