// MOD-Audio windowed decoding in real engines (ADR-0008 §2/§6 and outcome items 3 and 5): a clip made in
// the page with a tone from 1.000 s in its sound track (AAC in MP4 with the encoder's priming in an edit
// list, or Opus in WebM), read in pieces by MOD-Container's sound feed and decoded, mapped to stereo and
// resampled by MOD-Audio's SoundBank. The tone starts on time (the priming is removed), keeps its pitch
// and level, and a window started by a seek gives the same samples.
import { expect, test } from '@playwright/test';
import type { ToneSpec } from '../harness/sound';
import { MEDIA_HARNESS_PORT } from './support/ports';

const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS);
  await expect(page.locator('#out')).toHaveText('ready');
});

const base: ToneSpec = { seconds: 3, onset: 1, freq: 440, amp: 0.25, codec: 'aac', sampleRate: 48_000 };
/** Half amplitude is reached 1/12 of a period after the onset (sin 30°). */
const HALF = 1 / 12 / 440;
const toneDb = 20 * Math.log10(0.25 / Math.SQRT2);

for (const spec of [
  { ...base, codec: 'aac', sampleRate: 48_000 },
  { ...base, codec: 'aac', sampleRate: 44_100, mono: true },
  { ...base, codec: 'opus', sampleRate: 48_000 },
] as ToneSpec[]) {
  const name = `${spec.codec} ${spec.sampleRate / 1000} kHz${spec.mono ? ' mono' : ''}`;
  test(`INV-02 ADR-0008 §2/§6 a clip’s sound decodes on time, at its pitch and level (${name})`, async ({ page }) => {
    test.setTimeout(60_000);
    const ok = await page.evaluate(([c, r]) => window.harness.sound.canEncode(c as 'aac' | 'opus', r as number), [
      spec.codec,
      spec.sampleRate,
    ] as const);
    test.skip(!ok, `no ${spec.codec} encoder at ${spec.sampleRate} Hz to make the clip in this engine`);
    const r = await page.evaluate((s) => window.harness.sound.decodeTone(s), spec);
    // The priming before time 0 (edit list) is removed: the tone starts at 1.000 s (± 1 ms).
    expect(Math.abs(r.onset - (spec.onset + HALF))).toBeLessThan(0.001);
    expect(r.beforeDb).toBeLessThan(-50);
    expect(Math.abs(r.toneDb - toneDb)).toBeLessThan(0.5);
    expect(Math.abs(r.freq - 440) / 440).toBeLessThan(0.002);
    expect(r.sideMax).toBeLessThan(1e-6); // the same on both sides (mono duplicated, equal stereo)
    // A window started by a seek decodes the same samples after its pre-roll.
    expect(r.seekDiff).toBeLessThan(spec.codec === 'opus' ? 0.01 : 1e-4);
  });
}
