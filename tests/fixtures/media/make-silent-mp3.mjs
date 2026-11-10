// Writes silent-1s.mp3: our own tiny MP3 fixture (no encoder, no third-party content). 40 MPEG-1
// Layer III frames, 128 kbit/s, 44.1 kHz, mono, no padding (417 bytes each, 1152 samples = 1.045 s).
// Every side-info and main-data byte is zero, which decoders read as silence (part2_3_length = 0).
// Run: node tests/fixtures/media/make-silent-mp3.mjs
import { writeFileSync } from 'node:fs';

const FRAME = 417;
const FRAMES = 40;
const out = new Uint8Array(FRAME * FRAMES);
for (let i = 0; i < FRAMES; i++) out.set([0xff, 0xfb, 0x90, 0xc0], i * FRAME);
writeFileSync(new URL('./silent-1s.mp3', import.meta.url), out);
