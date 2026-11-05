// MOD-Codec in real engines (ADR-0004 outcome, ADR-0016 §3): the start-up probe, the device check,
// the lazy export grid and the trial encodes, on the media harness (tests/harness).
import { expect, test } from '@playwright/test';
import { MEDIA_HARNESS_PORT } from './support/ports';

const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;

test.describe('codec probe (harness)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
    await expect(page.locator('#out')).toHaveText('ready');
  });

  test('F-023.R4 the start-up probe passes on this engine within 300 ms and makes no request', async ({ page }) => {
    await page.evaluate(() => window.harness.capabilities()); // cold run: codec libraries load
    await page.waitForLoadState('networkidle'); // the dev server's module loads are done
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    const caps = await page.evaluate(() => window.harness.capabilities());
    expect(caps.missing).toEqual([]);
    expect(caps.decode).toContain('h264');
    expect(caps.encode.h264 || caps.encode.vp9 || caps.encode.vp8).toBe(true);
    expect(caps.ms).toBeLessThanOrEqual(300);
    expect(requests).toEqual([]);
  });

  test('ADR-0004 the export grid is probed for the chosen codec and includes 1080p30', async ({ page }) => {
    const grid = await page.evaluate(() => window.harness.exportGrid('h264'));
    expect(grid).toHaveLength(20);
    expect(grid.find((c) => c.short === 1080 && c.rate === 30)?.supported).toBe(true);
  });

  test('ADR-0004 a trial video encode records the working latency mode and acceleration', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000);
    const t = await page.evaluate(() => window.harness.trialVideo('h264'));
    expect(t.ok).toBe(true);
    // WebKit's H.264 encoder emits nothing in 'quality' mode: the 2 s fallback to 'realtime' (item 6).
    expect(t.latencyMode).toBe(browserName === 'webkit' ? 'realtime' : 'quality');
    expect(['no-preference', 'prefer-software']).toContain(t.acceleration);
    expect(t.bitrateModes).toContain('variable');
    expect(t.chunks).toBeGreaterThan(0);
    test.info().annotations.push({ type: 'trial', description: JSON.stringify(t) });
  });

  test('ADR-0004 an AAC trial encode measures the encoder delay and the delivered rate', async ({
    page,
    browserName,
  }) => {
    const t = await page.evaluate(() => window.harness.trialAudio('aac'));
    expect(t.ok).toBe(true);
    expect(t.encoderDelay).toBe(2112); // measured in every engine by SP-codec
    // WebKit's ES_Descriptor description is reduced to the AudioSpecificConfig (item 4).
    expect(t.descriptionNormalised).toBe(browserName === 'webkit');
    expect(t.deliveredKbps).toBeGreaterThan(32);
    test.info().annotations.push({ type: 'trial', description: JSON.stringify(t) });
  });
});
